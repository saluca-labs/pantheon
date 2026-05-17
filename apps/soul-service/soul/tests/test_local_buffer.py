"""
Tests for soul/local_buffer.py — SQLite active knowledge base (Tier 0).

All tests use a temp file path so they never touch ~/.soul/active_kb.db.
"""
from __future__ import annotations

import hashlib
import time
import uuid
from pathlib import Path

import pytest

from soul.local_buffer import (
    ActiveBuffer,
    buffer_contains,
    buffer_delete,
    buffer_flush,
    buffer_get,
    buffer_read,
    buffer_size,
    buffer_topic_lookup,
    buffer_write,
    expire_old_entries,
    warm_from_records,
)


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture()
def db_path(tmp_path) -> Path:
    return tmp_path / "test_active_kb.db"


def _ch(content: str) -> str:
    return hashlib.sha256(content.encode()).hexdigest()


def _sh(ids: list[str], session_id: str) -> str:
    payload = session_id + "|" + ",".join(sorted(ids))
    return hashlib.sha256(payload.encode()).hexdigest()


def _write(session_id: str, content: str, topics: list[str], db_path: Path, memory_id: str | None = None) -> str:
    mid = memory_id or str(uuid.uuid4())
    buffer_write(
        memory_id=mid,
        session_id=session_id,
        content=content,
        content_hash_val=_ch(content),
        structure_hash_val=_sh([], session_id),
        topics=topics,
        topic_id=topics[0] if topics else "general",
        path=db_path,
    )
    return mid


# ── Basic write / read ────────────────────────────────────────────────────────

class TestBufferWrite:
    def test_write_returns_no_error(self, db_path):
        _write("s1", "hello world", ["greet"], db_path)

    def test_write_is_readable(self, db_path):
        mid = _write("s1", "test content", ["test"], db_path)
        records = buffer_read("s1", path=db_path)
        assert any(r["memory_id"] == mid for r in records)

    def test_write_contains_check(self, db_path):
        mid = _write("s1", "check me", ["check"], db_path)
        assert buffer_contains(mid, db_path)

    def test_unknown_id_not_contained(self, db_path):
        assert not buffer_contains("nonexistent-id", db_path)

    def test_content_round_trip(self, db_path):
        content = "Soul is a persistent memory system for LLMs."
        mid = _write("s1", content, ["soul"], db_path)
        rec = buffer_get(mid, db_path)
        assert rec is not None
        assert rec["full_context"] == content

    def test_duplicate_write_updates_not_duplicates(self, db_path):
        mid = str(uuid.uuid4())
        _write("s1", "original", ["test"], db_path, memory_id=mid)
        _write("s1", "updated", ["test"], db_path, memory_id=mid)
        assert buffer_size("s1", db_path) == 1

    def test_topics_stored_as_list(self, db_path):
        mid = _write("s1", "topic test", ["alpha", "beta"], db_path)
        rec = buffer_get(mid, db_path)
        assert isinstance(rec["topics"], list)
        assert "alpha" in rec["topics"]

    def test_hash_values_stored(self, db_path):
        content = "hash check"
        mid = _write("s1", content, ["hash"], db_path)
        rec = buffer_get(mid, db_path)
        assert rec["content_hash"] == _ch(content)


class TestBufferRead:
    def test_read_empty_session_returns_empty(self, db_path):
        assert buffer_read("empty-session", path=db_path) == []

    def test_read_returns_oldest_first(self, db_path):
        ids = [_write("s1", f"msg {i}", ["test"], db_path) for i in range(5)]
        records = buffer_read("s1", limit=5, path=db_path)
        returned_ids = [r["memory_id"] for r in records]
        # Oldest first — first written should appear first
        assert returned_ids[0] == ids[0]

    def test_read_respects_limit(self, db_path):
        for i in range(10):
            _write("s1", f"content {i}", ["test"], db_path)
        records = buffer_read("s1", limit=3, path=db_path)
        assert len(records) == 3

    def test_read_session_isolation(self, db_path):
        _write("session-a", "for A", ["a"], db_path)
        _write("session-b", "for B", ["b"], db_path)
        a_records = buffer_read("session-a", path=db_path)
        b_records = buffer_read("session-b", path=db_path)
        assert all(r["session_id"] == "session-a" for r in a_records)
        assert all(r["session_id"] == "session-b" for r in b_records)

    def test_read_updates_last_accessed(self, db_path):
        mid = _write("s1", "access test", ["test"], db_path)
        rec_before = buffer_get(mid, db_path)
        time.sleep(0.01)
        buffer_read("s1", path=db_path)
        rec_after = buffer_get(mid, db_path)
        assert rec_after["last_accessed"] >= rec_before["last_accessed"]


