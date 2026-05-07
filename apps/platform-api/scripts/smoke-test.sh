#!/bin/bash
# Tiresias Portal Post-Build Smoke Test
# Run after docker rebuild to catch broken endpoints before UI testing
# Usage: bash scripts/smoke-test.sh

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

check() {
  local label="$1"
  local url="$2"
  local expect="$3"  # substring expected in response
  local method="${4:-GET}"
  local headers="${5:-}"
  local body="${6:-}"

  local cmd="curl -s -o /tmp/smoke_resp -w '%{http_code}' -X $method"
  if [ -n "$headers" ]; then cmd="$cmd -H '$headers'"; fi
  if [ -n "$body" ]; then cmd="$cmd -H 'Content-Type: application/json' -d '$body'"; fi
  cmd="$cmd '$url'"

  local status=$(eval $cmd 2>/dev/null)
  local resp=$(cat /tmp/smoke_resp 2>/dev/null)

  if [ "$status" = "000" ]; then
    echo -e "  ${RED}FAIL${NC} $label — connection refused"
    FAIL=$((FAIL+1))
    return
  fi

  if [ "$status" -ge 400 ] && [ "$status" != "401" ] && [ "$status" != "307" ]; then
    echo -e "  ${RED}FAIL${NC} $label — HTTP $status"
    echo "       $(echo "$resp" | head -c 200)"
    FAIL=$((FAIL+1))
    return
  fi

  if [ -n "$expect" ]; then
    if echo "$resp" | grep -q "$expect"; then
      echo -e "  ${GREEN}PASS${NC} $label"
      PASS=$((PASS+1))
    else
      echo -e "  ${YELLOW}WARN${NC} $label — HTTP $status but missing '$expect'"
      echo "       $(echo "$resp" | head -c 200)"
      WARN=$((WARN+1))
    fi
  else
    echo -e "  ${GREEN}PASS${NC} $label — HTTP $status"
    PASS=$((PASS+1))
  fi
}

echo ""
echo "=========================================="
echo " Tiresias Portal Smoke Test"
echo "=========================================="
echo ""

# --- Infrastructure ---
echo "--- Infrastructure ---"
check "Portal health" "http://localhost:3000" ""
check "SoulAuth health" "http://localhost:8000/health" "healthy"
check "SoulWatch health" "http://localhost:8001/health" "healthy"
check "Tiresias Proxy health" "http://localhost:8080/health" ""

# --- SoulAuth endpoints ---
echo ""
echo "--- SoulAuth API ---"
check "Tenants list" "http://localhost:8000/v1/soulauth/admin/tenants" ""
check "Keys (Alfred Local)" "http://localhost:8000/v1/soulauth/admin/keys?tenant_id=0c2515c2-1612-4a1a-bf72-47e760ccca51" "persona_id"
check "Audit report" "http://localhost:8000/v1/soulauth/admin/audit/report?tenant_id=0c2515c2-1612-4a1a-bf72-47e760ccca51&limit=5" ""
check "Detection rules" "http://localhost:8000/v1/detection/rules" ""
check "Detection status" "http://localhost:8000/v1/detection/status" ""
check "Analytics dashboard" "http://localhost:8000/v1/analytics/dashboard?hours=24" ""
check "Policy current" "http://localhost:8000/v1/soulauth/admin/policy/current?tenant_id=0c2515c2-1612-4a1a-bf72-47e760ccca51&persona_id=default" ""
check "Usage current" "http://localhost:8000/v1/usage/current" ""

# --- SoulWatch endpoints ---
echo ""
echo "--- SoulWatch API ---"
SW_KEY="X-Internal-Key: sw_metrics_scrape_2026"
check "Detections" "http://localhost:8001/watch/v1/detections?page_size=3" "detections" "GET" "$SW_KEY"
check "Anomalies" "http://localhost:8001/watch/v1/anomalies?page_size=3" "anomalies" "GET" "$SW_KEY"
check "Quarantines" "http://localhost:8001/watch/v1/quarantines" "quarantines" "GET" "$SW_KEY"
check "Aletheia invocations" "http://localhost:8001/watch/v1/aletheia/tools/invocations?tenant_id=0c2515c2-1612-4a1a-bf72-47e760ccca51" "invocations" "GET" "$SW_KEY"
check "Aletheia summary" "http://localhost:8001/watch/v1/aletheia/tools/summary?tenant_id=0c2515c2-1612-4a1a-bf72-47e760ccca51" "total_invocations" "GET" "$SW_KEY"
check "CoT chain" "http://localhost:8001/watch/v1/aletheia/cot/chain?tenant_id=0c2515c2-1612-4a1a-bf72-47e760ccca51" "entries" "GET" "$SW_KEY"
check "Playbooks" "http://localhost:8001/watch/v1/playbooks" "" "GET" "$SW_KEY"
check "Custom rules" "http://localhost:8001/watch/v1/rules" "" "GET" "$SW_KEY"

# --- Tiresias Proxy endpoints ---
echo ""
echo "--- Tiresias Proxy API ---"
check "Provider health" "http://localhost:8080/dash/v1/providers/health" "providers"
check "Latency" "http://localhost:8080/dash/v1/latency" "providers"
check "Errors" "http://localhost:8080/dash/v1/errors" ""
check "Spend" "http://localhost:8080/dash/v1/spend" "total_cost"
check "Sessions top" "http://localhost:8080/dash/v1/sessions/top" "sessions"
check "Traces" "http://localhost:8080/dash/v1/traces?limit=3" "items"
check "Requests per day" "http://localhost:8080/dash/v1/requests" "counts"

# --- Portal proxy routes (expect 401/307 = auth working) ---
echo ""
echo "--- Portal Proxy Routes (expect auth gate) ---"
check "Watch proxy" "http://localhost:3000/api/watch/v1/aletheia/tools/invocations" ""
check "Dash proxy" "http://localhost:3000/api/dash/v1/spend" ""
check "SoulWatch dashboard proxy" "http://localhost:3000/api/soulwatch/dashboard" ""
check "SoulGate dashboard proxy" "http://localhost:3000/api/soulgate/dashboard" ""
check "MSSP tenants" "http://localhost:3000/v1/mssp/tenants" ""
check "Support tickets" "http://localhost:3000/v1/support/tickets" ""

# --- Database row counts ---
echo ""
echo "--- Database Row Counts ---"
for table in tiresias_audit_log _soulauth_audit _soulwatch_detections _soulwatch_anomalies _soulwatch_quarantines aletheia_tool_invocations aletheia_cot_chain; do
  count=$(docker exec tiresias-pg sh -c "psql -U tiresias -d tiresias -t -c \"SELECT count(*) FROM $table;\"" 2>/dev/null | tr -d ' ')
  if [ -z "$count" ] || [ "$count" = "" ]; then
    echo -e "  ${RED}FAIL${NC} $table — table not found"
    FAIL=$((FAIL+1))
  elif [ "$count" = "0" ]; then
    echo -e "  ${YELLOW}WARN${NC} $table — 0 rows"
    WARN=$((WARN+1))
  else
    echo -e "  ${GREEN}PASS${NC} $table — $count rows"
    PASS=$((PASS+1))
  fi
done

# --- Summary ---
echo ""
echo "=========================================="
echo -e " Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}, ${YELLOW}$WARN warnings${NC}"
echo "=========================================="
echo ""

if [ $FAIL -gt 0 ]; then
  exit 1
fi
