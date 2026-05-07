"""
Module-level singletons for the detection engine.
Initialized during app lifespan, accessed by router and hooks.
"""

from typing import Optional

from src.detection.sigma_engine import SigmaEngine
from src.detection.playbooks import PlaybookEngine

_sigma_engine: Optional[SigmaEngine] = None
_playbook_engine: Optional[PlaybookEngine] = None


def init_detection(sigma: SigmaEngine, playbook: PlaybookEngine):
    """Initialize detection engine singletons."""
    global _sigma_engine, _playbook_engine
    _sigma_engine = sigma
    _playbook_engine = playbook


def get_sigma_engine() -> SigmaEngine:
    """Get the active Sigma engine. Creates a default if not initialized."""
    global _sigma_engine
    if _sigma_engine is None:
        _sigma_engine = SigmaEngine()
    return _sigma_engine


def get_playbook_engine() -> PlaybookEngine:
    """Get the active playbook engine. Creates a default if not initialized."""
    global _playbook_engine
    if _playbook_engine is None:
        _playbook_engine = PlaybookEngine()
    return _playbook_engine
