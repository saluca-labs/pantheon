"""
Git-based policy repository integration.
Implements SPEC.md section 4.3 — policy-as-code with git sync.
Supports auto-sync from local or remote git repositories.
"""

import asyncio
import os
import subprocess
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import structlog

from src.policy.loader import load_tenant_policies, ResolvedPolicy

logger = structlog.get_logger(__name__)


class PolicyVersion:
    """Represents a specific version of the policy repository."""

    def __init__(self, commit_hash: str, timestamp: datetime, message: str = ""):
        self.commit_hash = commit_hash
        self.timestamp = timestamp
        self.message = message

    def to_dict(self) -> dict:
        return {
            "commit_hash": self.commit_hash,
            "timestamp": self.timestamp.isoformat(),
            "message": self.message,
        }


def get_repo_version(repo_path: str) -> Optional[PolicyVersion]:
    """Get the current git version of the policy repo (sync, for backward compat)."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0:
            return None

        commit_hash = result.stdout.strip()

        # Get commit timestamp
        ts_result = subprocess.run(
            ["git", "log", "-1", "--format=%ci"],
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=10,
        )
        timestamp = datetime.now(timezone.utc)
        if ts_result.returncode == 0:
            try:
                ts_str = ts_result.stdout.strip()
                timestamp = datetime.fromisoformat(ts_str)
            except (ValueError, TypeError):
                pass

        # Get commit message
        msg_result = subprocess.run(
            ["git", "log", "-1", "--format=%s"],
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=10,
        )
        message = msg_result.stdout.strip() if msg_result.returncode == 0 else ""

        return PolicyVersion(commit_hash, timestamp, message)
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError) as e:
        logger.warning("policy.git_version_failed", error=str(e))
        return None


async def async_get_repo_version(repo_path: str) -> Optional[PolicyVersion]:
    """Get the current git version of the policy repo using async subprocess."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "git", "rev-parse", "HEAD",
            cwd=repo_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=10)

        if proc.returncode != 0:
            return None

        commit_hash = stdout.decode().strip()

        # Get commit timestamp
        ts_proc = await asyncio.create_subprocess_exec(
            "git", "log", "-1", "--format=%ci",
            cwd=repo_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        ts_stdout, _ = await asyncio.wait_for(ts_proc.communicate(), timeout=10)

        timestamp = datetime.now(timezone.utc)
        if ts_proc.returncode == 0:
            try:
                ts_str = ts_stdout.decode().strip()
                timestamp = datetime.fromisoformat(ts_str)
            except (ValueError, TypeError):
                pass

        # Get commit message
        msg_proc = await asyncio.create_subprocess_exec(
            "git", "log", "-1", "--format=%s",
            cwd=repo_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        msg_stdout, _ = await asyncio.wait_for(msg_proc.communicate(), timeout=10)

        message = msg_stdout.decode().strip() if msg_proc.returncode == 0 else ""

        return PolicyVersion(commit_hash, timestamp, message)
    except (asyncio.TimeoutError, FileNotFoundError, OSError) as e:
        logger.warning("policy.async_git_version_failed", error=str(e))
        return None


def pull_policy_repo(repo_path: str, branch: str = "main") -> bool:
    """Pull latest changes from remote policy repository (sync, for backward compat)."""
    try:
        result = subprocess.run(
            ["git", "pull", "origin", branch],
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode == 0:
            logger.info("policy.git_pull_success", branch=branch)
            return True
        else:
            logger.warning("policy.git_pull_failed", stderr=result.stderr)
            return False
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError) as e:
        logger.warning("policy.git_pull_error", error=str(e))
        return False


async def async_pull_policy_repo(repo_path: str, branch: str = "main") -> bool:
    """Pull latest changes from remote policy repository using async subprocess."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "git", "pull", "origin", branch,
            cwd=repo_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)

        if proc.returncode == 0:
            logger.info("policy.async_git_pull_success", branch=branch)
            return True
        else:
            logger.warning(
                "policy.async_git_pull_failed",
                stderr=stderr.decode(),
            )
            return False
    except (asyncio.TimeoutError, FileNotFoundError, OSError) as e:
        logger.warning("policy.async_git_pull_error", error=str(e))
        return False


def validate_policy_yaml(repo_path: str, tenant_slug: str) -> list[str]:
    """
    Validate policy YAML files for a tenant.
    Returns list of validation errors (empty = valid).
    """
    errors = []
    tenant_dir = Path(repo_path) / "tenants" / tenant_slug / "personas"

    if not tenant_dir.exists():
        errors.append(f"Tenant directory not found: {tenant_dir}")
        return errors

    for policy_file in tenant_dir.glob("*.yaml"):
        try:
            from src.policy.loader import load_policy_file
            data = load_policy_file(str(policy_file))

            # Validate required fields
            if "metadata" not in data:
                errors.append(f"{policy_file.name}: missing 'metadata' section")
                continue
            if "spec" not in data:
                errors.append(f"{policy_file.name}: missing 'spec' section")
                continue

            metadata = data["metadata"]
            if "persona" not in metadata:
                errors.append(f"{policy_file.name}: missing metadata.persona")
            if "role" not in metadata:
                errors.append(f"{policy_file.name}: missing metadata.role")

            spec = data.get("spec", {})
            resources = spec.get("resources", {})
            for resource_name, rules in resources.items():
                if not isinstance(rules, list):
                    errors.append(
                        f"{policy_file.name}: resource '{resource_name}' must be a list of rules"
                    )
                    continue
                for i, rule in enumerate(rules):
                    if "actions" not in rule:
                        errors.append(
                            f"{policy_file.name}: resource '{resource_name}' rule {i} missing 'actions'"
                        )

        except Exception as e:
            errors.append(f"{policy_file.name}: parse error: {str(e)}")

    return errors


def compute_policy_hash(policies: list[tuple[str, ResolvedPolicy]]) -> str:
    """Compute a content hash for a set of policies (for change detection)."""
    import json
    content = json.dumps(
        [(pid, p.to_dict()) for pid, p in sorted(policies, key=lambda x: x[0])],
        sort_keys=True,
    )
    return hashlib.sha256(content.encode()).hexdigest()[:16]


class PolicySyncManager:
    """Manages policy sync from git to database cache."""

    def __init__(self, repo_path: str):
        self.repo_path = repo_path
        self._last_sync_hash: dict[str, str] = {}  # tenant_slug -> policy_hash

    def needs_sync(self, tenant_slug: str) -> bool:
        """Check if tenant policies have changed since last sync."""
        policies = load_tenant_policies(self.repo_path, tenant_slug)
        current_hash = compute_policy_hash(policies)
        return current_hash != self._last_sync_hash.get(tenant_slug)

    def get_policies(self, tenant_slug: str) -> list[tuple[str, ResolvedPolicy]]:
        """Load policies for a tenant."""
        return load_tenant_policies(self.repo_path, tenant_slug)

    def mark_synced(self, tenant_slug: str, policies: list[tuple[str, ResolvedPolicy]]):
        """Mark a tenant's policies as synced."""
        self._last_sync_hash[tenant_slug] = compute_policy_hash(policies)

    def get_version(self) -> Optional[PolicyVersion]:
        """Get current repo version."""
        return get_repo_version(self.repo_path)

    def validate(self, tenant_slug: str) -> list[str]:
        """Validate policies for a tenant."""
        return validate_policy_yaml(self.repo_path, tenant_slug)


class AsyncPolicySyncManager:
    """
    Async policy sync manager with background scheduling.
    Wraps git operations with asyncio subprocess calls and tracks sync status.
    """

    def __init__(self, repo_path: str, sync_interval: int = 300, branch: str = "main"):
        self.repo_path = repo_path
        self.sync_interval = sync_interval
        self.branch = branch
        self._last_sync_hash: dict[str, str] = {}

        # Sync status tracking
        self._last_sync_time: Optional[datetime] = None
        self._last_sync_status: str = "pending"  # pending, success, failed
        self._last_error: Optional[str] = None
        self._last_commit_hash: Optional[str] = None
        self._sync_task: Optional[asyncio.Task] = None

    def get_sync_status(self) -> dict:
        """Return current sync status for health checks."""
        return {
            "last_sync_time": self._last_sync_time,
            "last_sync_status": self._last_sync_status,
            "last_error": self._last_error,
            "last_commit_hash": self._last_commit_hash,
            "sync_interval": self.sync_interval,
            "repo_path": self.repo_path,
        }

    async def pull_and_sync(self) -> bool:
        """Pull from remote and update sync status."""
        try:
            success = await async_pull_policy_repo(self.repo_path, self.branch)
            if not success:
                self._last_sync_status = "failed"
                self._last_error = "git pull returned non-zero exit code"
                self._last_sync_time = datetime.now(timezone.utc)
                return False

            version = await async_get_repo_version(self.repo_path)
            if version:
                self._last_commit_hash = version.commit_hash

            self._last_sync_time = datetime.now(timezone.utc)
            self._last_sync_status = "success"
            self._last_error = None

            # Update Prometheus gauge
            from src.monitoring.metrics import POLICY_SYNC_LAST_SUCCESS, POLICY_SYNCS_TOTAL
            POLICY_SYNC_LAST_SUCCESS.set(self._last_sync_time.timestamp())
            POLICY_SYNCS_TOTAL.labels(status="success").inc()

            logger.info(
                "policy.async_sync_complete",
                commit=self._last_commit_hash,
            )
            return True

        except Exception as e:
            self._last_sync_time = datetime.now(timezone.utc)
            self._last_sync_status = "failed"
            self._last_error = str(e)

            from src.monitoring.metrics import POLICY_SYNCS_TOTAL
            POLICY_SYNCS_TOTAL.labels(status="failed").inc()

            logger.error("policy.async_sync_failed", error=str(e))
            return False

    async def _sync_loop(self):
        """Background loop that periodically syncs policies."""
        logger.info(
            "policy.sync_scheduler_started",
            interval=self.sync_interval,
            repo=self.repo_path,
        )
        # Run an initial sync immediately
        await self.pull_and_sync()

        while True:
            await asyncio.sleep(self.sync_interval)
            await self.pull_and_sync()

    def start(self):
        """Start the background sync scheduler."""
        if self._sync_task is None or self._sync_task.done():
            self._sync_task = asyncio.create_task(self._sync_loop())
            logger.info("policy.sync_scheduler_created", interval=self.sync_interval)

    def stop(self):
        """Stop the background sync scheduler."""
        if self._sync_task and not self._sync_task.done():
            self._sync_task.cancel()
            self._sync_task = None
            logger.info("policy.sync_scheduler_stopped")

    async def get_version(self) -> Optional[PolicyVersion]:
        """Get current repo version asynchronously."""
        return await async_get_repo_version(self.repo_path)

    def needs_sync(self, tenant_slug: str) -> bool:
        """Check if tenant policies have changed since last sync."""
        policies = load_tenant_policies(self.repo_path, tenant_slug)
        current_hash = compute_policy_hash(policies)
        return current_hash != self._last_sync_hash.get(tenant_slug)

    def get_policies(self, tenant_slug: str) -> list[tuple[str, ResolvedPolicy]]:
        """Load policies for a tenant."""
        return load_tenant_policies(self.repo_path, tenant_slug)

    def mark_synced(self, tenant_slug: str, policies: list[tuple[str, ResolvedPolicy]]):
        """Mark a tenant's policies as synced."""
        self._last_sync_hash[tenant_slug] = compute_policy_hash(policies)

    def validate(self, tenant_slug: str) -> list[str]:
        """Validate policies for a tenant."""
        return validate_policy_yaml(self.repo_path, tenant_slug)


# Module-level singleton, initialized by the app lifespan
async_sync_manager: Optional[AsyncPolicySyncManager] = None


def init_async_sync_manager(
    repo_path: str,
    sync_interval: int = 300,
    branch: str = "main",
) -> AsyncPolicySyncManager:
    """Initialize and return the global async sync manager."""
    global async_sync_manager
    async_sync_manager = AsyncPolicySyncManager(
        repo_path=repo_path,
        sync_interval=sync_interval,
        branch=branch,
    )
    return async_sync_manager
