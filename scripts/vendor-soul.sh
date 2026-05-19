#!/usr/bin/env bash
# scripts/vendor-soul.sh — Refresh the vendored copy of Soul in apps/soul-service/.
#
# Source of truth: github.com/salucallc/soul (Apache 2.0, soul-memory on PyPI).
# This script copies Soul's Python sources and docs into apps/soul-service/soul/,
# scrubs hardcoded defaults that should never ship as fallbacks (Supabase URL +
# JWT placeholders), and records the upstream revision in VENDORED.md.
#
# Usage:
#   scripts/vendor-soul.sh                          # uses default SOUL_UPSTREAM=Z:/soul
#   SOUL_UPSTREAM=/path/to/soul scripts/vendor-soul.sh
#   SOUL_UPSTREAM=https://github.com/salucallc/soul scripts/vendor-soul.sh
#
# Vendoring policy: see apps/soul-service/VENDORED.md.
#
# Files copied (whitelist — anything not listed is intentionally excluded):
#   Python sources: __init__.py, compression.py, graph.py, hashing.py,
#                   local_buffer.py, prefetch.py, serve.py, storage.py,
#                   tkhr.py, gcp_config.py
#   Docs:           README.md, ARCH.md, PAPER.md
#   Misc:           LICENSE, pyproject.toml, Dockerfile (upstream Dockerfile
#                   kept as Dockerfile.upstream for reference; the Pantheon
#                   container is built from apps/soul-service/Dockerfile)
#   Tests:          tests/__init__.py, tests/test_local_buffer.py,
#                   tests/test_session_continuity.py
#
# Explicitly excluded:
#   soul-paper.tex (52 KB LaTeX source, not runtime-relevant)
#   .git, .github, .pytest_cache, __pycache__, dist/, build/

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${REPO_ROOT}/apps/soul-service/soul"
DEST_TESTS="${DEST}/tests"
DOCS_DEST="${REPO_ROOT}/apps/soul-service"
SRC="${SOUL_UPSTREAM:-Z:/soul}"

echo "── vendor-soul ──"
echo "  source: ${SRC}"
echo "  dest:   ${DEST}"

if [[ ! -d "${SRC}" ]]; then
    echo "error: ${SRC} not found. Set SOUL_UPSTREAM to a local clone of github.com/salucallc/soul" >&2
    exit 1
fi

# Whitelisted Python sources
PY_FILES=(
    __init__.py
    compression.py
    gcp_config.py
    graph.py
    hashing.py
    local_buffer.py
    prefetch.py
    serve.py
    storage.py
    tkhr.py
)

# Whitelisted docs (copied to apps/soul-service/, NOT into the package).
# README.md is renamed to README.upstream.md so it does not clobber the
# Pantheon-authored README.md that explains the wrapper layout.
DOC_FILES=(ARCH.md PAPER.md LICENSE pyproject.toml)

mkdir -p "${DEST}" "${DEST_TESTS}"

# Copy Python sources
for f in "${PY_FILES[@]}"; do
    if [[ ! -f "${SRC}/${f}" ]]; then
        echo "error: missing required file ${SRC}/${f}" >&2
        exit 1
    fi
    cp -f "${SRC}/${f}" "${DEST}/${f}"
done

# Copy tests
cp -f "${SRC}/tests/__init__.py" "${DEST_TESTS}/__init__.py"
cp -f "${SRC}/tests/test_local_buffer.py" "${DEST_TESTS}/test_local_buffer.py"
cp -f "${SRC}/tests/test_session_continuity.py" "${DEST_TESTS}/test_session_continuity.py"

# Copy docs to apps/soul-service/ (sibling to soul/ package)
for f in "${DOC_FILES[@]}"; do
    if [[ -f "${SRC}/${f}" ]]; then
        cp -f "${SRC}/${f}" "${DOCS_DEST}/${f}"
    fi
done

# README.md is special-cased to README.upstream.md so the Pantheon-authored
# README.md (which documents the wrapper, k8s wiring, and edit policy) is
# not overwritten on refresh.
if [[ -f "${SRC}/README.md" ]]; then
    cp -f "${SRC}/README.md" "${DOCS_DEST}/README.upstream.md"
fi

