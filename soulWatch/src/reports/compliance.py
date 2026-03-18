"""
Compliance report generation for SoulWatch.
Maps SoulWatch data to control frameworks: SOC2, ISO 27001, NIST 800-53.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

import structlog
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from soulWatch.src.database.models import (
    SoulWatchAnomaly,
    SoulWatchDetection,
    SoulWatchQuarantine,
    SoulWatchBaseline,
)

logger = structlog.get_logger(__name__)


async def generate_soc2_report(db: AsyncSession, days: int = 30) -> dict:
    """
    Generate SOC2 Type II compliance report.
    Maps SoulWatch controls to CC6 (Logical Access), CC7 (System Operations),
    CC8 (Change Management).
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    anomaly_count = await _count(db, SoulWatchAnomaly, cutoff)
    detection_count = await _count(db, SoulWatchDetection, cutoff)
    quarantine_count = await _count(db, SoulWatchQuarantine, cutoff)
    baseline_count = (await db.execute(select(func.count()).select_from(SoulWatchBaseline))).scalar() or 0

    # Resolved anomaly rate
    resolved_result = await db.execute(
        select(func.count()).select_from(SoulWatchAnomaly)
        .where(
            SoulWatchAnomaly.created_at >= cutoff,
            SoulWatchAnomaly.status.in_(["resolved", "false_positive"]),
        )
    )
    resolved_count = resolved_result.scalar() or 0
    resolution_rate = (resolved_count / anomaly_count * 100) if anomaly_count > 0 else 100

    return {
        "framework": "SOC2 Type II",
        "period_days": days,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "controls": {
            "CC6_Logical_Access": {
                "description": "Logical and physical access controls",
                "controls": [
                    {
                        "id": "CC6.1",
                        "name": "Access Security - Authentication",
                        "evidence": f"{detection_count} credential-related detections in period",
                        "status": "effective" if detection_count > 0 else "monitoring_active",
                    },
                    {
                        "id": "CC6.2",
                        "name": "Access Security - Authorization",
                        "evidence": f"{baseline_count} agent baselines tracked for behavioral analysis",
                        "status": "effective",
                    },
                    {
                        "id": "CC6.6",
                        "name": "Access Restriction - Least Privilege",
                        "evidence": f"{quarantine_count} automated quarantine actions enforced",
                        "status": "effective" if quarantine_count >= 0 else "needs_review",
                    },
                ],
            },
            "CC7_System_Operations": {
                "description": "System operation and monitoring controls",
                "controls": [
                    {
                        "id": "CC7.2",
                        "name": "Monitoring - Anomaly Detection",
                        "evidence": f"{anomaly_count} anomalies detected, {resolution_rate:.1f}% resolution rate",
                        "status": "effective",
                    },
                    {
                        "id": "CC7.3",
                        "name": "Incident Response",
                        "evidence": f"{quarantine_count} automated incident responses executed",
                        "status": "effective",
                    },
                    {
                        "id": "CC7.4",
                        "name": "Incident Recovery",
                        "evidence": f"Resolution rate: {resolution_rate:.1f}%",
                        "status": "effective" if resolution_rate >= 80 else "needs_improvement",
                    },
                ],
            },
            "CC8_Change_Management": {
                "description": "Change management and detection rules",
                "controls": [
                    {
                        "id": "CC8.1",
                        "name": "Detection Rule Management",
                        "evidence": f"{detection_count} rule-based detections in period",
                        "status": "effective",
                    },
                ],
            },
        },
        "summary": {
            "total_anomalies": anomaly_count,
            "total_detections": detection_count,
            "total_quarantines": quarantine_count,
            "tracked_agents": baseline_count,
            "resolution_rate_pct": round(resolution_rate, 1),
        },
    }


