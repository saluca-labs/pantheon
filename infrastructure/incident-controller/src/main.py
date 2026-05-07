"""Tiresias Incident Controller — FastAPI application entry point.

Receives Grafana unified alerting webhooks, correlates alerts into incidents,
and exposes a REST API for incident lifecycle management.
"""

import json
import logging
import logging.config
import os
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Any

import yaml
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.detector.alert_receiver import AlertReceiver
from src.detector.classifier import Classifier
from src.detector.correlator import Correlator
from src.models.incident import Incident, IncidentStatus

# ---------------------------------------------------------------------------
# Logging — structured JSON to stdout
# ---------------------------------------------------------------------------

LOGGING_CONFIG: dict[str, Any] = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {
            "()": "pythonjsonlogger.jsonlogger.JsonFormatter",
            "format": "%(asctime)s %(name)s %(levelname)s %(message)s",
        },
        "standard": {
            "format": "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "standard",
            "stream": "ext://sys.stdout",
        },
    },
    "root": {
        "level": "INFO",
        "handlers": ["console"],
    },
}

# Try structured JSON logging; fall back to standard if dependency missing
try:
    import pythonjsonlogger  # noqa: F401
    LOGGING_CONFIG["handlers"]["console"]["formatter"] = "json"
except ImportError:
    pass

logging.config.dictConfig(LOGGING_CONFIG)
logger = logging.getLogger("tiresias.main")


# ---------------------------------------------------------------------------
# Incident store — in-memory + JSON file persistence
# ---------------------------------------------------------------------------

class IncidentStore:
    """Thread-safe(ish) in-memory incident store backed by a JSON file."""

    def __init__(self, persist_path: str = "/data/incidents.json") -> None:
        self._incidents: dict[str, Incident] = {}
        self._persist_path = Path(persist_path)

    # -- persistence -------------------------------------------------------

    def load(self) -> None:
        """Load incidents from the JSON persistence file."""
        if not self._persist_path.exists():
            logger.info("no_persisted_incidents", extra={"path": str(self._persist_path)})
            return
        try:
            with open(self._persist_path, "r", encoding="utf-8") as fh:
                raw: list[dict] = json.load(fh)
            for entry in raw:
                incident = Incident.model_validate(entry)
                self._incidents[incident.id] = incident
            logger.info(
                "incidents_loaded",
                extra={"count": len(self._incidents), "path": str(self._persist_path)},
            )
        except Exception:
            logger.exception("incident_load_failed")

    def _persist(self) -> None:
        """Write current incidents to the JSON file."""
        try:
            self._persist_path.parent.mkdir(parents=True, exist_ok=True)
            with open(self._persist_path, "w", encoding="utf-8") as fh:
                json.dump(
                    [inc.model_dump(mode="json") for inc in self._incidents.values()],
                    fh,
                    indent=2,
                    default=str,
                )
        except Exception:
            logger.exception("incident_persist_failed")

    # -- CRUD --------------------------------------------------------------

    def add(self, incident: Incident) -> None:
        self._incidents[incident.id] = incident
        self._persist()

    def get(self, incident_id: str) -> Incident | None:
        return self._incidents.get(incident_id)

    def list_all(self) -> list[Incident]:
        return list(self._incidents.values())

    def update(self, incident: Incident) -> None:
        self._incidents[incident.id] = incident
        self._persist()


# ---------------------------------------------------------------------------
# Configuration loader
# ---------------------------------------------------------------------------

CONFIG_DIR = Path(__file__).resolve().parent / "config"


