---
phase: 06-prh-engine
plan: 01
subsystem: detection
tags: [prh, regex, python, prompt-injection, jailbreak, pii, threat-detection]

# Dependency graph
requires: []
provides:
  - "src/prh/__init__.py: module entry exposing PRHAnalyzer, PRHResult, CATEGORIES, CATEGORY_PATTERNS"
  - "src/prh/patterns.py: 60 compiled regex patterns across 6 threat categories"
  - "src/prh/analyzer.py: PRHAnalyzer class with analyze() returning PRHResult"
affects:
  - "06-02: PRH middleware (imports PRHAnalyzer directly)"
  - "06-03: PRH API endpoint (imports PRHAnalyzer directly)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Probabilistic scoring: score = 1 - product(1-weight_i) per category, avoids linear overflow"
    - "Module-level singleton: get_analyzer() for shared PRHAnalyzer instance"
    - "TypedDict PatternDef for typed pattern definitions with compiled regex"
    - "Cross-category bonus (+0.05 per active category above 1, max +0.15)"

key-files:
  created:
    - "~/tiresias/src/prh/__init__.py"
    - "~/tiresias/src/prh/patterns.py"
    - "~/tiresias/src/prh/analyzer.py"
  modified: []

key-decisions:
  - "PRH as pure Python module with no I/O — keeps deployment simple, no new infrastructure"
  - "Probabilistic scoring (not additive) — prevents score saturation when multiple patterns match"
  - "10 patterns per category (60 total) — sufficient coverage for all known threat vectors"
  - "Structural heuristics as separate pass — catches format-level attacks not covered by lexical patterns"

patterns-established:
  - "PRH categories: injection, jailbreak, data_exfil, pii_leak, instruction_override, role_manipulation"
  - "PRHResult.to_dict() for JSON serialization — consistent with API response pattern"
  - "analyze() never raises — returns zero-score result on unexpected errors with logged warning"

requirements-completed: [PRH-01, PRH-02]

# Metrics
duration: 18min
completed: 2026-03-21
---

# Phase 6 Plan 01: PRH Core Engine Summary

**60-pattern regex scoring engine for 6 AI threat categories (injection/jailbreak/PII/exfil/override/role) running at 0.39ms avg via probabilistic multi-pattern scoring**

## Performance

- **Duration:** 18 min
- **Started:** 2026-03-21T00:06:40Z
- **Completed:** 2026-03-21T00:24:00Z
- **Tasks:** 2
- **Files modified:** 3 (created)

## Accomplishments
- 60 compiled regex patterns across 6 threat categories (10 per category) covering all major prompt attack vectors
- PRHAnalyzer.analyze() returns typed PRHResult with score 0.0-1.0, dominant category, matched patterns, confidence, and per-category scores
- Probabilistic scoring avoids linear sum overflow — each matched pattern multiplies remaining probability mass
- All 6 inline assertions pass: injection flagged, benign clean, PII detected, jailbreak scored >= 0.7, empty prompt returns 0.0
- Avg analysis time 0.39ms (well under 50ms target)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create src/prh/patterns.py — 6-category regex pattern library** - `7aa06a4` (feat)
2. **Task 2: Create src/prh/analyzer.py — PRHAnalyzer scoring engine** - `d39f61f` (feat)

## Files Created/Modified
- `~/tiresias/src/prh/__init__.py` - Module entry point exposing PRHAnalyzer, PRHResult, CATEGORIES, CATEGORY_PATTERNS
- `~/tiresias/src/prh/patterns.py` - 60 compiled regex patterns in 6 categories, PatternDef TypedDict, _compile() helper
- `~/tiresias/src/prh/analyzer.py` - PRHAnalyzer class, PRHResult dataclass, structural heuristics, get_analyzer() singleton

## Decisions Made
- Used probabilistic scoring (1 - product) instead of additive sum to avoid score saturation when multiple patterns match the same prompt
- Structural heuristics as a second pass after lexical patterns — catches delimiter injection and format-level attacks separately from content patterns
- Cross-category bonus capped at +0.15 to reward multi-signal prompts without allowing false positives on benign multi-topic text

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Bash heredoc quoting issues on Windows shell prevented inline file creation via SSH — resolved by writing files locally then SCPing to GCP (correct path is /home/cristian/tiresias not /root/tiresias)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- PRHAnalyzer fully functional and tested. Plans 06-02 (middleware) and 06-03 (API endpoint) can import `from src.prh.analyzer import PRHAnalyzer` directly.
- No blockers.

---
*Phase: 06-prh-engine*
*Completed: 2026-03-21*
