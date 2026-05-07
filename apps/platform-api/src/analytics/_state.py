"""
Global state holders for analytics engine singletons.
Initialized during app lifespan, accessed by router endpoints.
"""

from typing import Optional

from src.analytics.baseline import BaselineEngine
from src.analytics.detector import AnomalyDetector
from src.analytics.alerts import AlertRouter

_baseline_engine: Optional[BaselineEngine] = None
_detector: Optional[AnomalyDetector] = None
_alert_router: Optional[AlertRouter] = None


def init_analytics(
    baseline_engine: BaselineEngine,
    detector: AnomalyDetector,
    alert_router: AlertRouter,
) -> None:
    """Set global analytics instances during app startup."""
    global _baseline_engine, _detector, _alert_router
    _baseline_engine = baseline_engine
    _detector = detector
    _alert_router = alert_router


def get_baseline_engine() -> Optional[BaselineEngine]:
    return _baseline_engine


def get_detector() -> Optional[AnomalyDetector]:
    return _detector


def get_alert_router() -> Optional[AlertRouter]:
    return _alert_router


def reset_analytics() -> None:
    """Clear global state (for testing)."""
    global _baseline_engine, _detector, _alert_router
    _baseline_engine = None
    _detector = None
    _alert_router = None