def _load_yaml(name: str) -> dict:
    path = CONFIG_DIR / name
    if not path.exists():
        logger.warning("config_file_missing", extra={"path": str(path)})
        return {}
    with open(path, "r", encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


# ---------------------------------------------------------------------------
# Application globals (populated on startup)
# ---------------------------------------------------------------------------

store = IncidentStore(
    persist_path=os.getenv("INCIDENTS_JSON_PATH", "/data/incidents.json"),
)
alert_receiver = AlertReceiver()
correlator: Correlator | None = None
classifier = Classifier()


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    global correlator

    logger.info("startup_begin")

    # Load configs
    _load_yaml("notifications.yaml")
    _load_yaml("playbooks.yaml")

    correlations_path = str(CONFIG_DIR / "correlations.yaml")
    correlator = Correlator(rules_path=correlations_path)

    # Restore persisted incidents
    store.load()

    logger.info("startup_complete")
    yield
    logger.info("shutdown")


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Tiresias Incident Controller",
    version="0.1.0",
    description="Automated incident detection, correlation, and response.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/api/v1/health")
async def health():
    """Liveness / readiness probe."""
    return {
        "status": "healthy",
        "service": "tiresias-incident-controller",
        "timestamp": datetime.utcnow().isoformat(),
        "incident_count": len(store.list_all()),
    }


@app.post("/api/v1/alert")
async def receive_alert(request: Request):
    """Receive a Grafana unified alerting webhook payload.

    Parses the alerts, runs correlation, and — if a rule matches — creates a
    new incident.
    """
    payload: dict = await request.json()

    # 1. Parse
    alerts = alert_receiver.parse_grafana_alert(payload)
    if not alerts:
        return JSONResponse(
            status_code=200,
            content={"accepted": True, "incidents_created": 0},
        )

    # 2. Handle resolved alerts — update existing incidents
    resolved = [a for a in alerts if a.status == "resolved"]
    for alert in resolved:
        for incident in store.list_all():
            matching = any(
                sa.get("fingerprint") == alert.fingerprint
                for sa in incident.source_alerts
            )
            if matching and incident.status == IncidentStatus.ACTIVE:
                logger.info(
                    "alert_resolved_auto",
                    extra={"incident_id": incident.id, "fingerprint": alert.fingerprint},
                )

    # 3. Correlate firing alerts
    firing = [a for a in alerts if a.status == "firing"]
    incidents_created: list[dict] = []

    if firing and correlator is not None:
        result = correlator.correlate(firing)
        if result is not None:
            incident_type, severity = result
            incident = classifier.classify(incident_type, severity, firing)
            store.add(incident)
            incidents_created.append({"id": incident.id, "type": incident.type.value})
            logger.info(
                "incident_created",
                extra={"incident_id": incident.id, "type": incident.type.value},
            )

    return JSONResponse(
        status_code=200,
        content={
            "accepted": True,
            "alerts_received": len(alerts),
            "incidents_created": len(incidents_created),
            "incidents": incidents_created,
        },
    )


@app.get("/api/v1/incidents")
async def list_incidents():
    """Return all known incidents."""
    incidents = store.list_all()
    return {
        "count": len(incidents),
        "incidents": [inc.model_dump(mode="json") for inc in incidents],
    }


@app.get("/api/v1/incidents/{incident_id}")
async def get_incident(incident_id: str):
    """Return a single incident by ID."""
    incident = store.get(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail=f"Incident {incident_id} not found")
    return incident.model_dump(mode="json")


@app.post("/api/v1/incidents/{incident_id}/resolve")
async def resolve_incident(incident_id: str, request: Request):
    """Manually resolve an incident."""
    incident = store.get(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail=f"Incident {incident_id} not found")

    if incident.status == IncidentStatus.RESOLVED:
        return {"message": "Incident already resolved", "incident_id": incident_id}

    body: dict = {}
    try:
        body = await request.json()
    except Exception:
        pass

    incident.status = IncidentStatus.RESOLVED
    incident.resolved_at = datetime.utcnow()
    incident.resolved_by = body.get("resolved_by", "manual")

    incident.add_timeline_entry(
        source="incident_controller",
        event_type="incident_resolved",
        description=f"Incident manually resolved by {incident.resolved_by}",
    )

    store.update(incident)

    logger.info(
        "incident_resolved",
        extra={
            "incident_id": incident_id,
            "resolved_by": incident.resolved_by,
        },
    )

    return {
        "message": "Incident resolved",
        "incident_id": incident_id,
        "resolved_at": incident.resolved_at.isoformat(),
    }
