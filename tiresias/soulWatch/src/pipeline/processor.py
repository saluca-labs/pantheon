"""
Core event processing pipeline for SoulWatch.
Ingest -> Detect -> Respond -> Forward -> Broadcast.
"""

import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from soulWatch.src.analytics._state import get_detector, get_alert_router
from soulWatch.src.analytics.detector import Anomaly
from soulWatch.src.database.models import SoulWatchDetection
from soulWatch.src.detection._state import get_sigma_engine, get_playbook_engine
from soulWatch.src.enforcement.quarantine import QuarantineEngine
from soulWatch.src.integrations.cef import AuditEvent
from soulWatch.src.integrations.forwarder import get_event_forwarder
from soulWatch.src.integrations.geo_enricher import get_geo_enricher
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




def _require_tenant_id(event: dict, handler_name: str) -> Optional[uuid.UUID]:
    """
    Extract and validate tenant_id from an event dict.
    Returns a UUID on success; logs WARN and returns None if missing/invalid.
    """
    raw = event.get("tenant_id")
    if not raw:
        logger.warning(
            f"pipeline.{handler_name}.missing_tenant_id",
            event_type=event.get("event_type"),
        )
        return None
    try:
        return uuid.UUID(str(raw))
    except (ValueError, AttributeError):
        logger.warning(
            f"pipeline.{handler_name}.invalid_tenant_id",
            tenant_id=raw,
        )
        return None


async def _handle_tool_invocation(event: dict, db: AsyncSession) -> dict:
    """
    Persist a tool_invocation event to aletheia_tool_invocations.

    Guards:
    - WARN + skip if tenant_id is missing or invalid.
    - ON CONFLICT (invocation_id) DO NOTHING for idempotency.
    """
    from soulWatch.src.database.models import AletheiaToolInvocation

    tid = _require_tenant_id(event, "tool_invocation")
    if tid is None:
        return {"persisted": False, "reason": "missing_tenant_id"}

    execution = event.get("execution", {})
    policy = event.get("policy", {})
    sanitizer = event.get("sanitizer", {})

    invocation_id = event.get("invocation_id") or f"inv_{uuid.uuid4().hex[:12]}"

    # Use raw SQL INSERT with ON CONFLICT DO NOTHING so idempotent replays are safe.
    # Note: cast JSON columns with CAST(...AS json) not ::json to avoid asyncpg param
    # confusion with the :: operator in SQLAlchemy text() statements.
    stmt = text("""
        INSERT INTO aletheia_tool_invocations (
            id, tenant_id, invocation_id, agent_id, timestamp,
            command, args, full_command, working_directory,
            exit_code, duration_ms, stdout_bytes, stderr_bytes,
            stdout_hash, stderr_hash, policy_verdict, policy_rule_matched,
            sanitizer_mode, sanitizer_verdict, patterns_matched,
            environment_hash, created_at
        ) VALUES (
            :id, :tenant_id, :invocation_id, :agent_id, :timestamp,
            :command, CAST(:args AS json), :full_command, :working_directory,
            :exit_code, :duration_ms, :stdout_bytes, :stderr_bytes,
            :stdout_hash, :stderr_hash, :policy_verdict, :policy_rule_matched,
            :sanitizer_mode, :sanitizer_verdict, CAST(:patterns_matched AS json),
            :environment_hash, :created_at
        )
        ON CONFLICT (invocation_id) DO NOTHING
    """)

    ts = (
        datetime.fromisoformat(event["timestamp"])
        if event.get("timestamp")
        else datetime.now(timezone.utc)
    )
    now = datetime.now(timezone.utc)

    rules_matched = policy.get("rules_matched", [])
    rule_str = ", ".join(rules_matched) if rules_matched else None

    await db.execute(stmt, {
        "id": str(uuid.uuid4()),
        "tenant_id": str(tid),
        "invocation_id": invocation_id,
        "agent_id": event.get("agent_id"),
        "timestamp": ts,
        "command": event.get("command", "unknown"),
        "args": json.dumps(event.get("args", [])),
        "full_command": event.get("full_command", ""),
        "working_directory": event.get("working_directory"),
        "exit_code": execution.get("exit_code"),
        "duration_ms": execution.get("duration_ms"),
        "stdout_bytes": execution.get("stdout_bytes", 0),
        "stderr_bytes": execution.get("stderr_bytes", 0),
        "stdout_hash": execution.get("stdout_hash"),
        "stderr_hash": execution.get("stderr_hash"),
        "policy_verdict": policy.get("verdict"),
        "policy_rule_matched": rule_str,
        "sanitizer_mode": sanitizer.get("mode"),
        "sanitizer_verdict": sanitizer.get("verdict"),
        "patterns_matched": json.dumps(sanitizer.get("patterns_matched", [])),
        "environment_hash": event.get("environment_hash"),
        "created_at": now,
    })

    logger.info(
        "pipeline.tool_invocation_persisted",
        invocation_id=invocation_id,
        command=event.get("command"),
        tenant_id=str(tid),
    )
    return {"persisted": True, "invocation_id": invocation_id}


