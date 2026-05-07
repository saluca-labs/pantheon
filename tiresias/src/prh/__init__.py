"""
PRH — Prompt Risk Heuristic engine.
Scores prompt content for 6 threat categories in pure Python.
"""
from src.prh.analyzer import PRHAnalyzer, PRHResult
from src.prh.patterns import CATEGORIES, CATEGORY_PATTERNS

__all__ = ["PRHAnalyzer", "PRHResult", "CATEGORIES", "CATEGORY_PATTERNS"]
