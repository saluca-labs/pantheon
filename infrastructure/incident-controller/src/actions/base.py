"""Tiresias Incident Controller — Abstract base class for action executors.

All action executors inherit from ActionExecutor, which provides standardized
timing, logging, error handling, and rollback scaffolding.
"""

import logging
import time
from abc import ABC, abstractmethod

from src.models.incident import ActionRecord


class ActionExecutor(ABC):
    """Base class for all infrastructure action executors."""

    def __init__(self) -> None:
        self.log = logging.getLogger(self.__class__.__name__)

    async def execute(self, action: ActionRecord, **kwargs) -> ActionRecord:
        """Execute an action with timing, logging, and error handling."""
        action.status = "executing"
        start = time.monotonic()
        self.log.info(f"Executing {action.action_type} on {action.target}")
        try:
            result = await self._execute(action, **kwargs)
            action.status = "completed"
            action.details.update(result or {})
            self.log.info(f"Completed {action.action_type} on {action.target}")
        except Exception as e:
            action.status = "failed"
            action.error = str(e)
            self.log.error(f"Failed {action.action_type} on {action.target}: {e}")
        finally:
            action.duration_ms = int((time.monotonic() - start) * 1000)
        return action

    @abstractmethod
    async def _execute(self, action: ActionRecord, **kwargs) -> dict | None:
        """Subclasses implement the actual operation here."""
        ...

    async def rollback(self, action: ActionRecord) -> ActionRecord:
        """Rollback a completed action. Override in subclasses that support it."""
        self.log.warning(
            f"Rollback not implemented for {action.action_type} on {action.target}"
        )
        return action
