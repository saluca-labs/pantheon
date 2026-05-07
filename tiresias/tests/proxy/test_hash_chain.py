"""Unit tests for the SECURITY audit hash chain (Phase B)."""
from __future__ import annotations

import hashlib
import json


from tiresias.proxy.audit_handler import _GENESIS, _compute_row_hash


def _h(prev, et, ts, aid, rid, payload):
    return _compute_row_hash(prev, et, ts, aid, rid, json.dumps(payload, sort_keys=True))


def test_chain_build_three_rows():
    """Three rows chained: row1.prev=genesis, row2.prev=row1.row_hash, etc."""
    r1 = _h(_GENESIS, "auth.deny", "2026-04-15T12:00:00Z", "actor-1", "soulkey-1", {"k": 1})
    r2 = _h(r1, "auth.deny", "2026-04-15T12:00:01Z", "actor-1", "soulkey-1", {"k": 2})
    r3 = _h(r2, "auth.deny", "2026-04-15T12:00:02Z", "actor-1", "soulkey-1", {"k": 3})

    assert r1 != r2 != r3
    # Deterministic: same inputs produce same output
    r1b = _h(_GENESIS, "auth.deny", "2026-04-15T12:00:00Z", "actor-1", "soulkey-1", {"k": 1})
    assert r1 == r1b


def test_chain_break_detection_payload_tamper():
    """If payload is mutated but row_hash kept, re-derivation must mismatch."""
    r1 = _h(_GENESIS, "auth.deny", "2026-04-15T12:00:00Z", "actor-1", "soulkey-1", {"k": 1})
    tampered = _h(_GENESIS, "auth.deny", "2026-04-15T12:00:00Z", "actor-1", "soulkey-1", {"k": 99})
    assert r1 != tampered


def test_chain_break_detection_prev_hash_tamper():
    """Substituting prev_hash produces a different row_hash."""
    r1 = _h(_GENESIS, "auth.deny", "2026-04-15T12:00:00Z", "a", "r", {"x": 1})
    r2_correct = _h(r1, "auth.deny", "2026-04-15T12:00:01Z", "a", "r", {"x": 2})
    r2_forged = _h("bogus_prev", "auth.deny", "2026-04-15T12:00:01Z", "a", "r", {"x": 2})
    assert r2_correct != r2_forged


def test_genesis_hash_value():
    """First row's prev_hash is the literal 'genesis' string."""
    assert _GENESIS == "genesis"


def test_hash_is_sha256_hex():
    """Row hash should be 64 chars of hex (SHA-256)."""
    r = _h(_GENESIS, "e", "2026-04-15T00:00:00Z", "a", "r", {})
    assert len(r) == 64
    int(r, 16)  # raises if not hex
