"""
test_prev_hash_chain.py — Linear forensic chain (SALUCA-013 §7.3) unit tests.

Verifies the chain math implemented by hashing.chain_genesis_hash() and
hashing.next_prev_hash() against an independently-computed reference.

The integration with storage.write_memory() is exercised in
test_session_continuity.py; this file focuses on the pure-hash algorithm and
edge cases (genesis, single-row chain, NULL session_id orphan key).

Run:
  pytest soul/tests/test_prev_hash_chain.py -v
  python3 soul/tests/test_prev_hash_chain.py
"""

import hashlib

from soul.hashing import (
    chain_genesis_hash,
    content_hash,
    next_prev_hash,
    GENESIS_PREFIX,
    ORPHAN_KEY,
)


def _ref_sha256(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def test_genesis_hash_named_session():
    """Genesis = SHA-256('hctp-genesis-v1::alfred-main')."""
    expected = _ref_sha256("hctp-genesis-v1::alfred-main")
    assert chain_genesis_hash("alfred-main") == expected


def test_genesis_hash_null_session_uses_orphan_key():
    """NULL session_id falls back to the orphan key (preserves the NULL column)."""
    expected = _ref_sha256("hctp-genesis-v1::_orphan_pre_session_id")
    assert chain_genesis_hash(None) == expected
    # Same hash should result regardless of which call path produced None
    assert chain_genesis_hash("") == _ref_sha256("hctp-genesis-v1::_orphan_pre_session_id")


def test_genesis_constants_match_canonical_prefix():
    """Guard against accidental edits to the genesis prefix or orphan key."""
    assert GENESIS_PREFIX == "hctp-genesis-v1::"
    assert ORPHAN_KEY == "_orphan_pre_session_id"


def test_next_prev_hash_formula():
    """prev_hash[N] = SHA-256(prev.full_context_hash || prev.prev_hash)."""
    prev_content = "deadbeef" * 8  # 64 hex chars (mock SHA-256)
    prev_prev = "cafef00d" * 8
    expected = _ref_sha256(prev_content + prev_prev)
    assert next_prev_hash(prev_content, prev_prev) == expected


def test_full_chain_five_rows():
    """Roll a 5-row chain forward, verifying every link end-to-end."""
    session_id = "test-session-xyz"
    contents = [f"row-{i}-content" for i in range(5)]
    content_hashes = [content_hash(c) for c in contents]

    genesis = chain_genesis_hash(session_id)
    prev_hashes = [genesis]
    for i in range(1, 5):
        # Each new row's prev_hash uses the prior row's (content_hash, prev_hash)
        prev_hashes.append(next_prev_hash(content_hashes[i - 1], prev_hashes[i - 1]))

    # Independent reference computation
    ref = [_ref_sha256("hctp-genesis-v1::" + session_id)]
    for i in range(1, 5):
        ref.append(_ref_sha256(content_hashes[i - 1] + ref[i - 1]))

    assert prev_hashes == ref


def test_chain_detects_content_tampering():
    """If row N-1's content is mutated, recomputing row N's prev_hash fails to match."""
    session_id = "tamper-test"
    original = "the original payload"
    tampered = "the tampered payload"
    genesis = chain_genesis_hash(session_id)

    legitimate = next_prev_hash(content_hash(original), genesis)
    if_tampered = next_prev_hash(content_hash(tampered), genesis)

    assert legitimate != if_tampered, "tamper-evidence broken — collision on content swap"


def test_chain_detects_genesis_swap():
    """Two different session_ids must produce different genesis hashes."""
    assert chain_genesis_hash("session-a") != chain_genesis_hash("session-b")
    assert chain_genesis_hash("alfred-main") != chain_genesis_hash("alfred-coo")


def test_chain_single_row_is_just_genesis():
    """A session with one row has prev_hash equal to the genesis. The chain
    has no internal links to verify; only future writes will extend it."""
    session_id = "lonely-session"
    g = chain_genesis_hash(session_id)
    assert g == _ref_sha256("hctp-genesis-v1::" + session_id)


def test_known_alfred_main_genesis():
    """Regression check against the prod alfred-main genesis written 2026-05-18."""
    assert chain_genesis_hash("alfred-main") == (
        "547bb22dad52a5b660f7b807307263dec8dec9bed8328290927402873f888f73"
    )


if __name__ == "__main__":
    import sys
    test_genesis_hash_named_session()
    test_genesis_hash_null_session_uses_orphan_key()
    test_genesis_constants_match_canonical_prefix()
    test_next_prev_hash_formula()
    test_full_chain_five_rows()
    test_chain_detects_content_tampering()
    test_chain_detects_genesis_swap()
    test_chain_single_row_is_just_genesis()
    test_known_alfred_main_genesis()
    print("All chain tests passed.")
    sys.exit(0)
