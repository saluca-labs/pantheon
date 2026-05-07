"""
Tests for git-based policy sync and validation.
"""

import os
import tempfile
from pathlib import Path

import pytest
import yaml

from src.policy.git_sync import (
    validate_policy_yaml,
    compute_policy_hash,
    PolicySyncManager,
    PolicyVersion,
)
from src.policy.loader import ResolvedPolicy


@pytest.fixture
def policy_repo_with_errors(tmp_path):
    """Create a policy repo with some intentionally broken files."""
    tenant_dir = tmp_path / "tenants" / "broken" / "personas"
    tenant_dir.mkdir(parents=True)
    shared_dir = tmp_path / "shared"
    shared_dir.mkdir()

    # Valid policy
    valid = {
        "metadata": {"persona": "valid", "role": "agent"},
        "spec": {"resources": {"memory": [{"actions": ["read"]}]}},
    }
    with open(tenant_dir / "valid.yaml", "w") as f:
        yaml.dump(valid, f)

    # Missing metadata
    no_meta = {"spec": {"resources": {}}}
    with open(tenant_dir / "no_meta.yaml", "w") as f:
        yaml.dump(no_meta, f)

    # Missing spec
    no_spec = {"metadata": {"persona": "no-spec", "role": "agent"}}
    with open(tenant_dir / "no_spec.yaml", "w") as f:
        yaml.dump(no_spec, f)

    # Resource not a list
    bad_resource = {
        "metadata": {"persona": "bad", "role": "agent"},
        "spec": {"resources": {"memory": "not-a-list"}},
    }
    with open(tenant_dir / "bad_resource.yaml", "w") as f:
        yaml.dump(bad_resource, f)

    return tmp_path


class TestPolicyValidation:
    """Tests for policy YAML validation."""

    def test_validate_valid_policies(self, policy_repo):
        """Valid policies produce no errors."""
        errors = validate_policy_yaml(str(policy_repo), "saluca")
        assert len(errors) == 0

    def test_validate_missing_metadata(self, policy_repo_with_errors):
        """Missing metadata section is caught."""
        errors = validate_policy_yaml(str(policy_repo_with_errors), "broken")
        metadata_errors = [e for e in errors if "metadata" in e.lower()]
        assert len(metadata_errors) > 0

    def test_validate_missing_spec(self, policy_repo_with_errors):
        """Missing spec section is caught."""
        errors = validate_policy_yaml(str(policy_repo_with_errors), "broken")
        spec_errors = [e for e in errors if "spec" in e.lower()]
        assert len(spec_errors) > 0

    def test_validate_bad_resource_format(self, policy_repo_with_errors):
        """Non-list resource is caught."""
        errors = validate_policy_yaml(str(policy_repo_with_errors), "broken")
        resource_errors = [e for e in errors if "must be a list" in e]
        assert len(resource_errors) > 0

    def test_validate_nonexistent_tenant(self, tmp_path):
        """Non-existent tenant directory produces error."""
        errors = validate_policy_yaml(str(tmp_path), "nonexistent")
        assert len(errors) == 1
        assert "not found" in errors[0]


class TestPolicyHash:
    """Tests for policy content hashing."""

    def test_same_policies_same_hash(self):
        """Same policy content produces same hash."""
        policy_data = {
            "metadata": {"persona": "test", "role": "agent"},
            "spec": {"jit": {}, "escalation": {}, "resources": {}},
        }
        p1 = ResolvedPolicy(policy_data)
        p2 = ResolvedPolicy(policy_data)

        h1 = compute_policy_hash([("test", p1)])
        h2 = compute_policy_hash([("test", p2)])
        assert h1 == h2

    def test_different_policies_different_hash(self):
        """Different policies produce different hashes."""
        p1 = ResolvedPolicy({
            "metadata": {"persona": "a", "role": "agent"},
            "spec": {"resources": {}},
        })
        p2 = ResolvedPolicy({
            "metadata": {"persona": "b", "role": "admin"},
            "spec": {"resources": {}},
        })
        h1 = compute_policy_hash([("a", p1)])
        h2 = compute_policy_hash([("b", p2)])
        assert h1 != h2


class TestPolicySyncManager:
    """Tests for the PolicySyncManager."""

    def test_needs_sync_on_first_call(self, policy_repo):
        """First check always needs sync."""
        manager = PolicySyncManager(str(policy_repo))
        assert manager.needs_sync("saluca") is True

    def test_no_sync_after_mark(self, policy_repo):
        """After marking synced, no sync needed."""
        manager = PolicySyncManager(str(policy_repo))
        policies = manager.get_policies("saluca")
        manager.mark_synced("saluca", policies)
        assert manager.needs_sync("saluca") is False

    def test_validate_valid(self, policy_repo):
        """Validate returns empty for valid policies."""
        manager = PolicySyncManager(str(policy_repo))
        errors = manager.validate("saluca")
        assert len(errors) == 0


class TestPolicyVersion:
    """Tests for PolicyVersion data class."""

    def test_policy_version_to_dict(self):
        """PolicyVersion serializes correctly."""
        from datetime import datetime, timezone
        v = PolicyVersion(
            commit_hash="abc123def456",
            timestamp=datetime(2026, 3, 17, tzinfo=timezone.utc),
            message="Update policies",
        )
        d = v.to_dict()
        assert d["commit_hash"] == "abc123def456"
        assert "2026-03-17" in d["timestamp"]
        assert d["message"] == "Update policies"
