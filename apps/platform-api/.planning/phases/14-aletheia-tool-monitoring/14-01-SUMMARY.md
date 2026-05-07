---
phase: "14"
plan: "01"
subsystem: aletheia-tool-monitoring
tags: [go, cli, telemetry, soulwatch, offline-first]
dependency_graph:
  requires: []
  provides: [tiresias-exec-binary, tool-invocation-events]
  affects: [soulwatch-event-pipeline]
tech_stack:
  added: [go-1.22, gopkg.in/yaml.v3]
  patterns: [offline-first, async-reporting, identity-resolution-chain]
key_files:
  created:
    - cmd/tiresias-exec/main.go
    - cmd/tiresias-exec/identity.go
    - cmd/tiresias-exec/config.go
    - cmd/tiresias-exec/executor.go
    - cmd/tiresias-exec/reporter.go
    - cmd/tiresias-exec/offline.go
    - cmd/tiresias-exec/Makefile
    - cmd/tiresias-exec/go.mod
    - cmd/tiresias-exec/go.sum
  modified: []
decisions:
  - "Go 1.22 with gopkg.in/yaml.v3 as only dependency for minimal binary size"
  - "SHA-512 for stdout/stderr hashing per spec, SHA-256 for environment key hash"
  - "2-second grace period for async reporting before process exit"
  - "0x0a byte append for JSONL newline delimiter (avoids heredoc quoting issues)"
metrics:
  duration: "~12min"
  completed: "2026-03-21T20:58:00Z"
---

# Phase 14 Plan 01: tiresias-exec Go Binary (CLI Shim) Summary

Standalone Go CLI shim that wraps any command, captures execution telemetry (exit code, wall time, stdout/stderr SHA-512 hashes, byte counts), and reports tool_invocation events to SoulWatch async with offline-first JSONL fallback when SoulWatch is unreachable.

## What Was Built

### cmd/tiresias-exec/ (9 files, 755 lines)

**main.go** - Entry point with flag parsing (--agent-id, --tenant-id, --soulwatch-url, --offline, --config, --sanitize, --dry-run, --version). Orchestrates: parse flags -> resolve identity -> execute command -> write stdout/stderr -> report telemetry async -> exit with subprocess code. 2-second grace period via sync.WaitGroup for reporting goroutine.

**identity.go** - Four-layer identity resolution chain: CLI flags > env vars (TIRESIAS_AGENT_ID, TIRESIAS_TENANT_ID) > config file (~/.tiresias/agent.yaml) > JWT claims (base64-decode payload, extract sub/tenant_id without signature validation). Warns but never blocks on missing identity.

**config.go** - YAML config parser using gopkg.in/yaml.v3. Reads ~/.tiresias/agent.yaml with fields: agent_id, tenant_id, soulwatch_url, token, sanitize, offline_log. Gracefully handles missing or malformed files.

**executor.go** - Subprocess execution via exec.Command with io.MultiWriter for simultaneous SHA-512 hashing and output buffering. Maps exec.ErrNotFound to exit 127, signal kills to 128+signal. Captures wall-clock duration in milliseconds.

**reporter.go** - Builds spec-compliant telemetry payload (event_type: tool_invocation, version: 1.0) with environment_hash (SHA-256 of sorted env var keys), random invocation_id (inv_<12 hex>). POSTs to SoulWatch with X-Internal-Key header, 5s HTTP timeout. Policy: evaluated=false, verdict=skipped. Sanitizer: mode=passthrough, verdict=skipped.

**offline.go** - JSONL append with O_APPEND for concurrent safety. 100MB rotation (drops oldest 20%). Opportunistic sync: on each invocation, reads up to 100 buffered entries and replays to SoulWatch, removing successfully synced entries.

**Makefile** - CGO_ENABLED=0 static builds with -ldflags="-s -w" for size. Cross-compile targets: linux-amd64, darwin-amd64, darwin-arm64, windows-amd64.

## Verification Results

| Check | Result |
|-------|--------|
| Binary compiles | PASS (go build succeeds) |
| Binary size < 10MB | PASS (5,697,796 bytes = 5.7MB) |
| Exit code passthrough | PASS (echo=0, false=1) |
| Stdout transparency | PASS (byte-for-byte passthrough) |
| Overhead < 5ms | PASS (~1ms execution duration) |
| Offline JSONL written | PASS (valid JSON, all fields present) |
| SoulWatch unreachable fallback | PASS (command executes, event logged offline) |
| Config file parsing | PASS (agent.yaml values loaded correctly) |
| Identity resolution chain | PASS (flags > env > config > JWT) |
| Telemetry payload format | PASS (matches spec section 3.1.5) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed Go 1.22.10 on GCP VM**
- **Found during:** Pre-build setup
- **Issue:** Go was not installed on the VM (command not found)
- **Fix:** Downloaded and installed go1.22.10.linux-amd64 to /usr/local/go
- **Files modified:** System /usr/local/go/, ~/.bashrc

**2. [Rule 1 - Bug] Fixed heredoc quoting artifacts in Go source**
- **Found during:** First build attempt
- **Issue:** Bash heredoc with single-quote escaping mangled byte literals ('=' became =, '\n' became n, stray ')) lines)
- **Fix:** Used sed/python to restore correct Go byte literals (0x0a for newline, '=' for IndexByte)
- **Files modified:** offline.go, reporter.go

## Known Stubs

None. All functionality is implemented. Policy evaluation and sanitizer scanning are intentionally set to passthrough/skipped per plan spec (future phases 15+).

## Self-Check: PASSED
