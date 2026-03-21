"""
Geo Threat Enricher for SoulWatch.

Reads World Monitor CII scores + conflict data from a Redis instance
and enriches SoulWatch audit events with geopolitical risk context.

Internal Saluca ops tooling — not customer-facing.

PRIVACY MODEL:
    Geo enrichment is CONSENT-GATED. Three modes:
    - "internal"  : Only Saluca's own agent traffic. No customer data touched.
    - "opt_in"    : Customer explicitly consents to geo enrichment (tenant setting).
    - "compliance" : Geo enrichment required by jurisdiction (e.g., EU NIS2, US CISA).
                     Enabled per-tenant when compliance mandate applies.
    Default: "internal" — customer events are NEVER geo-enriched without consent.

Configuration via environment variables:
    GEO_ENRICHER_ENABLED=true
    GEO_ENRICHER_REDIS_URL=redis://100.92.149.12:6379  (DreamServer World Monitor)
    GEO_ENRICHER_CACHE_TTL=60
    GEO_ENRICHER_MODE=internal  (internal | opt_in | compliance)
"""

import json
import math
import os
import time
from dataclasses import dataclass, field
from typing import Optional

import structlog

logger = structlog.get_logger(__name__)

# Friendly baseline: NATO/Five Eyes/allies — suppress domestic noise
FRIENDLY_BASELINE = frozenset({
    "US", "GB", "CA", "AU", "NZ",  # Five Eyes
    "DE", "FR", "IT", "ES", "NL", "BE",  # EU core
    "JP", "KR", "PL", "NO", "DK", "SE", "FI",  # Allies
    "CH", "AT", "IE", "PT",  # Neutral low-risk
})

# Approximate population (millions) for event rate normalization
POPULATION_M = {
    "US": 335, "UA": 37, "IR": 88, "SY": 22, "RU": 144, "CH": 9,
    "KP": 26, "AF": 41, "CD": 100, "ET": 126, "IL": 9, "IQ": 44,
    "MM": 55, "MX": 130, "NG": 224, "PK": 230, "SA": 36, "SD": 47,
    "SO": 18, "TR": 85, "VE": 29, "YE": 34, "PH": 115, "ML": 22,
    "BF": 22, "CM": 28, "IN": 1428, "BD": 170, "TW": 24, "PL": 37,
    "CO": 52, "GB": 67, "DE": 84, "FR": 68, "IT": 59, "ES": 48,
    "JP": 125, "KR": 52, "BR": 216, "CA": 40, "AU": 26, "NZ": 5,
    "EG": 105, "NL": 18, "BE": 12, "NO": 5, "DK": 6, "SE": 10,
    "FI": 6, "AT": 9, "IE": 5, "PT": 10, "CU": 11, "LB": 5,
    "QA": 3, "AE": 10,
}

CII_KEY_LIVE = "risk:scores:sebuf:v1"
CII_KEY_STALE = "risk:scores:sebuf:stale:v1"
CONFLICT_PREFIX = "conflict:humanitarian:v1:"
GDELT_KEY = "intel:pizzint:v1:gdelt"


@dataclass
class GeoContext:
    """Geo enrichment attached to a SoulWatch event."""
    region_code: str
    cii_score: float = 0.0
    cii_trend: str = "STABLE"
    conflict_events: int = 0
    conflict_fatalities: int = 0
    events_per_million: float = 0.0
    gdelt_defcon: int = 0
    risk_multiplier: float = 1.0
    friendly_baseline: bool = False

    def to_dict(self) -> dict:
        return {
            "region_code": self.region_code,
            "cii_score": self.cii_score,
            "cii_trend": self.cii_trend,
            "conflict_events": self.conflict_events,
            "conflict_fatalities": self.conflict_fatalities,
            "events_per_million": round(self.events_per_million, 2),
            "gdelt_defcon": self.gdelt_defcon,
            "risk_multiplier": round(self.risk_multiplier, 3),
            "friendly_baseline": self.friendly_baseline,
        }


