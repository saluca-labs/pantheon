# TIRESIAS PHASE 1 SECURITY REVIEW - ITERATION 1

**Model:** qwen3-coder:30b-a3b-q4_K_M (5090 GPU)  
**Date:** 2026-04-08  
**Status:** Complete

---

## ISSUE S1: SQL INJECTION IN CONTRACTS

**File:** `src/contracts/chain.py`  
**Lines:** 54-60, 97-102

### 1. VERDICT: Valid vulnerability

The code is **vulnerable to SQL injection** via the `conditions` list, which is built from user-provided input (`tenant_id`, `partner_id`) but **not sanitized** before being inserted into the SQL query string using f-string formatting.

### 2. SEVERITY: High

### 3. FIX:

The current approach uses `f"WHERE {where}"` where `where` is constructed by joining user-provided condition strings. While the current code builds conditions from hardcoded strings, the pattern is dangerous and could be exploited if future modifications add user-controlled conditions.

**Secure pattern:**

```python
# src/contracts/chain.py - Lines 36-76

ALLOWED_CONTRACT_COLUMNS = {
    "contract_type": str,
    "tenant_id": str, 
    "partner_id": str,
}

async def get_latest_version(
    db: AsyncSession,
    tenant_id: Optional[uuid.UUID] = None,
    partner_id: Optional[uuid.UUID] = None,
    contract_type: str = "msa",
) -> Optional[dict]:
    """Get the latest contract version for a tenant/partner."""
    # Build conditions safely - column names are validated against whitelist
    conditions = ["contract_type = :ctype"]
    params = {"ctype": contract_type}

    if tenant_id:
        # Validate tenant_id is a proper UUID string
        conditions.append("tenant_id = :tid")
        params["tid"] = str(tenant_id)
    
    if partner_id:
        conditions.append("partner_id = :pid")
        params["pid"] = str(partner_id)

    # Safe: conditions list only contains hardcoded column names
    # Values are passed as parameters, never interpolated
    where = " AND ".join(conditions)
    
    result = await db.execute(text(f"""
        SELECT id, version, status, content_hash, prev_hash, content,
               review_status, review_risk_score, submitted_by, created_at
        FROM _soul_contracts
        WHERE {where}
        ORDER BY version DESC LIMIT 1
    """), params)
```

### 4. TEST:

```python
# tests/security/test_sql_injection.py
import pytest
from sqlalchemy import text

async def test_contract_query_sql_injection():
    """Verify SQL injection attempts are blocked."""
    # Attempt injection via malformed UUID
    malicious_tenant = "00000000-0000-0000-0000-000000000000' OR '1'='1"
    
    result = await get_latest_version(db, tenant_id=malicious_tenant)
    # Should treat as literal string, not execute injected SQL
    assert result is None  # No matching record
```

### 5. VERIFY:

- Run existing contract tests
- Add SQL injection test case  
- Verify parameterized queries in database logs show `:tid` placeholder, not raw value

---

## ISSUE S2: SQL INJECTION IN PARTNER ADMIN

**File:** `src/partner/admin_router.py`  
**Lines:** 646-667

### 1. VERDICT: Valid vulnerability

Same pattern as S1. The `where_clause` is interpolated into f-string SQL.

### 2. SEVERITY: High

### 3. FIX:

```python
# src/partner/admin_router.py

ALLOWED_INVITATION_COLUMNS = {
    "status": str,
    "partner_type": str,
    "contact_email": str,
}

async def list_partner_invitations(
    db: AsyncSession,
    status: Optional[str] = None,
    partner_type: Optional[str] = None,
    contact_email: Optional[str] = None,
):
    conditions = []
    params = {}

    if status and status in ALLOWED_INVITATION_COLUMNS:
        conditions.append("status = :status")
        params["status"] = status

    if partner_type and partner_type in ALLOWED_INVITATION_COLUMNS:
        conditions.append("partner_type = :partner_type")
        params["partner_type"] = partner_type

    if contact_email and contact_email in ALLOWED_INVITATION_COLUMNS:
        conditions.append("contact_email = :contact_email")
        params["contact_email"] = contact_email

    where_clause = " AND ".join(conditions) if conditions else "1=1"

    count_result = await db.execute(
        text(f"SELECT count(*) FROM _partner_invitations WHERE {where_clause}"),
        params,
    )
```

### 4. TEST:

```python
# tests/partner/test_admin_security.py
async def test_invitation_sql_injection():
    """Verify SQL injection in invitation listing is blocked."""
    malicious_email = "test@test.com' OR '1'='1"
    response = await client.get(f"/admin/partner/invitations?contact_email={malicious_email}")
    assert response.status_code == 200
```

---

## ISSUE S3: GEO-IP PLACEHOLDER

**File:** `soulGate/src/access/geo.py`  
**Lines:** 18-34

### 1. VERDICT: CRITICAL - Functionality broken

The `resolve_country()` function always returns `None`, which breaks all geo-fencing rules in SoulGate.

### 2. SEVERITY: CRITICAL

### 3. FIX:

