#!/usr/bin/env bash
# scripts/tests/test-vendor-soul-guard.sh - regression test for the
# pantheon-owned guard in scripts/vendor-soul.sh.
#
# Builds a throwaway repo layout plus a fake upstream, then checks:
#   1. A normal vendor run succeeds, refreshes upstream-synced files
#      (including README.upstream.md) and leaves every pantheon-owned file
#      byte-identical.
#   2. With PAPER.md forced back into DOC_FILES (the regression this guards
#      against), the script exits non-zero and PAPER.md is still untouched.
#      If the guard in vendor_copy is removed, this case fails.
#   3. The same holds when a Python whitelist entry is pointed at a
#      pantheon-owned path under soul/.
#
# Run: bash scripts/tests/test-vendor-soul-guard.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="${HERE}/../vendor-soul.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "ok - $*"; }

OWNED=(PAPER.md README.md Dockerfile pantheon_entry.py VENDORED.md soul/tests/test_prev_hash_chain.py)

grep -q '^PANTHEON_OWNED=(' "${SCRIPT}" || fail "PANTHEON_OWNED list missing from vendor-soul.sh"

make_upstream() {
    local up="$1" f
    mkdir -p "${up}/tests"
    for f in __init__.py compression.py gcp_config.py graph.py hashing.py \
             local_buffer.py prefetch.py serve.py storage.py tkhr.py; do
        echo "# upstream ${f}" > "${up}/${f}"
    done
    for f in __init__.py test_local_buffer.py test_session_continuity.py test_prev_hash_chain.py; do
        echo "# upstream tests/${f}" > "${up}/tests/${f}"
    done
    for f in ARCH.md PAPER.md LICENSE pyproject.toml README.md Dockerfile; do
        echo "UPSTREAM ${f}" > "${up}/${f}"
    done
}

# make_repo DIR [SED_EXPR]: repo layout with a copy of the script, optionally edited.
make_repo() {
    local repo="$1" expr="${2:-}" f
    mkdir -p "${repo}/scripts" "${repo}/apps/soul-service/soul/tests"
    cp "${SCRIPT}" "${repo}/scripts/vendor-soul.sh"
    if [[ -n "${expr}" ]]; then
        sed -i -e "${expr}" "${repo}/scripts/vendor-soul.sh"
        cmp -s "${SCRIPT}" "${repo}/scripts/vendor-soul.sh" && fail "sed did not change the script: ${expr}"
    fi
    for f in "${OWNED[@]}"; do
        echo "PANTHEON-OWNED ${f}" > "${repo}/apps/soul-service/${f}"
    done
    echo "OLD upstream copy" > "${repo}/apps/soul-service/README.upstream.md"
    echo "OLD upstream copy" > "${repo}/apps/soul-service/ARCH.md"
}

check_owned_untouched() {
    local repo="$1" f
    for f in "${OWNED[@]}"; do
        [[ "$(cat "${repo}/apps/soul-service/${f}")" == "PANTHEON-OWNED ${f}" ]] \
            || fail "pantheon-owned file was overwritten: ${f}"
    done
}

UP="${WORK}/upstream"
make_upstream "${UP}"

# 1. Normal run.
R1="${WORK}/r1"
make_repo "${R1}"
SOUL_UPSTREAM="${UP}" bash "${R1}/scripts/vendor-soul.sh" > "${WORK}/r1.log" 2>&1 \
    || { cat "${WORK}/r1.log"; fail "normal vendor run failed"; }
check_owned_untouched "${R1}"
[[ "$(cat "${R1}/apps/soul-service/README.upstream.md")" == "UPSTREAM README.md" ]] \
    || fail "README.upstream.md was not re-synced"
[[ "$(cat "${R1}/apps/soul-service/ARCH.md")" == "UPSTREAM ARCH.md" ]] \
    || fail "ARCH.md was not re-synced"
[[ "$(cat "${R1}/apps/soul-service/soul/serve.py")" == "# upstream serve.py" ]] \
    || fail "soul/serve.py was not vendored"
pass "normal run refreshes upstream files and leaves pantheon-owned files alone"

# 2. PAPER.md forced back into DOC_FILES must be refused.
R2="${WORK}/r2"
make_repo "${R2}" 's/^DOC_FILES=(ARCH.md /DOC_FILES=(ARCH.md PAPER.md /'
if SOUL_UPSTREAM="${UP}" bash "${R2}/scripts/vendor-soul.sh" > "${WORK}/r2.log" 2>&1; then
    cat "${WORK}/r2.log"; fail "run with PAPER.md in DOC_FILES exited 0 (guard missing)"
fi
grep -q "refusing to overwrite pantheon-owned file apps/soul-service/PAPER.md" "${WORK}/r2.log" \
    || { cat "${WORK}/r2.log"; fail "no clear refusal message for PAPER.md"; }
check_owned_untouched "${R2}"
pass "PAPER.md in DOC_FILES is refused with a clear message"

# 3. A pantheon-owned test file under soul/ must be refused too.
R3="${WORK}/r3"
make_repo "${R3}" 's|^vendor_copy "${SRC}/tests/__init__.py" .*|vendor_copy "${SRC}/tests/test_prev_hash_chain.py" "${DEST_TESTS}/test_prev_hash_chain.py"|'
if SOUL_UPSTREAM="${UP}" bash "${R3}/scripts/vendor-soul.sh" > "${WORK}/r3.log" 2>&1; then
    cat "${WORK}/r3.log"; fail "overwrite of soul/tests/test_prev_hash_chain.py exited 0 (guard missing)"
fi
check_owned_untouched "${R3}"
pass "pantheon-owned file under soul/ is refused"

echo "all vendor-soul guard checks passed"
