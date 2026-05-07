#!/usr/bin/env bash
# Tiresias SOC — Validate stack health
# Usage: ./scripts/validate.sh [host]

set -euo pipefail

HOST="${1:-localhost}"
PASS=0
FAIL=0

check() {
  local name="$1" url="$2"
  if curl -sf -o /dev/null "$url"; then
    echo "  [PASS] $name"
    ((PASS++))
  else
    echo "  [FAIL] $name ($url)"
    ((FAIL++))
  fi
}

echo "Tiresias SOC — Health Check"
echo "==========================="

echo "Services:"
check "Grafana"    "http://${HOST}:3001/api/health"
check "Loki"       "http://${HOST}:3100/ready"
check "Prometheus" "http://${HOST}:9091/-/healthy"
check "Node Exp."  "http://${HOST}:9100/metrics"

echo ""
echo "Datasources:"
DS=$(curl -sf "http://admin:${GRAFANA_ADMIN_PASSWORD:-admin}@${HOST}:3001/api/datasources" 2>/dev/null | python3 -c "import sys,json;print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
[ "$DS" -gt 0 ] && echo "  [PASS] $DS datasources" && ((PASS++)) || echo "  [FAIL] No datasources" && ((FAIL++))

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -gt 0 ] && exit 1 || exit 0
