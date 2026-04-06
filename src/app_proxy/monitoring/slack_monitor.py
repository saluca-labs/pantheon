"""SlackMonitor — continuously polls the Slack relay for events and scores them.

Records every Slack event (human and agent) to the audit trail with risk
scoring.  This builds the baseline dataset for behavioral analysis.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any

import structlog

from app_proxy.audit.logger import AuditLogger
from app_proxy.risk.analyzer import BehavioralAnalyzer, ToolEvent
from app_proxy.risk.scorer import RiskContext, RiskScorer

logger = structlog.stdlib.get_logger("app_proxy.monitoring.slack")

# Default tenant for internal monitoring — override via constructor.
_DEFAULT_TENANT = "saluca"


class SlackMonitor:
    """Continuously polls the Slack relay for events and scores them.

    Records every Slack event (human and agent) to the audit trail
    with risk scoring.  This builds the baseline dataset.

    The monitor runs as an asyncio background task and is designed to
    never crash — individual event processing errors are logged and
    skipped.
    """

    def __init__(
        self,
        relay: Any,  # SlackRelay — typed loosely to avoid circular imports
        risk_scorer: RiskScorer | None,
        audit_logger: AuditLogger,
        analyzer: BehavioralAnalyzer,
        *,
        tenant_id: str = _DEFAULT_TENANT,
        poll_interval: float = 5.0,
        batch_size: int = 50,
    ) -> None:
        self._relay = relay
        self._scorer = risk_scorer
        self._audit = audit_logger
        self._analyzer = analyzer
        self._tenant_id = tenant_id
        self._poll_interval = poll_interval
        self._batch_size = batch_size

        # Stats
        self._events_processed: int = 0
        self._errors: int = 0
        self._running = False

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------

    async def run(self) -> None:
        """Poll relay every N seconds, score + log each event.

        This method runs until cancelled.  It catches all exceptions so
        that transient errors never kill the monitor.
        """
        self._running = True
        logger.info(
            "slack_monitor.started",
            poll_interval=self._poll_interval,
            batch_size=self._batch_size,
        )

        while self._running:
            try:
                events = await self._relay.poll_events(
                    agent_id="__monitor__",
                    limit=self._batch_size,
                    timeout=self._poll_interval,
                )

                for event in events:
                    await self._process_event(event)

                if events:
                    logger.info(
                        "slack_monitor.batch",
                        count=len(events),
                        total=self._events_processed,
                    )

            except asyncio.CancelledError:
                logger.info("slack_monitor.cancelled")
                break
            except Exception:
                self._errors += 1
                logger.exception(
                    "slack_monitor.poll_error",
                    errors=self._errors,
                )
                # Back off on repeated errors to avoid tight loops.
                await asyncio.sleep(min(self._poll_interval * 2, 30.0))

        self._running = False
        logger.info(
            "slack_monitor.stopped",
            events_processed=self._events_processed,
            errors=self._errors,
        )

    # ------------------------------------------------------------------
    # Per-event processing
    # ------------------------------------------------------------------

    async def _process_event(self, event: Any) -> None:
        """Score, audit, and analyze a single Slack event."""
        try:
            tool_name = f"slack_{event.type}"
            call_id = event.id or str(uuid.uuid4())
            now = datetime.now(timezone.utc)

            # --- Risk scoring ---
            risk_dict: dict[str, Any] = {}
            risk_score: int = 0

            if self._scorer is not None:
                risk = self._scorer.score(RiskContext(
                    tool_name=tool_name,
                    plugin_name="slack",
                    agent_id=event.user or "unknown",
                    tenant_id=self._tenant_id,
                    arguments={"channel": event.channel, "text": event.text},
                    tool_annotations={},
                    hour_of_day=now.hour,
                    agent_call_count=0,
                ))
                risk_dict = risk.to_dict()
                risk_score = risk.score

            # --- Audit trail ---
            await self._audit.record_call(
                tenant_id=self._tenant_id,
                agent_id=event.user or "unknown",
                plugin_name="slack",
                tool_name=tool_name,
                call_id=call_id,
                arguments={
                    "channel": event.channel,
                    "text_length": len(event.text) if event.text else 0,
                },
                policy_decision="observe",
                policy_reason="baseline monitoring",
                metadata={
                    "risk": risk_dict,
                    "source": "relay_monitor",
                },
            )

            # --- Behavioral analyzer ---
            self._analyzer.check_and_record(ToolEvent(
                agent_id=event.user or "unknown",
                tool_name=tool_name,
                plugin_name="slack",
                arguments_keys=["channel", "text"],
                timestamp=event.received_at,
                risk_score=risk_score,
                status="observed",
            ))

            # --- Acknowledge ---
            await self._relay.ack_event(event.id)

            self._events_processed += 1

        except Exception:
            self._errors += 1
            logger.exception(
                "slack_monitor.event_error",
                event_id=getattr(event, "id", "?"),
                event_type=getattr(event, "type", "?"),
            )

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def events_processed(self) -> int:
        return self._events_processed

    @property
    def errors(self) -> int:
        return self._errors

    @property
    def is_running(self) -> bool:
        return self._running