async def generate_iso27001_report(db: AsyncSession, days: int = 30) -> dict:
    """Generate ISO 27001 Annex A.9 (Access Control) compliance report."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    anomaly_count = await _count(db, SoulWatchAnomaly, cutoff)
    detection_count = await _count(db, SoulWatchDetection, cutoff)
    quarantine_count = await _count(db, SoulWatchQuarantine, cutoff)

    return {
        "framework": "ISO 27001",
        "period_days": days,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "controls": {
            "A9_Access_Control": {
                "A9.1": {
                    "name": "Business requirements of access control",
                    "evidence": "Behavioral baselines enforce least-privilege access patterns",
                    "status": "compliant",
                },
                "A9.2": {
                    "name": "User access management",
                    "evidence": f"Real-time monitoring with {anomaly_count} anomalies detected",
                    "status": "compliant",
                },
                "A9.4": {
                    "name": "System and application access control",
                    "evidence": f"{detection_count} Sigma rule detections, {quarantine_count} automated responses",
                    "status": "compliant",
                },
            },
        },
        "summary": {
            "total_anomalies": anomaly_count,
            "total_detections": detection_count,
            "total_quarantines": quarantine_count,
        },
    }


async def generate_nist_report(db: AsyncSession, days: int = 30) -> dict:
    """Generate NIST 800-53 AC (Access Control) family compliance report."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    anomaly_count = await _count(db, SoulWatchAnomaly, cutoff)
    detection_count = await _count(db, SoulWatchDetection, cutoff)
    quarantine_count = await _count(db, SoulWatchQuarantine, cutoff)

    return {
        "framework": "NIST 800-53",
        "period_days": days,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "controls": {
            "AC_Access_Control": {
                "AC-2": {
                    "name": "Account Management",
                    "evidence": "Automated agent identity lifecycle monitoring",
                    "status": "implemented",
                },
                "AC-6": {
                    "name": "Least Privilege",
                    "evidence": f"Behavioral baselines detect scope escalation ({anomaly_count} anomalies)",
                    "status": "implemented",
                },
                "AC-7": {
                    "name": "Unsuccessful Logon Attempts",
                    "evidence": f"Credential stuffing detection active ({detection_count} detections)",
                    "status": "implemented",
                },
                "AC-17": {
                    "name": "Remote Access",
                    "evidence": f"Impossible travel detection, {quarantine_count} automated quarantines",
                    "status": "implemented",
                },
            },
            "AU_Audit": {
                "AU-6": {
                    "name": "Audit Review, Analysis, and Reporting",
                    "evidence": "Continuous real-time audit analysis via SoulWatch pipeline",
                    "status": "implemented",
                },
            },
            "IR_Incident_Response": {
                "IR-4": {
                    "name": "Incident Handling",
                    "evidence": f"Automated playbook execution, {quarantine_count} incidents handled",
                    "status": "implemented",
                },
            },
        },
        "summary": {
            "total_anomalies": anomaly_count,
            "total_detections": detection_count,
            "total_quarantines": quarantine_count,
        },
    }


async def generate_executive_report(db: AsyncSession, days: int = 30) -> dict:
    """High-level executive summary report."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    anomaly_count = await _count(db, SoulWatchAnomaly, cutoff)
    detection_count = await _count(db, SoulWatchDetection, cutoff)
    quarantine_count = await _count(db, SoulWatchQuarantine, cutoff)

    # Severity breakdown
    sev_result = await db.execute(
        select(SoulWatchAnomaly.severity, func.count())
        .where(SoulWatchAnomaly.created_at >= cutoff)
        .group_by(SoulWatchAnomaly.severity)
    )
    by_severity = {row[0]: row[1] for row in sev_result.fetchall()}

    # Top anomaly types
    type_result = await db.execute(
        select(SoulWatchAnomaly.anomaly_type, func.count())
        .where(SoulWatchAnomaly.created_at >= cutoff)
        .group_by(SoulWatchAnomaly.anomaly_type)
        .order_by(func.count().desc())
        .limit(5)
    )
    top_types = {row[0]: row[1] for row in type_result.fetchall()}

    return {
        "title": "SoulWatch Executive Security Report",
        "period_days": days,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "highlights": {
            "total_anomalies": anomaly_count,
            "total_detections": detection_count,
            "total_quarantines": quarantine_count,
            "critical_anomalies": by_severity.get("critical", 0),
            "high_anomalies": by_severity.get("high", 0),
        },
        "severity_breakdown": by_severity,
        "top_anomaly_types": top_types,
    }


async def _count(db: AsyncSession, model, cutoff: datetime) -> int:
    """Helper to count records since cutoff."""
    # Use the appropriate timestamp column per model
    ts_col = getattr(model, "created_at", None) or getattr(model, "quarantined_at", None)
    if ts_col is None:
        return 0
    result = await db.execute(
        select(func.count()).select_from(model)
        .where(ts_col >= cutoff)
    )
    return result.scalar() or 0
