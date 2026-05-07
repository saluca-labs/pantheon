"""Tiresias Incident Controller — Forensic Evidence Collector.

Orchestrates multi-source evidence collection for post-incident analysis.
Artifacts are hashed (SHA-256) for integrity and uploaded to GCS.
"""

import asyncio
import hashlib
import json
import logging
import os
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
from uuid import uuid4

import asyncpg
import httpx

from src.models import ForensicSnapshot, Incident

from .chain_of_custody import ChainOfCustody

logger = logging.getLogger(__name__)


class ForensicCollector:
    """Orchestrates forensic evidence collection across Kubernetes, databases,
    WAF/Loki logs, and cloud metadata, then uploads to GCS."""

    def __init__(self, gcs_bucket: str, kubectl_path: str = "kubectl") -> None:
        self.gcs_bucket = gcs_bucket
        self.kubectl_path = kubectl_path

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    async def collect(self, incident: Incident) -> ForensicSnapshot:
        """Run all collection tasks and upload the bundle to GCS.

        Returns a ``ForensicSnapshot`` with artifact manifests and integrity
        hashes suitable for chain-of-custody tracking.
        """
        snapshot_id = str(uuid4())
        staging_dir = Path(tempfile.mkdtemp(prefix=f"forensics-{incident.id}-"))
        custody = ChainOfCustody(incident.id)

        namespace = incident.metadata.get("namespace", "default")
        db_url = incident.metadata.get("db_url", "")
        loki_url = incident.metadata.get("loki_url", "")

        artifacts: list[dict] = []

        collectors = [
            ("k8s_state", self.collect_k8s_state(namespace, staging_dir)),
            ("pod_logs", self.collect_pod_logs(namespace, staging_dir)),
            ("db_snapshot", self.collect_db_snapshot(db_url, staging_dir)),
            ("waf_logs", self.collect_waf_logs(loki_url, staging_dir)),
            ("system_logs", self.collect_system_logs(loki_url, staging_dir)),
            ("cluster_metadata", self.collect_cluster_metadata(staging_dir)),
        ]

        results = await asyncio.gather(
            *[coro for _, coro in collectors],
            return_exceptions=True,
        )

        for (label, _), result in zip(collectors, results):
            if isinstance(result, Exception):
                logger.error("Collection task %s failed: %s", label, result)
                continue
            if result is None:
                continue
            for artifact in result:
                custody.record_access(
                    artifact_id=artifact["path"],
                    action="created",
                    actor="forensic_collector",
                    reason=f"Collected during incident {incident.id}",
                    hash_sha256=artifact["hash_sha256"],
                )
                artifacts.append(artifact)

        # Upload to GCS
        gcs_prefix = f"gs://{self.gcs_bucket}/{incident.id}/"
        await self._upload_to_gcs(staging_dir, gcs_prefix)

        # Persist chain-of-custody log alongside artifacts
        custody_path = staging_dir / "chain_of_custody.json"
        custody_path.write_text(json.dumps(custody.export_log(), indent=2, default=str))
        await self._upload_to_gcs_file(str(custody_path), f"{gcs_prefix}chain_of_custody.json")

        snapshot = ForensicSnapshot(
            id=snapshot_id,
            incident_id=incident.id,
            storage_uri=gcs_prefix,
            artifacts=artifacts,
            chain_of_custody=custody.export_log(),
            complete=True,
        )

        logger.info(
            "Forensic collection complete for %s — %d artifacts stored at %s",
            incident.id,
            len(artifacts),
            gcs_prefix,
        )
        return snapshot

    # ------------------------------------------------------------------
    # Collection sub-methods
    # ------------------------------------------------------------------

    async def collect_k8s_state(
        self, namespace: str, staging_dir: Path
    ) -> list[dict]:
        """Capture Kubernetes resource state: all resources, pod descriptions,
        and cluster events for the target namespace."""
        artifacts: list[dict] = []

        commands = {
            "k8s_all_resources.yaml": [
                self.kubectl_path, "get", "all", "-n", namespace, "-o", "yaml",
            ],
            "k8s_pod_describe.txt": [
                self.kubectl_path, "describe", "pods", "-n", namespace,
            ],
            "k8s_events.yaml": [
                self.kubectl_path, "get", "events", "-n", namespace,
                "-o", "yaml", "--sort-by=.lastTimestamp",
            ],
        }

        for filename, cmd in commands.items():
            try:
                output = await self._run_subprocess(cmd)
                artifact = self._write_artifact(staging_dir, filename, output)
                artifacts.append(artifact)
            except Exception as exc:
                logger.error("Failed to collect %s: %s", filename, exc)

        return artifacts

    async def collect_pod_logs(
        self, namespace: str, staging_dir: Path
    ) -> list[dict]:
        """Collect logs from all pods in the namespace, including previous
        container logs for crashed pods."""
        artifacts: list[dict] = []

        try:
            pod_list_raw = await self._run_subprocess(
                [self.kubectl_path, "get", "pods", "-n", namespace,
                 "-o", "jsonpath={.items[*].metadata.name}"]
            )
        except Exception as exc:
            logger.error("Failed to list pods: %s", exc)
            return artifacts

        pod_names = pod_list_raw.strip().split()

        for pod in pod_names:
            # Current logs
            try:
                logs = await self._run_subprocess(
                    [self.kubectl_path, "logs", pod, "-n", namespace,
                     "--all-containers=true", "--tail=5000"]
                )
                artifact = self._write_artifact(
                    staging_dir, f"pod_logs_{pod}.txt", logs
                )
                artifacts.append(artifact)
            except Exception as exc:
                logger.warning("Failed to collect logs for pod %s: %s", pod, exc)

            # Previous container logs (for crashed pods)
            try:
                prev_logs = await self._run_subprocess(
                    [self.kubectl_path, "logs", pod, "-n", namespace,
                     "--all-containers=true", "--previous", "--tail=5000"]
                )
                if prev_logs.strip():
                    artifact = self._write_artifact(
                        staging_dir, f"pod_logs_{pod}_previous.txt", prev_logs
                    )
                    artifacts.append(artifact)
            except Exception:
                pass  # --previous fails if pod hasn't crashed; expected

        return artifacts

    async def collect_db_snapshot(
        self, db_url: str, staging_dir: Path
    ) -> list[dict]:
        """Query Postgres tables for the last 24 hours of audit, anomaly,
        detection, and key data."""
        if not db_url:
            logger.warning("No db_url provided; skipping DB snapshot")
            return []

        artifacts: list[dict] = []
        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

        tables = [
            "_soulauth_audit",
            "_soulwatch_anomalies",
            "_soulwatch_detections",
            "_soulkeys",
        ]

        try:
            conn = await asyncpg.connect(db_url)
            try:
                for table in tables:
                    try:
                        rows = await conn.fetch(
                            f"SELECT * FROM {table} WHERE created_at >= $1 "
                            f"ORDER BY created_at DESC",
                            cutoff,
                        )
                        data = [dict(r) for r in rows]
                        content = json.dumps(data, indent=2, default=str)
                        artifact = self._write_artifact(
                            staging_dir, f"db_{table}.json", content
                        )
                        artifacts.append(artifact)
                    except Exception as exc:
                        logger.error("Failed to query %s: %s", table, exc)
            finally:
                await conn.close()
        except Exception as exc:
            logger.error("Failed to connect to database: %s", exc)

        return artifacts

    async def collect_waf_logs(
        self, loki_url: str, staging_dir: Path
    ) -> list[dict]:
        """Query Loki for Cloud Armor / WAF logs from the last 2 hours."""
        if not loki_url:
            logger.warning("No loki_url provided; skipping WAF log collection")
            return []

        return await self._query_loki(
            loki_url,
            query='{job="cloud-armor"}',
            hours=2,
            filename="waf_logs.json",
            staging_dir=staging_dir,
        )

    async def collect_system_logs(
        self, loki_url: str, staging_dir: Path
    ) -> list[dict]:
        """Query Loki for all system logs from the last 2 hours."""
        if not loki_url:
            logger.warning("No loki_url provided; skipping system log collection")
            return []

        return await self._query_loki(
            loki_url,
            query='{job=~".+"}',
            hours=2,
            filename="system_logs.json",
            staging_dir=staging_dir,
        )

    async def collect_cluster_metadata(
        self, staging_dir: Path
    ) -> list[dict]:
        """Capture GKE cluster description, firewall rules, and Cloud Armor
        security policies."""
        artifacts: list[dict] = []

        commands = {
            "cluster_describe.yaml": [
                "gcloud", "container", "clusters", "describe",
                "--format=yaml",
            ],
            "firewall_rules.json": [
                "gcloud", "compute", "firewall-rules", "list",
                "--format=json",
            ],
            "security_policies.json": [
                "gcloud", "compute", "security-policies", "describe",
                "saluca-waf-policy", "--format=json",
            ],
        }

        for filename, cmd in commands.items():
            try:
                output = await self._run_subprocess(cmd)
                artifact = self._write_artifact(staging_dir, filename, output)
                artifacts.append(artifact)
            except Exception as exc:
                logger.error("Failed to collect %s: %s", filename, exc)

        return artifacts

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    async def _query_loki(
        self,
        loki_url: str,
        query: str,
        hours: int,
        filename: str,
        staging_dir: Path,
    ) -> list[dict]:
        """Execute a LogQL query_range against Loki and persist the results."""
        end = datetime.now(timezone.utc)
        start = end - timedelta(hours=hours)
        params = {
            "query": query,
            "start": str(int(start.timestamp() * 1e9)),
            "end": str(int(end.timestamp() * 1e9)),
            "limit": 5000,
        }
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.get(
                    f"{loki_url.rstrip('/')}/loki/api/v1/query_range",
                    params=params,
                )
                resp.raise_for_status()
                content = json.dumps(resp.json(), indent=2)
                artifact = self._write_artifact(staging_dir, filename, content)
                return [artifact]
        except Exception as exc:
            logger.error("Loki query failed for %s: %s", query, exc)
            return []

    @staticmethod
    def _sha256(data: str) -> str:
        """Compute the SHA-256 hex digest of a string."""
        return hashlib.sha256(data.encode("utf-8")).hexdigest()

    def _write_artifact(
        self, staging_dir: Path, filename: str, content: str
    ) -> dict:
        """Write content to a staging file and return an artifact descriptor."""
        path = staging_dir / filename
        path.write_text(content, encoding="utf-8")
        digest = self._sha256(content)
        return {
            "type": filename.rsplit(".", 1)[-1],
            "path": filename,
            "hash_sha256": digest,
            "size_bytes": len(content.encode("utf-8")),
        }

    async def _run_subprocess(self, cmd: list[str]) -> str:
        """Run a shell command via asyncio subprocess and return stdout."""
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(
                f"Command {' '.join(cmd)} exited {proc.returncode}: "
                f"{stderr.decode('utf-8', errors='replace')}"
            )
        return stdout.decode("utf-8", errors="replace")

    async def _upload_to_gcs(self, staging_dir: Path, gcs_prefix: str) -> None:
        """Upload all files in the staging directory to GCS using gsutil."""
        try:
            await self._run_subprocess(
                ["gsutil", "-m", "cp", "-r", f"{staging_dir}/*", gcs_prefix]
            )
        except Exception as exc:
            logger.error("GCS upload failed: %s", exc)
            raise

    async def _upload_to_gcs_file(self, local_path: str, gcs_path: str) -> None:
        """Upload a single file to GCS."""
        try:
            await self._run_subprocess(["gsutil", "cp", local_path, gcs_path])
        except Exception as exc:
            logger.error("GCS single-file upload failed: %s", exc)
            raise
