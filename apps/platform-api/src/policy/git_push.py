"""
Git-based policy push for cloud-to-on-prem sync.
Commits portal policy overrides to per-tenant git repos so on-prem
instances can pull them via git_sync.

Complements git_sync.py (pull side) with the push side:
  init_tenant_repo     — scaffold a per-tenant policy repo
  generate_deploy_key  — Ed25519 SSH key for push auth
  configure_remote     — set git remote + SSH config
  commit_policy_update — write YAML files + git commit
  push_to_remote       — git push with deploy key
  commit_and_push      — orchestrator for the full flow
"""

from __future__ import annotations

import asyncio
import json
import os
import stat
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import structlog
import yaml

logger = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _run_git(
    *args: str,
    cwd: Path,
    timeout: int = 30,
    env: dict[str, str] | None = None,
) -> tuple[int, str, str]:
    """Run a git command via asyncio subprocess. Returns (returncode, stdout, stderr)."""
    merged_env: dict[str, str] | None = None
    if env:
        merged_env = {**os.environ, **env}

    proc = await asyncio.create_subprocess_exec(
        "git", *args,
        cwd=str(cwd),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=merged_env,
    )
    stdout_bytes, stderr_bytes = await asyncio.wait_for(
        proc.communicate(), timeout=timeout,
    )
    return (
        proc.returncode or 0,
        stdout_bytes.decode().strip(),
        stderr_bytes.decode().strip(),
    )


def _git_ssh_env(deploy_key_path: str) -> dict[str, str]:
    """Return env dict that forces git to use a specific SSH deploy key."""
    return {
        "GIT_SSH_COMMAND": f'ssh -i "{deploy_key_path}" -o StrictHostKeyChecking=accept-new',
    }


# ---------------------------------------------------------------------------
# 1. init_tenant_repo
# ---------------------------------------------------------------------------

async def init_tenant_repo(tenant_slug: str, repo_base_path: Path) -> Path:
    """
    Create the directory scaffold for a tenant policy repo and ``git init``
    if it is not already a repository.

    Layout::

        {repo_base_path}/{tenant_slug}/
          policies/
            cost_limits.yaml
            model_restrictions.yaml
            pii_detection.yaml
            sigma_rules/
          metadata.json

    Returns the repo path.
    """
    repo_path = repo_base_path / tenant_slug
    policies_dir = repo_path / "policies"
    sigma_dir = policies_dir / "sigma_rules"

    # Create directory tree
    sigma_dir.mkdir(parents=True, exist_ok=True)

    # Seed empty YAML files if they don't exist
    for name in ("cost_limits.yaml", "model_restrictions.yaml", "pii_detection.yaml"):
        fpath = policies_dir / name
        if not fpath.exists():
            fpath.write_text(yaml.dump({}, default_flow_style=False), encoding="utf-8")

    # Seed metadata.json
    meta_path = repo_path / "metadata.json"
    if not meta_path.exists():
        meta_path.write_text(
            json.dumps(
                {
                    "tenant": tenant_slug,
                    "version": "0.0",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "last_updated_at": None,
                    "last_author": None,
                },
                indent=2,
            ),
            encoding="utf-8",
        )

    # git init (idempotent — does nothing if .git already exists)
    git_dir = repo_path / ".git"
    if not git_dir.exists():
        rc, out, err = await _run_git("init", cwd=repo_path)
        if rc != 0:
            logger.error("policy.git_push.init_failed", tenant=tenant_slug, stderr=err)
            raise RuntimeError(f"git init failed for {tenant_slug}: {err}")

        # Initial commit so the repo has HEAD
        await _run_git("add", ".", cwd=repo_path)
        await _run_git(
            "commit", "-m", f"policy: init repo for {tenant_slug}",
            cwd=repo_path,
        )
        logger.info("policy.git_push.repo_initialized", tenant=tenant_slug, path=str(repo_path))
    else:
        logger.debug("policy.git_push.repo_exists", tenant=tenant_slug, path=str(repo_path))

    return repo_path


# ---------------------------------------------------------------------------
# 2. generate_deploy_key
# ---------------------------------------------------------------------------

