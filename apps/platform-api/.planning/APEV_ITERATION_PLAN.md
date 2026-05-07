# Tiresias Platform — APE/V Iteration Plan

**Date:** 2026-04-08  
**Version:** v3.4.4 → v3.5.0 (MVP Polish)  
**Status:** Ready for Execution  
**Owner:** Cristian + Alfred (5090 coding model loop)

---

## Executive Summary

**Current State:** ~85% MVP Ready  
**Target:** 100% Production Polish  
**Estimated Effort:** 2-3 weeks focused iteration

### Assessment Results

| Component | Readiness | Critical Gaps |
|-----------|-----------|---------------|
| SoulAuth | 95% | SOP endpoint placeholder, CLAW adapters incomplete |
| SoulGate | 85% | Geo-IP integration missing |
| SoulWatch | 95% | Geo-enrichment internal-only (acceptable) |
| Aletheia | 98% | Production-ready |
| Portal | 90% | README not customized |
| Testing | 70% | No load tests, no coverage gate |
| Documentation | 85% | Missing DR runbook, incident response |
| Security | 90% | SQL injection risks in 2 files |

---

## APE/V WORKFLOW STRUCTURE

### Phase 1: Security & Critical Fixes (Days 1-3)

**Priority:** BLOCKER — Must complete before any feature work

| ID | Issue | File(s) | Effort | Verification |
|----|-------|---------|--------|--------------|
| S1 | SQL injection in contracts | `src/contracts/chain.py:54,97` | 2hr | Parameterized queries |
| S2 | SQL injection in partner admin | `src/partner/admin_router.py:647,652` | 1hr | Parameterized queries |
| S3 | Geo-IP integration | `soulGate/src/access/geo.py:33` | 4hr | MaxMind GeoLite2 or cloud IP metadata |
| S4 | CLAW adapter placeholders | `src/compatibility/adapter.py:86,111,136` | 2hr | Implement or remove module |
| S5 | SOP compliance endpoint | `src/tiresias/routers/auth.py:71` | 2hr | Wire to SoulKey resolution |

**Completion Criteria:**
- [ ] All SQL queries use parameterized bindings
- [ ] Geo-IP rules functional (country-based access works)
- [ ] CLAW adapters either implemented or module removed
- [ ] SOP endpoint returns actual compliance status

---

### Phase 2: Performance & Code Quality (Days 4-7)

**Priority:** HIGH — Technical debt reduction

| ID | Issue | File(s) | Effort | Verification |
|----|-------|---------|--------|--------------|
| P1 | Memory leak in detector | `src/analytics/detector.py:137-146` | 2hr | Add TTL/pruning to event windows |
| P2 | N+1 Stripe queries | `src/partner/admin_router.py:260-273` | 2hr | Batch Stripe API calls |
| P3 | Duplicated CLAW adapters | `src/compatibility/adapter.py:75-147` | 3hr | Refactor to base class + config |
| P4 | Over-complex check_event() | `src/analytics/detector.py:148` | 4hr | Split into per-anomaly methods |
| P5 | Over-complex SoulAuthSidecar | `src/compatibility/adapter.py:742` | 4hr | Extract token cache, health check as separate classes |
| P6 | Missing type hints | `src/contracts/chain.py`, `src/analytics/detector.py` | 4hr | TypedDict for DB returns, proper generics |
| P7 | Debug print statements | `src/sdk/__init__.py:17`, `src/saas/trial_expiry.py:128` | 1hr | Replace with structlog |

**Completion Criteria:**
- [ ] Event windows have TTL/pruning
- [ ] Stripe calls batched (max 1 API call per 10 partners)
- [ ] CLAW adapters use base class
- [ ] check_event() split into 18+ focused methods
- [ ] All debug prints replaced with structlog
- [ ] Type hints pass mypy --strict

---

### Phase 3: Configuration & Flexibility (Days 8-10)

**Priority:** HIGH — Production operational requirements

| ID | Issue | File(s) | Effort | Verification |
|----|-------|---------|--------|--------------|
| C1 | Hardcoded tier limits | `src/tier.py` | 3hr | Move to database, admin API for updates |
| C2 | Hardcoded RBAC permissions | `src/auth/rbac.py` | 4hr | Tenant-configurable permissions table |
| C3 | Hardcoded watchdog intervals | `src/main.py:183,187` | 1hr | Environment variable config |
| C4 | Outdated dependencies | `requirements.txt` | 4hr | Update to latest stable, test compatibility |