# ── TKHR topic lookup ─────────────────────────────────────────────────────────

class TestTopicLookup:
    def test_lookup_returns_matching_topic(self, db_path):
        mid = _write("s1", "patent content", ["patents"], db_path)
        results = buffer_topic_lookup("patents", session_id="s1", path=db_path)
        assert any(r["memory_id"] == mid for r in results)

    def test_lookup_excludes_other_topics(self, db_path):
        mid_a = _write("s1", "soul memory", ["soul"], db_path)
        mid_b = _write("s1", "patent stuff", ["patents"], db_path)
        results = buffer_topic_lookup("soul", session_id="s1", path=db_path)
        ids = [r["memory_id"] for r in results]
        assert mid_a in ids
        assert mid_b not in ids

    def test_lookup_unknown_topic_returns_empty(self, db_path):
        _write("s1", "something", ["alpha"], db_path)
        assert buffer_topic_lookup("nonexistent_topic", session_id="s1", path=db_path) == []

    def test_lookup_without_session_filter(self, db_path):
        _write("session-x", "cross session", ["shared"], db_path)
        _write("session-y", "also shared", ["shared"], db_path)
        results = buffer_topic_lookup("shared", path=db_path)
        assert len(results) == 2

    def test_lookup_weight_increases_on_repeated_write(self, db_path):
        mid = str(uuid.uuid4())
        _write("s1", "first write", ["topic"], db_path, memory_id=mid)
        _write("s1", "second write", ["topic"], db_path, memory_id=mid)
        results = buffer_topic_lookup("topic", session_id="s1", path=db_path)
        assert results[0]["weight"] > 1.0

    def test_active_buffer_lookup_topic(self, db_path):
        buf = ActiveBuffer("sess-topic", path=db_path)
        mid = str(uuid.uuid4())
        buf.write(mid, "topic test", _ch("topic test"), _sh([], "sess-topic"), ["tiresias"])
        results = buf.lookup_topic("tiresias")
        assert any(r["memory_id"] == mid for r in results)


# ── Delete / eviction ─────────────────────────────────────────────────────────

class TestDeleteEviction:
    def test_delete_removes_record(self, db_path):
        mid = _write("s1", "to delete", ["del"], db_path)
        assert buffer_contains(mid, db_path)
        buffer_delete(mid, db_path)
        assert not buffer_contains(mid, db_path)

    def test_delete_returns_true_on_success(self, db_path):
        mid = _write("s1", "deletable", ["del"], db_path)
        assert buffer_delete(mid, db_path) is True

    def test_delete_returns_false_if_missing(self, db_path):
        assert buffer_delete("nonexistent", db_path) is False

    def test_lru_eviction_on_overflow(self, db_path):
        buf = ActiveBuffer("s-evict", path=db_path, max_size=5)
        ids = []
        for i in range(7):
            mid = str(uuid.uuid4())
            ids.append(mid)
            buf.write(mid, f"content {i}", _ch(f"content {i}"), _sh([], "s-evict"), [f"t{i}"])
        # Buffer should have evicted 2 oldest
        assert buf.size() == 5
        assert len(buf.evicted) == 2
        # Oldest two should be gone
        assert not buffer_contains(ids[0], db_path)
        assert not buffer_contains(ids[1], db_path)
        # Newest five should remain
        for mid in ids[2:]:
            assert buffer_contains(mid, db_path)


# ── TTL expiry ────────────────────────────────────────────────────────────────

class TestTTLExpiry:
    def test_fresh_entries_not_expired(self, db_path):
        mid = _write("s1", "fresh", ["fresh"], db_path)
        deleted = expire_old_entries(path=db_path, ttl_days=7)
        assert deleted == 0
        assert buffer_contains(mid, db_path)

    def test_old_entries_expired(self, db_path):
        mid = str(uuid.uuid4())
        # Write with last_accessed far in the past
        from soul.local_buffer import _conn
        buffer_write(
            memory_id=mid,
            session_id="s1",
            content="old memory",
            content_hash_val=_ch("old memory"),
            structure_hash_val="",
            topics=["old"],
            path=db_path,
        )
        # Manually set last_accessed to 10 days ago
        with _conn(db_path) as conn:
            conn.execute(
                "UPDATE active_memories SET last_accessed = ? WHERE memory_id = ?",
                (time.time() - 10 * 86400, mid),
            )
        deleted = expire_old_entries(path=db_path, ttl_days=7)
        assert deleted == 1
        assert not buffer_contains(mid, db_path)


# ── Warm-up ───────────────────────────────────────────────────────────────────

