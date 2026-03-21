"""
Core event processing pipeline for SoulWatch.
Ingest -> Detect -> Respond -> Forward -> Broadcast.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from soulWatch.src.analytics._state import get_detector, get_alert_router
from soulWatch.src.analytics.detector import Anomaly
from soulWatch.src.database.models import SoulWatchDetection
from soulWatch.src.detection._state import get_sigma_engine, get_playbook_engine
from soulWatch.src.enforcement.quarantine import QuarantineEngine
from soulWatch.src.integrations.cef import AuditEvent
from soulWatch.src.integrations.forwarder import get_event_forwarder
from soulWatch.src.monitoring.metrics import (
    EVENTS_PROCESSED_TOTAL,
    DETECTIONS_TOTAL,
    PIPELINE_DURATION,
)

logger = structlog.get_logger(__name__)

# Module-level reference to quarantine engine
_quarantine_engine: Optional[QuarantineEngine] = None


def set_quarantine_engine(engine: QuarantineEngine):
    global _quarantine_engine
    _quarantine_engine = engine


def get_quarantine_engine_ref() -> Optional[QuarantineEngine]:
    return _quarantine_engine


# Module-level reference to websocket manager
_ws_manager = None


def set_ws_manager(manager):
    global _ws_manager
    _ws_manager = manager




async def _handle_tool_invocation(event: dict, db: AsyncSession) -> dict:
    """Persist a tool_invocation event from tiresias-exec."""
    from soulWatch.src.database.models import AletheiaToolInvocation
    from datetime import datetime, timezone

    execution = event.get("execution", {})
    policy = event.get("policy", {})
    sanitizer = event.get("sanitizer", {})

    record = AletheiaToolInvocation(
        tenant_id=uuid.UUID(str(event["tenant_id"])) if event.get("tenant_id") else None,
        invocation_id=event.get("invocation_id", f"inv_{uuid.uuid4().hex[:12]}"),
        agent_id=event.get("agent_id"),
        timestamp=(
            datetime.fromisoformat(event["timestamp"])
            if event.get("timestamp")
            else datetime.now(timezone.utc)
        ),
        command=event.get("command", "unknown"),
        args=event.get("args", []),
        full_command=event.get("full_command", ""),
        working_directory=event.get("working_directory"),
        exit_code=execution.get("exit_code"),
        duration_ms=execution.get("duration_ms"),
        stdout_bytes=execution.get("stdout_bytes", 0),
        stderr_bytes=execution.get("stderr_bytes", 0),
        stdout_hash=execution.get("stdout_hash"),
        stderr_hash=execution.get("stderr_hash"),
        policy_verdict=policy.get("verdict"),
        policy_rule_matched=", ".join(policy.get("rules_matched", [])) or None,
        sanitizer_mode=sanitizer.get("mode"),
        sanitizer_verdict=sanitizer.get("verdict"),
        patterns_matched=sanitizer.get("patterns_matched", []),
        environment_hash=event.get("environment_hash"),
    )
    db.add(record)
    logger.info(
        "pipeline.tool_invocation_persisted",
        invocation_id=record.invocation_id,
        command=record.command,
    )
    return {"persisted": True, "invocation_id": record.invocation_id}

async def process_event(event: dict, db: AsyncSession) -> dict:
    """
    Process a single audit event through the full SoulWatch pipeline.

    Steps:
    1. Run anomaly detection
    2. Run Sigma rules
    3. Execute playbooks for matches
    4. Check quarantine thresholds
    5. Forward to SIEM
    6. Broadcast via WebSocket

    Returns a summary dict of what happened.
    """
    import time
    start = time.perf_counter()

    result = {
        "anomalies": [],
        "detections": [],
        "playbook_results": [],
        "quarantine_triggered": False,
        "forwarded": False,
    }

    # Route tool_invocation events to dedicated handler + continue pipeline
    event_type = event.get("event_type")
    if event_type == "tool_invocation":
        try:
            tool_result = await _handle_tool_invocation(event, db)
            result["tool_invocation"] = tool_result
        except Exception as e:
            logger.error("pipeline.tool_invocation_persist_failed", error=str(e))

    # 1. Run anomaly detection
    detector = get_detector()
    anomalies: list[Anomaly] = []
    if detector:
        try:
            anomalies = await detector.check_event(event, db)
            result["anomalies"] = [a.to_dict() for a in anomalies]
        except Exception as e:
            logger.error("pipeline.anomaly_detection_failed", error=str(e))

    # Route anomaly alerts
    alert_router = get_alert_router()
    if alert_router and anomalies:
        for anomaly in anomalies:
            try:
                await alert_router.route(anomaly)
            except Exception as e:
                logger.error("pipeline.alert_routing_failed", error=str(e))

    # 2. Run Sigma rules
    sigma_engine = get_sigma_engine()
    matches = []
    if sigma_engine:
        try:
            matches = sigma_engine.evaluate(event)
            for match in matches:
                # Persist detection to DB
                detection_record = SoulWatchDetection(
                    rule_id=match.rule.id,
                    rule_title=match.rule.title,
                    level=match.rule.level,
                    soulkey_id=uuid.UUID(str(event["soulkey_id"])) if event.get("soulkey_id") else None,
                    tenant_id=uuid.UUID(str(event["tenant_id"])) if event.get("tenant_id") else None,
                    matched_fields=match.matched_fields,
                    event_data=event,
                    response_playbook=match.rule.response_playbook,
                )
                db.add(detection_record)

                DETECTIONS_TOTAL.labels(
                    rule_id=match.rule.id,
                    level=match.rule.level,
                ).inc()

            result["detections"] = [m.to_dict() for m in matches]
        except Exception as e:
            logger.error("pipeline.sigma_evaluation_failed", error=str(e))

    # 3. Execute playbooks for matches
    playbook_engine = get_playbook_engine()
    if playbook_engine and matches:
        for match in matches:
            if match.rule.response_playbook:
                try:
                    pb_result = await playbook_engine.execute_playbook(
                        match.rule.response_playbook, match
                    )
                    result["playbook_results"].append(pb_result.to_dict())
                except Exception as e:
                    logger.error("pipeline.playbook_execution_failed", error=str(e))

    # 4. Check quarantine thresholds
    quarantine_engine = get_quarantine_engine_ref()
    if quarantine_engine and anomalies:
        for anomaly in anomalies:
            try:
                qr = await quarantine_engine.evaluate_and_respond(db, anomaly)
                if qr.triggered:
                    result["quarantine_triggered"] = True
            except Exception as e:
                logger.error("pipeline.quarantine_evaluation_failed", error=str(e))

    # 5. Forward to SIEM
    forwarder = get_event_forwarder()
    if forwarder:
        try:
            audit_event = AuditEvent.from_dict(event)
            forwarder.forward(audit_event)
            result["forwarded"] = True
        except Exception as e:
            logger.error("pipeline.siem_forward_failed", error=str(e))

    # 6. Broadcast via WebSocket
    if _ws_manager and (anomalies or matches):
        try:
            broadcast_data = {
                "type": "pipeline_event",
                "anomalies": [a.to_dict() for a in anomalies],
                "detections": [m.to_dict() for m in matches],
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            await _ws_manager.broadcast(broadcast_data)
        except Exception as e:
            logger.debug("pipeline.ws_broadcast_failed", error=str(e))

    # Flush detection records
    try:
        await db.flush()
    except Exception as e:
        logger.error("pipeline.db_flush_failed", error=str(e))

    # Metrics
    EVENTS_PROCESSED_TOTAL.inc()
    duration = time.perf_counter() - start
    PIPELINE_DURATION.observe(duration)

    if anomalies or matches:
        logger.info(
            "pipeline.event_processed",
            anomalies=len(anomalies),
            detections=len(matches),
            duration_ms=round(duration * 1000, 2),
        )

    return result