**Completion Criteria:**
- [ ] Tier limits queryable/updatable via admin API
- [ ] RBAC permissions stored in DB with tenant override
- [ ] All intervals configurable via .env
- [ ] Dependencies updated with changelog review

---

### Phase 4: Testing & CI (Days 11-14)

**Priority:** HIGH — MVP gate requirements

| ID | Issue | File(s) | Effort | Verification |
|----|-------|---------|--------|--------------|
| T1 | No coverage gate | `.github/workflows/ci.yml` | 2hr | Add pytest-cov with 70% threshold |
| T2 | No load testing suite | New: `tests/load/` | 8hr | Locust scripts for auth, PDP, token validation |
| T3 | No chaos/failure tests | New: `tests/chaos/` | 6hr | License service down, DB failover, Redis outage |
| T4 | Security test suite | `tests/security/` | 4hr | SQL injection, XSS, CSRF, rate limit bypass |
| T5 | pip-audit gate | `.github/workflows/ci.yml` | 1hr | Block PRs with known vulnerabilities |

**Completion Criteria:**
- [ ] CI fails below 70% coverage
- [ ] Load test suite runs in CI (or nightly)
- [ ] Chaos tests validate graceful degradation
- [ ] Security tests pass (no regressions)
- [ ] pip-audit blocks vulnerable dependencies

---

### Phase 5: Documentation & Runbooks (Days 15-17)

**Priority:** MEDIUM — Operational readiness

| ID | Issue | File(s) | Effort | Verification |
|----|-------|---------|--------|--------------|
| D1 | Disaster recovery runbook | New: `docs/runbooks/disaster-recovery.md` | 4hr | Backup/restore procedures tested |
| D2 | Incident response playbook | New: `docs/runbooks/incident-response.md` | 3hr | Escalation matrix, communication templates |
| D3 | API reference docs | New: `docs/api/openapi.yaml` | 4hr | Auto-generated from FastAPI, served at /docs |
| D4 | Portal README | `portal/README.md` | 1hr | Replace Next.js template with actual docs |
| D5 | Update IMPLEMENTATION_ROADMAP.md | Root level | 1hr | Mark Day 1-10 complete, add new phases |
| D6 | Add PGP key to SECURITY.md | Root level | 1hr | Generate and publish fingerprint |

**Completion Criteria:**
- [ ] DR runbook tested (restore from backup)
- [ ] Incident response playbook reviewed
- [ ] /docs endpoint serves OpenAPI spec
- [ ] Portal README is project-specific
- [ ] Roadmap reflects current state
- [ ] SECURITY.md has PGP fingerprint

---

### Phase 6: Observability Enhancements (Days 18-20)

**Priority:** MEDIUM — Production monitoring

| ID | Issue | File(s) | Effort | Verification |
|----|-------|---------|--------|--------------|
| O1 | Add Sentry/error tracking | `src/main.py`, Dockerfile | 3hr | Self-hosted Sentry or cloud |
| O2 | Prometheus metrics for detector | `src/analytics/detector.py` | 4hr | Anomaly rate, false positive rate, latency |
| O3 | Metrics for playbooks | `src/detection/playbooks.py` | 2hr | Execution time, success rate, cooldown hits |
| O4 | Circuit breaker metrics | `soulGate/` | 2hr | Open/closed/half-open state, trip count |
| O5 | Audit logging for DB queries | `src/contracts/chain.py` | 2hr | Query duration, error rates |

**Completion Criteria:**
- [ ] Errors reported to Sentry with trace context
- [ ] Grafana dashboard shows anomaly detection metrics
- [ ] Playbook execution visible in metrics
- [ ] Circuit breaker state exposed
- [ ] Slow query logging enabled

---

## ITERATION WORKFLOW (5090 Loop)

### Setup Instructions

