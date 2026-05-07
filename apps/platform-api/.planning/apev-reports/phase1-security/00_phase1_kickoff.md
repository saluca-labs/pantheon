# Phase 1: Security Fixes — Iteration Report

**Started:** 2026-04-08  
**Model:** qwen3-coder:30b-a3b-q4_K_M (5090 GPU)  
**Status:** In Progress  

---

## Scope

| ID | File | Lines | Issue | Priority |
|----|------|-------|-------|----------|
| S1 | `src/contracts/chain.py` | 54, 97 | SQL injection | BLOCKER |
| S2 | `src/partner/admin_router.py` | 647, 652 | SQL injection | BLOCKER |
| S3 | `soulGate/src/access/geo.py` | 33 | Geo-IP placeholder | HIGH |
| S4 | `src/compatibility/adapter.py` | 86, 111, 136 | CLAW placeholders | HIGH |
| S5 | `src/tiresias/routers/auth.py` | 71 | SOP endpoint placeholder | HIGH |

---

## Iteration Log

### Iteration 1: SQL Injection Fixes

**Files Reviewed:**
- `src/contracts/chain.py`
- `src/partner/admin_router.py`

**Findings:**

#### S1: src/contracts/chain.py:54

**Original Code:**
```python
# VULNERABLE - f-string SQL injection
result = await db.execute(text(f"""
    SELECT id, version, status, content_hash, prev_hash, content,
           review_status, review_risk_score, submitted_by, created_at
    FROM _soul_contracts
    WHERE {where}
    ORDER BY version DESC LIMIT 1
"""), params)
```

**Issue:** The `where` clause is constructed via string concatenation from user input. Even though `params` is passed, the `where` string itself can contain malicious SQL.

**Fix Required:**
```python
# SECURE - Parameterized query with explicit column filtering
ALLOWED_COLUMNS = {"status", "review_status", "submitted_by"}

def build_where_clause(filters: dict) -> tuple[str, dict]:
    conditions = []
    for col, val in filters.items():
        if col not in ALLOWED_COLUMNS:
            raise ValueError(f"Invalid column: {col}")
        conditions.append(f"{col} = :{col}")
    return " AND ".join(conditions), filters

# Usage:
where_clause, params = build_where_clause(user_filters)
result = await db.execute(text(f"""
    SELECT id, version, status, content_hash, prev_hash, content,
           review_status, review_risk_score, submitted_by, created_at
    FROM _soul_contracts
    WHERE {where_clause}
    ORDER BY version DESC LIMIT 1
"""), params)
```

**Test Updates Needed:**
- Add SQL injection test case to `tests/security/test_sql_injection.py`
- Verify parameterized queries in `tests/contracts/test_chain.py`

---

#### S2: src/partner/admin_router.py:647

**Original Code:**
```python
# VULNERABLE - f-string SQL injection
count_result = await db.execute(
    text(f"SELECT count(*) FROM _partner_invitations WHERE {where_clause}"),
    params,
)
```

**Fix Required:** Same pattern as S1 — whitelist columns, build conditions safely.

---

### Iteration 2: Geo-IP Integration

**File:** `soulGate/src/access/geo.py:33`

**Status:** Pending review

---

### Iteration 3: CLAW Adapters

**File:** `src/compatibility/adapter.py:86,111,136`

**Status:** Pending review

---

### Iteration 4: SOP Endpoint

**File:** `src/tiresias/routers/auth.py:71`

**Status:** Pending review

---

## Commit Checklist

- [ ] S1: SQL injection fix in chain.py
- [ ] S2: SQL injection fix in admin_router.py
- [ ] S3: Geo-IP integration complete
- [ ] S4: CLAW adapters implemented or removed
- [ ] S5: SOP endpoint functional
- [ ] All tests passing
- [ ] Security test suite updated
- [ ] CHANGELOG.md updated
- [ ] Version bumped to v3.5.0-alpha1

---

## Notes

- All fixes must include test coverage
- Security fixes require explicit test cases demonstrating the vulnerability is closed
- Document any breaking changes in CHANGELOG.md
