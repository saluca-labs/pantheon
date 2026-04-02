"""
Config Integrity Watchdog — detects runtime modifications to critical config files.

Monitors:
- .env files
- docker-compose.yml
- Policy YAML files
- alembic.ini

Computes SHA-256 hashes at startup, re-checks on interval.
Emits audit events on change detection for SoulWatch Sigma rules.
"""

import asyncio
import hashlib
import os
import structlog
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

logger = structlog.get_logger(__name__)

_watchdog_task: Optional[asyncio.Task] = None

# Files to monitor (relative to app root)
DEFAULT_WATCHED_FILES = [
    ".env",
    "docker-compose.yml",
    "alembic.ini",
    "config/settings.py",
]

DEFAULT_WATCHED_DIRS = [
    "policies/",
]


def _hash_file(path: str) -> Optional[str]:
    """SHA-256 hash of a file, or None if not found."""
    try:
        with open(path, "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()
    except (FileNotFoundError, PermissionError):
        return None


def _hash_directory(dir_path: str, pattern: str = "*.yaml") -> dict[str, str]:
    """Hash all files matching pattern in a directory tree."""
    hashes = {}
    try:
        for path in Path(dir_path).rglob(pattern):
            rel = str(path.relative_to(dir_path))
            hashes[rel] = _hash_file(str(path))
    except (FileNotFoundError, PermissionError):
        pass
    return hashes


class ConfigIntegrityWatchdog:
    """Monitors config files for unauthorized changes."""

    def __init__(self, app_root: str = "/app"):
        self.app_root = app_root
        self._file_hashes: dict[str, Optional[str]] = {}
        self._dir_hashes: dict[str, dict[str, str]] = {}
        self._initialized = False

    def snapshot(self):
        """Take initial snapshot of all watched files."""
        for rel_path in DEFAULT_WATCHED_FILES:
            full_path = os.path.join(self.app_root, rel_path)
            self._file_hashes[rel_path] = _hash_file(full_path)

        for rel_dir in DEFAULT_WATCHED_DIRS:
            full_dir = os.path.join(self.app_root, rel_dir)
            self._dir_hashes[rel_dir] = _hash_directory(full_dir)

        self._initialized = True
        logger.info(
            "config_watchdog.snapshot_taken",
            files=len(self._file_hashes),
            dirs=len(self._dir_hashes),
            dir_files=sum(len(v) for v in self._dir_hashes.values()),
        )

    def check(self) -> list[dict]:
        """Compare current state against snapshot. Returns list of violations."""
        if not self._initialized:
            return []

        violations = []

        # Check individual files
        for rel_path, original_hash in self._file_hashes.items():
            full_path = os.path.join(self.app_root, rel_path)
            current_hash = _hash_file(full_path)

            if original_hash is None and current_hash is not None:
                violations.append({
                    "type": "config_file_created",
                    "path": rel_path,
                    "detail": f"Config file {rel_path} was created after startup",
                })
            elif original_hash is not None and current_hash is None:
                violations.append({
                    "type": "config_file_deleted",
                    "path": rel_path,
                    "detail": f"Config file {rel_path} was deleted after startup",
                })
            elif original_hash != current_hash:
                violations.append({
                    "type": "config_file_modified",
                    "path": rel_path,
                    "detail": f"Config file {rel_path} was modified after startup",
                    "original_hash": original_hash[:16] if original_hash else None,
                    "current_hash": current_hash[:16] if current_hash else None,
                })

        # Check directories
        for rel_dir, original_hashes in self._dir_hashes.items():
            full_dir = os.path.join(self.app_root, rel_dir)
            current_hashes = _hash_directory(full_dir)

            # New files
            for f in set(current_hashes) - set(original_hashes):
                violations.append({
                    "type": "policy_file_created",
                    "path": f"{rel_dir}{f}",
                    "detail": f"Policy file {f} was created after startup",
                })

            # Deleted files
            for f in set(original_hashes) - set(current_hashes):
                violations.append({
                    "type": "policy_file_deleted",
                    "path": f"{rel_dir}{f}",
                    "detail": f"Policy file {f} was deleted after startup",
                })

            # Modified files
            for f in set(original_hashes) & set(current_hashes):
                if original_hashes[f] != current_hashes[f]:
                    violations.append({
                        "type": "policy_file_modified",
                        "path": f"{rel_dir}{f}",
                        "detail": f"Policy file {f} was modified after startup",
                    })

        return violations

    async def emit_violations(self, violations: list[dict]):
        """Emit violations as audit events."""
        for v in violations:
            logger.critical(
                "config_watchdog.violation",
                violation_type=v["type"],
                path=v.get("path"),
                detail=v["detail"],
            )
            try:
                from src.database.connection import async_session_factory
                from src.audit.logger import log_auth_event
                import uuid as _uuid

                async with async_session_factory() as db:
                    await log_auth_event(
                        db=db,
                        tenant_id=None,
                        event_type="config_integrity_violation",
                        soulkey_id=None,
                        persona_id="system",
                        resource="config",
                        action="integrity_check",
                        scope="system",
                        decision="alert",
                        reason=v["detail"],
                        context={
                            "violation_type": v["type"],
                            "path": v.get("path"),
                        },
                    )
            except Exception as e:
                logger.error("config_watchdog.emit_failed", error=str(e))


async def _watchdog_loop(watchdog: ConfigIntegrityWatchdog, interval_seconds: int = 60):
    """Background loop checking config integrity."""
    logger.info("config_watchdog.started", interval_seconds=interval_seconds)
    while True:
        try:
            await asyncio.sleep(interval_seconds)
            violations = watchdog.check()
            if violations:
                await watchdog.emit_violations(violations)
            else:
                logger.debug("config_watchdog.check_clean")
        except asyncio.CancelledError:
            logger.info("config_watchdog.stopped")
            break
        except Exception as e:
            logger.error("config_watchdog.loop_error", error=str(e))


def start_config_watchdog(app_root: str = "/app", interval_seconds: int = 60):
    """Start the config integrity watchdog. Call from app lifespan startup."""
    global _watchdog_task
    if _watchdog_task is not None:
        return

    watchdog = ConfigIntegrityWatchdog(app_root)
    watchdog.snapshot()
    _watchdog_task = asyncio.create_task(_watchdog_loop(watchdog, interval_seconds))
    logger.info("config_watchdog.scheduled", interval_seconds=interval_seconds)


def stop_config_watchdog():
    """Stop the config integrity watchdog."""
    global _watchdog_task
    if _watchdog_task:
        _watchdog_task.cancel()
        _watchdog_task = None