async def generate_deploy_key(
    tenant_slug: str,
    keys_dir: Path,
) -> tuple[str, str]:
    """
    Generate an Ed25519 SSH deploy key pair for a tenant.

    Returns (private_key_path, public_key_content).
    """
    keys_dir.mkdir(parents=True, exist_ok=True)

    private_key_path = keys_dir / f"{tenant_slug}_deploy_key"
    public_key_path = keys_dir / f"{tenant_slug}_deploy_key.pub"

    # Remove existing keys so ssh-keygen doesn't prompt for overwrite
    for p in (private_key_path, public_key_path):
        if p.exists():
            p.unlink()

    proc = await asyncio.create_subprocess_exec(
        "ssh-keygen",
        "-t", "ed25519",
        "-C", f"tiresias-deploy-{tenant_slug}",
        "-f", str(private_key_path),
        "-N", "",  # empty passphrase
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)

    if proc.returncode != 0:
        err_msg = stderr.decode().strip()
        logger.error("policy.git_push.keygen_failed", tenant=tenant_slug, stderr=err_msg)
        raise RuntimeError(f"ssh-keygen failed: {err_msg}")

    # Lock down private key permissions
    try:
        private_key_path.chmod(stat.S_IRUSR | stat.S_IWUSR)
    except OSError:
        pass  # Windows doesn't enforce POSIX perms the same way

    public_key_content = public_key_path.read_text(encoding="utf-8").strip()

    logger.info(
        "policy.git_push.deploy_key_generated",
        tenant=tenant_slug,
        public_key_path=str(public_key_path),
    )
    return str(private_key_path), public_key_content


# ---------------------------------------------------------------------------
# 3. configure_remote
# ---------------------------------------------------------------------------

async def configure_remote(
    repo_path: Path,
    remote_url: str,
    deploy_key_path: str,
) -> None:
    """
    Set (or update) the git remote origin and configure the deploy key
    for SSH-based push.
    """
    # Check if remote already exists
    rc, out, _ = await _run_git("remote", "get-url", "origin", cwd=repo_path)
    if rc == 0:
        # Remote exists — update it
        await _run_git("remote", "set-url", "origin", remote_url, cwd=repo_path)
    else:
        # Add new remote
        await _run_git("remote", "add", "origin", remote_url, cwd=repo_path)

    # Store the SSH command in the local git config so all operations use the key
    ssh_cmd = f'ssh -i "{deploy_key_path}" -o StrictHostKeyChecking=accept-new'
    await _run_git("config", "core.sshCommand", ssh_cmd, cwd=repo_path)

    # Set committer identity
    await _run_git("config", "user.name", "tiresias-portal", cwd=repo_path)
    await _run_git("config", "user.email", "portal@tiresias.network", cwd=repo_path)

    logger.info(
        "policy.git_push.remote_configured",
        repo=str(repo_path),
        remote=remote_url,
    )


# ---------------------------------------------------------------------------
# 4. commit_policy_update
# ---------------------------------------------------------------------------