```bash
# On Reatan (5090 node)
cd Z:/tiresias

# Start Ollama with coding model
ollama pull qwen3-coder:30b-a3b-q4_K_M

# Run iteration loop
python "C:/Users/cris/.claude/tools/ollama_sub.py" \
  --system "You are a senior Python engineer reviewing Tiresias for production readiness. \
            Focus on: security, performance, code quality, testing. \
            Output: specific file paths, line numbers, exact fixes." \
  --prompt "Review Phase 1 files for security issues. For each finding: \
            1. Quote the problematic code \
            2. Explain the issue \
            3. Provide the exact fix \
            4. Note any test updates needed"
```

### Loop Structure

For each phase:

1. **Input:** Phase requirements + target files
2. **Model reviews:** Code + context (ARCH.md, SPEC.md)
3. **Output:** Specific fixes with file paths
4. **Cristian reviews:** Approves/rejects changes
5. **Alfred applies:** Edits code, runs tests
6. **Verify:** CI passes, manual testing if needed

### Context Files for Model

Always include:
- `ARCHITECTURE.md` — System design
- `SPEC.md` — Original requirements
- `docs/ADMIN_GUIDE.md` — Deployment context
- Current phase requirements from this plan

---

## PROGRESS TRACKING

### Phase Status

| Phase | Status | Started | Completed | Notes |
|-------|--------|---------|-----------|-------|
| 1: Security | Pending | - | - | BLOCKER |
| 2: Performance | Pending | - | - | - |
| 3: Configuration | Pending | - | - | - |
| 4: Testing | Pending | - | - | MVP Gate |
| 5: Documentation | Pending | - | - | - |
| 6: Observability | Pending | - | - | - |

### Version Checklist

**v3.5.0 MVP Criteria:**
- [ ] All Phase 1-4 items complete
- [ ] CI passes with coverage gate
- [ ] Load test baseline established
- [ ] DR runbook tested
- [ ] No critical security findings
- [ ] Geo-IP functional
- [ ] All placeholders removed or implemented

---

## FILES REQUIRING REVIEW

### Critical Path (Phase 1)

| File | Lines | Issue |
|------|-------|-------|
| `src/contracts/chain.py` | 54, 97 | SQL injection |
| `src/partner/admin_router.py` | 647, 652 | SQL injection |
| `soulGate/src/access/geo.py` | 33 | Geo-IP placeholder |
| `src/compatibility/adapter.py` | 86, 111, 136 | CLAW placeholders |
| `src/tiresias/routers/auth.py` | 71 | SOP placeholder |

### High Priority (Phase 2)

| File | Lines | Issue |
|------|-------|-------|
| `src/analytics/detector.py` | 137-146, 148 | Memory leak, over-complex |
| `src/partner/admin_router.py` | 260-273 | N+1 queries |
| `src/compatibility/adapter.py` | 75-147, 742 | Duplication, over-complex |
| `src/contracts/chain.py` | 36-76 | Missing type hints |
| `src/sdk/__init__.py` | 17 | Debug print |
| `src/saas/trial_expiry.py` | 128 | Debug print |

---

## NEXT SESSION HANDOFF

**For Cristian:**
This plan is ready to execute. Start a new session with:

```
Execute APE/V iteration on Tiresias Phase 1 (Security).
Use 5090 coding model (qwen3-coder:30b) to review:
- src/contracts/chain.py (lines 54, 97)
- src/partner/admin_router.py (lines 647, 652)
- soulGate/src/access/geo.py (line 33)
- src/compatibility/adapter.py (lines 86, 111, 136)
- src/tiresias/routers/auth.py (line 71)

For each: identify exact issue, provide fix, update tests.
Reference: Z:/tiresias/.planning/APEV_ITERATION_PLAN.md
```

**Expected Output per Loop:**
- List of issues found
- Exact code changes (diffs)
- Test updates required
- Verification steps

---

## APPENDIX: Full Assessment Reports

### Production Readiness Summary (Agent Report)
- SoulAuth: 95%
- SoulGate: 85% (Geo-IP gap)
- SoulWatch: 95%
- Aletheia: 98%
- Portal: 90%
- Testing: 70%
- Documentation: 85%
- Security: 90%

### Code Review Summary (Agent Report)
- Critical: 3 (SQL injection)
- High: 5 (memory, N+1, missing indexes)
- Medium: 8 (duplication, complexity, types)
- Low: 6 (debug prints, outdated deps)

**Total Issues:** 22+ across 15+ files

---

**End of Plan**