class TestWarmFromRecords:
    def test_warm_loads_new_records(self, db_path):
        records = [
            {
                "id": str(uuid.uuid4()),
                "session_id": "s1",
                "full_context": f"memory {i}",
                "full_context_hash": _ch(f"memory {i}"),
                "metadata": {"structure_hash": ""},
                "topics": ["warm"],
                "topic_id": "warm",
                "node_type": "full",
                "created_at": time.time(),
            }
            for i in range(5)
        ]
        loaded, skipped = warm_from_records(records, path=db_path)
        assert loaded == 5
        assert skipped == 0

    def test_warm_skips_existing(self, db_path):
        mid = _write("s1", "already warm", ["warm"], db_path)
        records = [
            {
                "id": mid,
                "session_id": "s1",
                "full_context": "already warm",
                "full_context_hash": _ch("already warm"),
                "metadata": {},
                "topics": ["warm"],
                "topic_id": "warm",
                "node_type": "full",
                "created_at": time.time(),
            }
        ]
        loaded, skipped = warm_from_records(records, path=db_path)
        assert loaded == 0
        assert skipped == 1

    def test_repeat_session_start_mostly_skipped(self, db_path):
        # First warm-up
        records = [
            {
                "id": str(uuid.uuid4()),
                "session_id": "s1",
                "full_context": f"session memory {i}",
                "full_context_hash": _ch(f"session memory {i}"),
                "metadata": {},
                "topics": ["session"],
                "topic_id": "session",
                "node_type": "full",
                "created_at": time.time(),
            }
            for i in range(10)
        ]
        loaded1, skipped1 = warm_from_records(records, path=db_path)
        # Second warm-up (same records — simulates repeat session start)
        loaded2, skipped2 = warm_from_records(records, path=db_path)
        assert loaded1 == 10
        assert loaded2 == 0
        assert skipped2 == 10


# ── Flush ─────────────────────────────────────────────────────────────────────

class TestFlush:
    def test_flush_returns_all_records(self, db_path):
        for i in range(4):
            _write("s-flush", f"content {i}", ["flush"], db_path)
        flushed = buffer_flush("s-flush", path=db_path)
        assert len(flushed) == 4

    def test_flush_clears_buffer(self, db_path):
        _write("s-flush2", "to flush", ["flush"], db_path)
        buffer_flush("s-flush2", path=db_path)
        assert buffer_size("s-flush2", db_path) == 0

    def test_active_buffer_flush(self, db_path):
        buf = ActiveBuffer("s-ab-flush", path=db_path)
        for i in range(3):
            mid = str(uuid.uuid4())
            buf.write(mid, f"msg {i}", _ch(f"msg {i}"), _sh([], "s-ab-flush"), ["flush"])
        flushed = buf.flush()
        assert len(flushed) == 3
        assert buf.size() == 0


# ── ActiveBuffer class ────────────────────────────────────────────────────────

class TestActiveBuffer:
    def test_init_creates_buffer(self, db_path):
        buf = ActiveBuffer("sess-init", path=db_path)
        assert buf.session_id == "sess-init"
        assert buf.size() == 0

    def test_write_and_read(self, db_path):
        buf = ActiveBuffer("sess-rw", path=db_path)
        mid = str(uuid.uuid4())
        buf.write(mid, "test", _ch("test"), _sh([], "sess-rw"), ["rw"])
        records = buf.read()
        assert len(records) == 1
        assert records[0]["memory_id"] == mid

    def test_contains(self, db_path):
        buf = ActiveBuffer("sess-contains", path=db_path)
        mid = str(uuid.uuid4())
        buf.write(mid, "x", _ch("x"), _sh([], "sess-contains"), ["x"])
        assert buf.contains(mid)
        assert not buf.contains("unknown")

    def test_get_by_id(self, db_path):
        buf = ActiveBuffer("sess-get", path=db_path)
        mid = str(uuid.uuid4())
        buf.write(mid, "get test", _ch("get test"), _sh([], "sess-get"), ["get"])
        rec = buf.get(mid)
        assert rec is not None
        assert rec["full_context"] == "get test"

    def test_warm_from(self, db_path):
        buf = ActiveBuffer("sess-warm", path=db_path)
        records = [
            {
                "id": str(uuid.uuid4()),
                "session_id": "sess-warm",
                "full_context": f"warm {i}",
                "full_context_hash": _ch(f"warm {i}"),
                "metadata": {},
                "topics": ["warm"],
                "topic_id": "warm",
                "node_type": "full",
                "created_at": time.time(),
            }
            for i in range(3)
        ]
        loaded, skipped = buf.warm_from(records)
        assert loaded == 3
        assert skipped == 0
        assert buf.size() == 3
