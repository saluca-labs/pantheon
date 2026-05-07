"""
Module-level singletons for the SoulWatch detection engine.
"""

from typing import Optional

from soulWatch.src.detection.sigma_engine import SigmaEngine
from soulWatch.src.detection.playbooks import PlaybookEngine

_sigma_engine: Optional[SigmaEngine] = None
_playbook_engine: Optional[PlaybookEngine] = None


def init_detection(sigma: SigmaEngine, playbook: PlaybookEngine):
    global _sigma_engine, _playbook_engine
    _sigma_engine = sigma
    _playbook_engine = playbook


def get_sigma_engine() -> SigmaEngine:
    global _sigma_engine
    if _sigma_engine is None:
        _sigma_engine = SigmaEngine()
    return _sigma_engine


def get_playbook_engine() -> PlaybookEngine:
    global _playbook_engine
    if _playbook_engine is None:
        _playbook_engine = PlaybookEngine()
    return _playbook_engine
