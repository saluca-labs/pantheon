"""Hashing and ID-generation utilities for the App Proxy."""

from __future__ import annotations

import hashlib
import json
import uuid


def hash_arguments(args: dict) -> str:
    """Return the SHA-256 hex digest of *args* serialised with sorted keys."""
    payload = json.dumps(args, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def hash_result(result: dict) -> str:
    """Return the SHA-256 hex digest of *result* serialised with sorted keys."""
    payload = json.dumps(result, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def generate_call_id() -> str:
    """Generate a unique call ID (UUID v4, lowercase hex with dashes)."""
    return str(uuid.uuid4())


def generate_audit_ref() -> str:
    """Generate a unique audit reference (UUID v4, lowercase hex with dashes)."""
    return str(uuid.uuid4())
