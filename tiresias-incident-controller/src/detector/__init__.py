"""Tiresias Incident Controller — Detection subsystem.

Public API surface for alert ingestion, correlation, and classification.
"""

from src.detector.alert_receiver import Alert, AlertReceiver
from src.detector.classifier import Classifier
from src.detector.correlator import Correlator

__all__ = [
    "Alert",
    "AlertReceiver",
    "Classifier",
    "Correlator",
]
