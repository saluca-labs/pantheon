"""Tiresias Incident Controller — Chain of Custody Tracker.

Maintains an immutable, auditable record of every access and mutation
applied to forensic artifacts.  Entries are persisted as a JSON file
alongside the evidence bundle.
"""

import hashlib
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


class ChainOfCustody:
    """Tracks creation, access, modification, and export of forensic
    artifacts with SHA-256 integrity verification."""

    def __init__(self, incident_id: str) -> None:
        self.incident_id = incident_id
        self._log: list[dict] = []

    # ------------------------------------------------------------------
    # Recording
    # ------------------------------------------------------------------

    def record_access(
        self,
        artifact_id: str,
        action: str,
        actor: str,
        reason: str,
        hash_sha256: Optional[str] = None,
    ) -> None:
        """Append an access/mutation entry to the chain-of-custody log.

        Parameters
        ----------
        artifact_id:
            Unique identifier (typically the artifact filename or path).
        action:
            One of ``created``, ``accessed``, ``modified``, ``exported``.
        actor:
            Identity of the entity performing the action.
        reason:
            Free-text justification for the access.
        hash_sha256:
            SHA-256 digest of the artifact at the time of action.
        """
        valid_actions = {"created", "accessed", "modified", "exported"}
        if action not in valid_actions:
            raise ValueError(
                f"Invalid action '{action}'; must be one of {valid_actions}"
            )

        entry: dict = {
            "artifact_id": artifact_id,
            "action": action,
            "actor": actor,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "hash_sha256": hash_sha256 or "",
            "reason": reason,
        }
        self._log.append(entry)
        logger.debug(
            "Chain-of-custody: %s %s on %s (%s)",
            actor, action, artifact_id, reason,
        )

    # ------------------------------------------------------------------
    # Integrity verification
    # ------------------------------------------------------------------

    @staticmethod
    def verify_integrity(artifact_path: str, expected_hash: str) -> bool:
        """Verify that the SHA-256 hash of the file at *artifact_path*
        matches *expected_hash*.

        Returns ``True`` if the hashes match, ``False`` otherwise.
        """
        try:
            data = Path(artifact_path).read_bytes()
            actual = hashlib.sha256(data).hexdigest()
            match = actual == expected_hash
            if not match:
                logger.warning(
                    "Integrity mismatch for %s: expected %s, got %s",
                    artifact_path, expected_hash, actual,
                )
            return match
        except FileNotFoundError:
            logger.error("Artifact not found for integrity check: %s", artifact_path)
            return False
        except Exception as exc:
            logger.error("Integrity check failed for %s: %s", artifact_path, exc)
            return False

    # ------------------------------------------------------------------
    # Export
    # ------------------------------------------------------------------

    def export_log(self) -> list[dict]:
        """Return the full chain-of-custody log as a list of dicts."""
        return list(self._log)

    def save(self, directory: Path) -> Path:
        """Persist the chain-of-custody log to a JSON file in *directory*.

        Returns the path to the written file.
        """
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f"chain_of_custody_{self.incident_id}.json"
        path.write_text(
            json.dumps(self._log, indent=2, default=str),
            encoding="utf-8",
        )
        logger.info("Chain-of-custody log saved to %s", path)
        return path