async def commit_policy_update(
    repo_path: Path,
    tenant_slug: str,
    resolved_policy: dict,
    updated_sections: list[str],
    author: str = "tiresias-portal",
) -> str:
    """
    Write portal_overrides from the resolved policy as individual YAML files,
    update metadata.json, and commit.

    Returns the new commit hash.
    """
    policies_dir = repo_path / "policies"
    policies_dir.mkdir(parents=True, exist_ok=True)

    overrides = resolved_policy.get("portal_overrides", {})

    # Map section names → file paths
    section_files = {
        "cost_limits": policies_dir / "cost_limits.yaml",
        "model_restrictions": policies_dir / "model_restrictions.yaml",
        "pii_detection": policies_dir / "pii_detection.yaml",
        "volume_limits": policies_dir / "volume_limits.yaml",
    }

    # Write individual section files
    for section, fpath in section_files.items():
        if section in overrides:
            fpath.write_text(
                yaml.dump(overrides[section], default_flow_style=False, sort_keys=True),
                encoding="utf-8",
            )

    # Write sigma rules as individual files
    if "custom_rules" in overrides and overrides["custom_rules"]:
        sigma_dir = policies_dir / "sigma_rules"
        sigma_dir.mkdir(parents=True, exist_ok=True)
        for i, rule in enumerate(overrides["custom_rules"]):
            rule_id = rule.get("id", f"rule_{i}")
            rule_path = sigma_dir / f"{rule_id}.yaml"
            rule_path.write_text(
                yaml.dump(rule, default_flow_style=False, sort_keys=True),
                encoding="utf-8",
            )

    # Update metadata.json
    meta_path = repo_path / "metadata.json"
    now = datetime.now(timezone.utc)
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            meta = {}
    else:
        meta = {"tenant": tenant_slug}

    meta["last_updated_at"] = now.isoformat()
    meta["last_author"] = author
    meta["updated_sections"] = updated_sections
    # Version bumped by incrementing a counter
    cur = meta.get("version", "0.0")
    try:
        parts = cur.rsplit(".", 1)
        meta["version"] = f"{parts[0]}.{int(parts[1]) + 1}"
    except (ValueError, IndexError):
        meta["version"] = f"{cur}.1"

    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")

    # Stage + commit
    await _run_git("add", ".", cwd=repo_path)

    # Check if there are staged changes (avoid empty commits)
    rc, diff_out, _ = await _run_git("diff", "--cached", "--stat", cwd=repo_path)
    if not diff_out:
        logger.info("policy.git_push.no_changes", tenant=tenant_slug)
        # Return current HEAD
        _, head, _ = await _run_git("rev-parse", "HEAD", cwd=repo_path)
        return head

    sections_str = ", ".join(updated_sections)
    commit_msg = f"policy: update {sections_str} via portal"

    rc, out, err = await _run_git(
        "commit",
        "-m", commit_msg,
        "--author", f"{author} <portal@tiresias.network>",
        cwd=repo_path,
    )
    if rc != 0:
        logger.error("policy.git_push.commit_failed", tenant=tenant_slug, stderr=err)
        raise RuntimeError(f"git commit failed: {err}")

    # Get the new commit hash
    _, commit_hash, _ = await _run_git("rev-parse", "HEAD", cwd=repo_path)

    logger.info(
        "policy.git_push.committed",
        tenant=tenant_slug,
        commit=commit_hash,
        sections=updated_sections,
    )
    return commit_hash


# ---------------------------------------------------------------------------
# 5. push_to_remote
# ---------------------------------------------------------------------------

async def push_to_remote(
    repo_path: Path,
    branch: str = "main",
    deploy_key_path: str | None = None,
) -> bool:
    """
    Push to the remote. Returns True on success, False on failure.
    Failures are logged but not raised (push is non-fatal).
    """
    env = _git_ssh_env(deploy_key_path) if deploy_key_path else None

    try:
        rc, out, err = await _run_git(
            "push", "origin", branch,
            cwd=repo_path,
            timeout=60,
            env=env,
        )
        if rc != 0:
            logger.warning(
                "policy.git_push.push_failed",
                repo=str(repo_path),
                branch=branch,
                stderr=err,
            )
            return False

        logger.info(
            "policy.git_push.pushed",
            repo=str(repo_path),
            branch=branch,
        )
        return True

    except (asyncio.TimeoutError, FileNotFoundError, OSError) as e:
        logger.warning("policy.git_push.push_error", error=str(e))
        return False


# ---------------------------------------------------------------------------
# 6. commit_and_push (orchestrator)
# ---------------------------------------------------------------------------

async def commit_and_push(
    repo_path: Path,
    tenant_slug: str,
    resolved_policy: dict,
    updated_sections: list[str],
    deploy_key_path: str | None = None,
    author: str = "tiresias-portal",
) -> dict:
    """
    Orchestrator: commit policy changes then push to remote.

    Returns::

        {"commit_hash": "abc123", "pushed": True, "error": None}
    """
    result: dict = {"commit_hash": None, "pushed": False, "error": None}

    try:
        commit_hash = await commit_policy_update(
            repo_path=repo_path,
            tenant_slug=tenant_slug,
            resolved_policy=resolved_policy,
            updated_sections=updated_sections,
            author=author,
        )
        result["commit_hash"] = commit_hash
    except Exception as e:
        logger.error("policy.git_push.commit_and_push_failed", error=str(e))
        result["error"] = str(e)
        return result

    # Only push if commit succeeded
    pushed = await push_to_remote(
        repo_path=repo_path,
        deploy_key_path=deploy_key_path,
    )
    result["pushed"] = pushed

    if not pushed:
        result["error"] = "push failed (see logs)"

    return result