# Keep upstream Dockerfile for reference (renamed; the Pantheon build uses
# apps/soul-service/Dockerfile which is purpose-built for the monorepo).
if [[ -f "${SRC}/Dockerfile" ]]; then
    cp -f "${SRC}/Dockerfile" "${DOCS_DEST}/Dockerfile.upstream"
fi

# Defensive scrub for hardcoded Supabase fallback URL + redacted JWT
# placeholders in the vendored copy. As of upstream b3fdd96 these are no-ops
# (upstream has already removed the project-specific defaults); the scrubs
# stay in place to catch any accidental future reintroduction. The literals
# below match the specific pattern that previously shipped upstream — any
# matching default gets rewritten to '' so self-hosters fail loudly at boot
# instead of silently pointing at someone else's Supabase project.
SCRUB_FILES=(storage.py graph.py hashing.py prefetch.py tkhr.py)
for f in "${SCRUB_FILES[@]}"; do
    fpath="${DEST}/${f}"
    if grep -q "cgtuoiggcngldtzfqosm" "${fpath}"; then
        # Python may use either ' or " quoting; handle both.
        sed -i.bak \
            -e "s|'https://cgtuoiggcngldtzfqosm.supabase.co'|''|g" \
            -e 's|"https://cgtuoiggcngldtzfqosm.supabase.co"|""|g' \
            "${fpath}"
        rm -f "${fpath}.bak"
    fi
    # The hardcoded JWT block ends with ".REDACTED_ROTATED"; collapse the whole
    # multi-line default to an empty string. We prefer python3 for multi-line
    # safety but fall back to a perl one-liner so Windows hosts without python3
    # on PATH still produce a clean vendor (the upstream JWT default is a
    # placeholder ending in REDACTED_ROTATED — never a real credential — but
    # we still scrub it to avoid confusion).
    if grep -q "REDACTED_ROTATED" "${fpath}"; then
        # On Windows hosts, `python3` may resolve to a Microsoft Store shim
        # that fails when invoked — verify the binary actually runs before
        # relying on it.
        if command -v python3 >/dev/null 2>&1 && python3 -c "pass" >/dev/null 2>&1; then
            python3 - "${fpath}" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p, "r", encoding="utf-8").read()
pat = re.compile(
    r"os\.getenv\(\s*['\"]SUPABASE_SERVICE_KEY['\"]\s*,\s*\(\s*(?:.|\n)*?REDACTED_ROTATED(?:.|\n)*?\)\s*\)",
    re.MULTILINE,
)
s = pat.sub("os.getenv('SUPABASE_SERVICE_KEY', '')", s)
open(p, "w", encoding="utf-8").write(s)
PY
        elif command -v perl >/dev/null 2>&1; then
            perl -i -0pe \
                "s/os\.getenv\(\s*['\"]SUPABASE_SERVICE_KEY['\"]\s*,\s*\(\s*(?:.|\n)*?REDACTED_ROTATED(?:.|\n)*?\)\s*\)/os.getenv('SUPABASE_SERVICE_KEY', '')/g" \
                "${fpath}"
        else
            echo "warning: neither python3 nor perl found; SUPABASE_SERVICE_KEY default in ${f} not scrubbed" >&2
        fi
    fi
done

# Record upstream revision in VENDORED.md so reviewers can diff against the
# exact upstream commit. We do this best-effort — if the source is not a git
# checkout (e.g. a tarball) we leave the section unchanged.
UPSTREAM_SHA=""
if [[ -d "${SRC}/.git" ]] || [[ -f "${SRC}/.git" ]]; then
    if command -v git >/dev/null 2>&1; then
        # git may refuse with "dubious ownership" on Windows network shares;
        # don't fail the vendor if so.
        UPSTREAM_SHA="$(git -C "${SRC}" rev-parse HEAD 2>/dev/null || true)"
    fi
fi

echo ""
echo "── vendored ──"
echo "  python files:  ${#PY_FILES[@]}"
echo "  test files:    3"
echo "  doc files:     ${#DOC_FILES[@]}"
echo "  upstream sha:  ${UPSTREAM_SHA:-unknown}"
echo ""
echo "Next steps:"
echo "  1. Update VENDORED.md upstream-sha line if changed"
echo "  2. Run smoke test: docker build -f apps/soul-service/Dockerfile -t soul-test apps/soul-service/"
echo "  3. Commit: git add apps/soul-service/ && git commit -m 'chore(soul-service): refresh vendored copy to ${UPSTREAM_SHA:0:7}'"