def _compute_cot_hashes(
    tenant_id: str,
    chain_id: str,
    entry_index: int,
    request_id: str,
    timestamp: str,
    model: str,
    provider: str,
    cot_content: str,
    prev_hash: str,
) -> tuple[str, str]:
    """
    Compute (cot_hash, entry_hash) for a CoT chain entry.

    cot_hash  = SHA-256 of the raw CoT content bytes.
    entry_hash = SHA-256 of canonical JSON of the entry metadata + cot_hash + prev_hash,
                 forming the tamper-evident hash chain.
    """
    cot_hash = hashlib.sha256(cot_content.encode("utf-8", errors="replace")).hexdigest()
    entry_payload = json.dumps({
        "tenant_id": tenant_id,
        "chain_id": chain_id,
        "entry_index": entry_index,
        "request_id": request_id,
        "timestamp": timestamp,
        "model": model,
        "provider": provider,
        "cot_hash": cot_hash,
        "prev_hash": prev_hash,
    }, sort_keys=True)
    entry_hash = hashlib.sha256(entry_payload.encode("utf-8")).hexdigest()
    return cot_hash, entry_hash


async def _handle_cot_event(event: dict, db: AsyncSession) -> dict:
    """
    Persist a cot_turn event to aletheia_cot_chain.

    Expected event fields (all from tiresias-proxy cot_turn payload):
      tenant_id, chain_id, entry_index, request_id, timestamp,
      model, provider, agent_id, cot_content (raw text), prev_hash

    Guards:
    - WARN + skip if tenant_id is missing or invalid.
    - ON CONFLICT (tenant_id, chain_id, entry_index) DO NOTHING for idempotency.
    """
    tid = _require_tenant_id(event, "cot_event")
    if tid is None:
        return {"persisted": False, "reason": "missing_tenant_id"}

    chain_id_str = event.get("chain_id") or str(uuid.uuid4())
    entry_index = int(event.get("entry_index", 0))
    request_id_str = event.get("request_id") or str(uuid.uuid4())

    try:
        chain_id = uuid.UUID(chain_id_str)
    except (ValueError, AttributeError):
        chain_id = uuid.uuid4()

    try:
        request_id = uuid.UUID(request_id_str)
    except (ValueError, AttributeError):
        request_id = uuid.uuid4()

    ts_raw = event.get("timestamp") or datetime.now(timezone.utc).isoformat()
    try:
        ts = datetime.fromisoformat(ts_raw)
    except (ValueError, TypeError):
        ts = datetime.now(timezone.utc)

    model = event.get("model", "unknown")
    provider = event.get("provider", "unknown")
    cot_content = event.get("cot_content", "")
    prev_hash = event.get("prev_hash", "0" * 64)

    cot_token_count = event.get("cot_token_count", 0) or 0
    cot_byte_count = len(cot_content.encode("utf-8", errors="replace"))

    cot_hash, entry_hash = _compute_cot_hashes(
        tenant_id=str(tid),
        chain_id=str(chain_id),
        entry_index=entry_index,
        request_id=str(request_id),
        timestamp=ts.isoformat(),
        model=model,
        provider=provider,
        cot_content=cot_content,
        prev_hash=prev_hash,
    )

    now = datetime.now(timezone.utc)

    stmt = text("""
        INSERT INTO aletheia_cot_chain (
            id, tenant_id, chain_id, entry_index, request_id,
            timestamp, model, provider, agent_id,
            cot_hash, cot_token_count, cot_byte_count,
            prev_hash, entry_hash, content_stored, content_ref,
            created_at
        ) VALUES (
            :id, :tenant_id, :chain_id, :entry_index, :request_id,
            :timestamp, :model, :provider, :agent_id,
            :cot_hash, :cot_token_count, :cot_byte_count,
            :prev_hash, :entry_hash, false, :content_ref,
            :created_at
        )
        ON CONFLICT (tenant_id, chain_id, entry_index) DO NOTHING
    """)

    await db.execute(stmt, {
        "id": str(uuid.uuid4()),
        "tenant_id": str(tid),
        "chain_id": str(chain_id),
        "entry_index": entry_index,
        "request_id": str(request_id),
        "timestamp": ts,
        "model": model,
        "provider": provider,
        "agent_id": event.get("agent_id"),
        "cot_hash": cot_hash,
        "cot_token_count": cot_token_count,
        "cot_byte_count": cot_byte_count,
        "prev_hash": prev_hash,
        "entry_hash": entry_hash,
        "content_ref": None,
        "created_at": now,
    })

    logger.info(
        "pipeline.cot_entry_persisted",
        chain_id=str(chain_id),
        entry_index=entry_index,
        request_id=str(request_id),
        tenant_id=str(tid),
        cot_hash=cot_hash[:16] + "...",
    )
    return {
        "persisted": True,
        "chain_id": str(chain_id),
        "entry_index": entry_index,
        "entry_hash": entry_hash,
    }

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

    # 0. Geo threat enrichment (consent-gated, internal ops)
    geo_enricher = get_geo_enricher()
    if geo_enricher.enabled:
        try:
            event = geo_enricher.enrich_event(event)
        except Exception as e:
            logger.debug("pipeline.geo_enrichment_failed", error=str(e))

    # Route aletheia events to dedicated handlers + continue pipeline
    event_type = event.get("event_type")
    if event_type == "tool_invocation":
        try:
            tool_result = await _handle_tool_invocation(event, db)
            result["tool_invocation"] = tool_result
        except Exception as e:
            logger.error("pipeline.tool_invocation_persist_failed", error=str(e))

    if event_type == "cot_turn":
        try:
            cot_result = await _handle_cot_event(event, db)
            result["cot_turn"] = cot_result
        except Exception as e:
            logger.error("pipeline.cot_event_persist_failed", error=str(e))

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

    # 5. Forward to SIEM (env-var configured destinations)
    forwarder = get_event_forwarder()
    if forwarder:
        try:
            audit_event = AuditEvent.from_dict(event)
            forwarder.forward(audit_event)
            result["forwarded"] = True
        except Exception as e:
            logger.error("pipeline.siem_forward_failed", error=str(e))

    # 5b. Route detection events to DB-configured SIEM connectors
    if anomalies or matches:
        try:
            from src.siem._state import get_siem_manager
            from src.siem.cef import DetectionEvent, EventKind
            siem_mgr = get_siem_manager()
            if siem_mgr.list_connectors():
                tenant_id = str(event.get("tenant_id", ""))
                for anomaly in anomalies:
                    det_event = DetectionEvent(
                        kind=EventKind.ANOMALY,
                        event_id=str(uuid.uuid4()),
                        tenant_id=tenant_id,
                        timestamp=anomaly.timestamp.isoformat(),
                        sig_id=anomaly.type.value,
                        name=f"Anomaly: {anomaly.type.value}",
                        severity_label=anomaly.severity,
                        soulkey_id=str(anomaly.soulkey_id),
                        description=anomaly.description,
                        evidence=anomaly.evidence,
                    )
                    await siem_mgr.route(det_event)
                for match in matches:
                    det_event = DetectionEvent(
                        kind=EventKind.DETECTION,
                        event_id=str(uuid.uuid4()),
                        tenant_id=tenant_id,
                        timestamp=datetime.now(timezone.utc).isoformat(),
                        sig_id=match.rule.id if hasattr(match, "rule") else "unknown",
                        name=match.rule.title if hasattr(match, "rule") else str(match),
                        severity_label=match.rule.level if hasattr(match, "rule") else "medium",
                        soulkey_id=str(event.get("soulkey_id", "")),
                        description=match.rule.title if hasattr(match, "rule") else "",
                        evidence=match.to_dict() if hasattr(match, "to_dict") else {},
                    )
                    await siem_mgr.route(det_event)
                result["siem_routed"] = True
        except Exception as e:
            logger.debug("pipeline.siem_dynamic_route_failed", error=str(e))

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