class GeoThreatEnricher:
    """
    Enriches SoulWatch events with World Monitor geopolitical context.

    Multiplier formula (v2, tuned 2026-03-21):
        base = 1.0
        + (cii_score / 100) * 0.6
        + min(log2(1 + events_per_million), 1.0) * 0.4
        + 0.15 if fatalities > 0
        + 0.2  if trend RISING
        + 0.15 if gdelt_defcon >= 3
        - 0.3  if FRIENDLY_BASELINE
        floor 0.8x, cap 2.5x
    """

    def __init__(self):
        self._enabled = os.getenv("GEO_ENRICHER_ENABLED", "false").lower() == "true"
        self._redis_url = os.getenv("GEO_ENRICHER_REDIS_URL", "")
        self._cache_ttl = int(os.getenv("GEO_ENRICHER_CACHE_TTL", "60"))
        self._mode = os.getenv("GEO_ENRICHER_MODE", "internal")  # internal | opt_in | compliance

        # Saluca's own tenant ID — always enriched in internal mode
        self._saluca_tenant = os.getenv(
            "SALUCA_TENANT_ID", "ac6b4247-03ee-4c45-b9ea-06a4aaceeb75"
        )
        # Tenants that have opted in or are compliance-required (loaded from DB at startup)
        self._consented_tenants: set[str] = set()
        self._compliance_tenants: set[str] = set()
        self._redis = None
        self._cii_cache: dict[str, dict] = {}
        self._gdelt_cache: dict = {}
        self._cache_ts: float = 0

        if self._enabled and self._redis_url:
            try:
                import redis as redis_lib
                self._redis = redis_lib.Redis.from_url(
                    self._redis_url, decode_responses=True, socket_timeout=2
                )
                self._redis.ping()
                logger.info("geo_enricher.connected", redis_url=self._redis_url)
            except Exception as e:
                logger.warning("geo_enricher.redis_connect_failed", error=str(e))
                self._redis = None
        elif self._enabled:
            logger.warning("geo_enricher.no_redis_url")
        else:
            logger.info("geo_enricher.disabled")

    @property
    def enabled(self) -> bool:
        return self._enabled and self._redis is not None

    def _refresh_cache(self):
        if not self._redis:
            return
        now = time.time()
        if now - self._cache_ts < self._cache_ttl:
            return
        try:
            raw = self._redis.get(CII_KEY_LIVE) or self._redis.get(CII_KEY_STALE)
            if raw:
                data = json.loads(raw)
                self._cii_cache = {s["region"]: s for s in data.get("ciiScores", [])}

            gdelt_raw = self._redis.get(GDELT_KEY)
            if gdelt_raw:
                self._gdelt_cache = json.loads(gdelt_raw).get("pizzint", {})

            self._cache_ts = now
        except Exception as e:
            logger.warning("geo_enricher.cache_refresh_failed", error=str(e))

    def _get_conflict(self, region: str) -> dict:
        if not self._redis:
            return {}
        try:
            raw = self._redis.get(f"{CONFLICT_PREFIX}{region}")
            if raw:
                return json.loads(raw).get("summary", {})
        except Exception:
            pass
        return {}

    def enrich(self, region_code: str) -> GeoContext:
        """Compute geo threat context for a region."""
        self._refresh_cache()
        rc = region_code.upper()
        ctx = GeoContext(region_code=rc)

        cii = self._cii_cache.get(rc, {})
        ctx.cii_score = cii.get("combinedScore", 0)
        ctx.cii_trend = cii.get("trend", "STABLE").replace("TREND_DIRECTION_", "")

        conflict = self._get_conflict(rc)
        ctx.conflict_events = conflict.get("conflictEventsTotal", 0)
        ctx.conflict_fatalities = conflict.get("conflictFatalities", 0)

        pop = POPULATION_M.get(rc, 50)
        ctx.events_per_million = ctx.conflict_events / pop

        ctx.gdelt_defcon = self._gdelt_cache.get("defconLevel", 0)
        ctx.friendly_baseline = rc in FRIENDLY_BASELINE

        # Compute multiplier
        mult = 1.0
        mult += (ctx.cii_score / 100) * 0.6
        mult += min(math.log2(1 + ctx.events_per_million), 1.0) * 0.4
        if ctx.conflict_fatalities > 0:
            mult += 0.15
        if ctx.cii_trend == "RISING":
            mult += 0.2
        if ctx.gdelt_defcon >= 3:
            mult += 0.15
        if ctx.friendly_baseline:
            mult -= 0.3
        ctx.risk_multiplier = max(0.8, min(mult, 2.5))

        return ctx

    def _tenant_allowed(self, tenant_id: Optional[str]) -> bool:
        """Check if geo enrichment is permitted for this tenant."""
        if not tenant_id:
            return False

        # Internal mode: only Saluca's own traffic
        if self._mode == "internal":
            return tenant_id == self._saluca_tenant

        # Opt-in mode: Saluca + explicitly consented tenants
        if self._mode == "opt_in":
            return (
                tenant_id == self._saluca_tenant
                or tenant_id in self._consented_tenants
            )

        # Compliance mode: Saluca + consented + compliance-required tenants
        if self._mode == "compliance":
            return (
                tenant_id == self._saluca_tenant
                or tenant_id in self._consented_tenants
                or tenant_id in self._compliance_tenants
            )

        return False

    def add_consented_tenant(self, tenant_id: str):
        """Register a tenant that has explicitly opted in to geo enrichment."""
        self._consented_tenants.add(tenant_id)
        logger.info("geo_enricher.tenant_consented", tenant_id=tenant_id)

    def add_compliance_tenant(self, tenant_id: str):
        """Register a tenant under compliance mandate for geo enrichment."""
        self._compliance_tenants.add(tenant_id)
        logger.info("geo_enricher.tenant_compliance", tenant_id=tenant_id)

    def remove_consent(self, tenant_id: str):
        """Remove a tenant's geo enrichment consent."""
        self._consented_tenants.discard(tenant_id)
        self._compliance_tenants.discard(tenant_id)
        logger.info("geo_enricher.tenant_consent_removed", tenant_id=tenant_id)

    def enrich_event(self, event: dict) -> dict:
        """
        Enrich a SoulWatch event dict with geo context.

        PRIVACY: Only enriches events from tenants that have consented
        or are under compliance mandate. Internal Saluca traffic is
        always enriched. All other events pass through untouched.
        """
        if not self.enabled:
            return event

        # Privacy gate: check tenant consent
        tenant_id = event.get("tenant_id")
        if not self._tenant_allowed(tenant_id):
            return event

        context = event.get("context") or {}
        region = (
            context.get("geo_region")
            or context.get("country_code")
            or context.get("source_country")
        )

        if not region:
            source_ip = context.get("source_ip", "")
            if source_ip:
                region = self._ip_to_region(source_ip)

        if not region:
            return event

        geo = self.enrich(region)

        if "context" not in event or event["context"] is None:
            event["context"] = {}
        event["context"]["geo_enrichment"] = geo.to_dict()

        if geo.risk_multiplier > 1.5:
            logger.info(
                "geo_enricher.elevated_risk",
                region=region,
                cii=geo.cii_score,
                multiplier=geo.risk_multiplier,
                event_type=event.get("event_type"),
            )

        return event

    def _ip_to_region(self, ip: str) -> Optional[str]:
        """
        Lightweight IP-to-region lookup.
        TODO: integrate MaxMind GeoLite2 for IP geolocation.
        For now, returns None (region must be in event context).
        """
        return None


# Module-level singleton
_enricher: Optional[GeoThreatEnricher] = None


def get_geo_enricher() -> GeoThreatEnricher:
    global _enricher
    if _enricher is None:
        _enricher = GeoThreatEnricher()
    return _enricher