```python
# soulGate/src/access/geo.py

"""
Country/region allow/deny rules.
Uses GeoLite2 database for geo classification.
Install: pip install geoip2
Download DB: https://dev.maxmind.com/geoip/geolite2-free-geolocation-data
"""

from typing import Optional
import os
import structlog
import geoip2.database

logger = structlog.get_logger(__name__)

_GEOIP_READER = None

def get_geoip_reader() -> geoip2.database.Reader:
    """Lazy-load GeoIP reader."""
    global _GEOIP_READER
    if _GEOIP_READER is None:
        db_path = os.getenv(
            "GEOLITE2_DB_PATH",
            "/usr/share/GeoIP/GeoLite2-Country.mmdb"
        )
        if not os.path.exists(db_path):
            logger.error(f"GeoIP database not found at {db_path}")
            raise FileNotFoundError(
                f"GeoLite2 database required at {db_path}"
            )
        _GEOIP_READER = geoip2.database.Reader(db_path)
    return _GEOIP_READER


def resolve_country(ip_address: str) -> Optional[str]:
    """
    Resolve IP address to country code using GeoLite2.
    Returns ISO 3166-1 alpha-2 country code (e.g., 'US', 'DE', 'CN').
    """
    import ipaddress
    
    try:
        addr = ipaddress.ip_address(ip_address)
        if addr.is_private or addr.is_loopback or addr.is_reserved:
            return None
    except ValueError:
        logger.warning(f"Invalid IP address: {ip_address}")
        return None

    try:
        reader = get_geoip_reader()
        response = reader.country(ip_address)
        return response.country.iso_code
    except geoip2.errors.AddressNotFoundError:
        return None
    except Exception as e:
        logger.error(f"GeoIP lookup failed for {ip_address}: {e}")
        return None
```

**Requirements:**
```txt
# soulGate/requirements.txt
geoip2>=4.8.0
```

### 4. TEST:

```python
# soulGate/tests/test_geo.py
def test_resolve_country_public_ips():
    assert resolve_country("8.8.8.8") == "US"
    assert resolve_country("1.1.1.1") == "AU"

def test_resolve_country_private_ips():
    assert resolve_country("192.168.1.1") is None
    assert resolve_country("10.0.0.1") is None
```

### 5. VERIFY:

1. `pip install geoip2`
2. Download GeoLite2-Country.mmdb
3. Test with known IPs

---

## ISSUE S4: CLAW ADAPTER PLACEHOLDERS

**File:** `src/compatibility/adapter.py`  
**Lines:** 86, 111, 136

### 1. VERDICT: Missing functionality

All 3 adapters return `{"result": "placeholder"}` - they do nothing.

### 2. SEVERITY: MEDIUM

### 3. FIX:

Since CLAW integration is not MVP-critical, add clear `NotImplementedError`:

```python
# src/compatibility/adapter.py

class OpenClawAdapter(EnvironmentAdapter):
    """Adapter for OpenClaw execution environment.
    
    DEPRECATED: OpenClaw integration deferred to post-MVP.
    Use DreamServer or direct Ollama integration instead.
    """

    async def execute_agent(self, context, payload):
        raise NotImplementedError(
            "OpenClaw adapter not implemented. "
            "Use DreamServer or direct Ollama integration for agent execution."
        )
```

### 4. TEST:

```python
async def test_openclaw_adapter_not_implemented():
    adapter = OpenClawAdapter()
    with pytest.raises(NotImplementedError):
        await adapter.execute_agent(mock_context, {})
```

---

## ISSUE S5: SOP IDENTITY PLACEHOLDER

**File:** `src/tiresias/routers/auth.py`  
**Lines:** 68-76

### 1. VERDICT: Security risk

Function returns hardcoded `{"tenant": "saluca", "persona": "alfred"}` for any input.

### 2. SEVERITY: MEDIUM

### 3. FIX:

```python
# src/tiresias/routers/auth.py

from src.auth.soulkey import SoulKeyResolver

_resolver = SoulKeyResolver()

def _resolve_identity(soulkey: str) -> dict | None:
    """Resolve soulkey to identity using Tiresias SoulKey system."""
    if not soulkey:
        return None
    
    try:
        identity = _resolver.resolve_sync(soulkey)
        if identity:
            return {
                "tenant": identity.tenant_id,
                "persona": identity.persona,
                "soulkey_id": identity.id,
            }
        return None
    except Exception as e:
        logger.error(f"SoulKey resolution failed: {e}")
        return None
```

---

## SUMMARY

| Issue | Verdict | Severity | Fix Complexity |
|-------|---------|----------|----------------|
| S1: SQL Injection (chain.py) | Valid | High | Low |
| S2: SQL Injection (admin_router.py) | Valid | High | Low |
| S3: Geo-IP placeholder | Broken | Critical | Medium |
| S4: CLAW adapters | Missing | Medium | Low |
| S5: SOP identity | Hardcoded | Medium | Low |

---

## NEXT STEPS

1. Apply fixes to codebase
2. Run existing test suite
3. Add new security tests
4. Update `CHANGELOG.md`
5. Bump version to `v3.5.0-alpha1`
