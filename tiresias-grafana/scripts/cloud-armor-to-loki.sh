#!/usr/bin/env bash
# Cloud Armor WAF log forwarder → Loki
# Runs on GCP VM (34.41.26.234), pushes Cloud Armor logs to DreamServer Loki
# Usage: ./cloud-armor-to-loki.sh [--daemon]
#
# Requires: gcloud CLI with logging.viewer permissions on the VM
# Cron: */5 * * * * /repos/tiresias-grafana/scripts/cloud-armor-to-loki.sh

set -euo pipefail

LOKI_URL="${LOKI_URL:-http://192.168.12.167:3100}"
PROJECT="${GCP_PROJECT:-salucainfrastructure}"
STATE_FILE="/tmp/cloud-armor-last-ts"
LOOKBACK="${LOOKBACK:-10 minutes}"

# Get last timestamp or default to LOOKBACK ago
if [ -f "$STATE_FILE" ]; then
  SINCE=$(cat "$STATE_FILE")
else
  SINCE=$(date -u -d "${LOOKBACK} ago" +%Y-%m-%dT%H:%M:%SZ)
fi

NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Query Cloud Armor logs
FILTER="resource.type=\"http_load_balancer\" AND jsonPayload.enforcedSecurityPolicy.name=\"tiresias-waf\" AND timestamp>=\"${SINCE}\" AND timestamp<\"${NOW}\""

LOGS=$(gcloud logging read "$FILTER" \
  --project="$PROJECT" \
  --format=json \
  --limit=500 \
  --freshness=1h 2>/dev/null || echo "[]")

COUNT=$(echo "$LOGS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")

if [ "$COUNT" -eq 0 ] || [ "$COUNT" = "0" ]; then
  echo "$NOW" > "$STATE_FILE"
  exit 0
fi

# Transform and push to Loki
echo "$LOGS" | python3 -c "
import sys, json, time, urllib.request

logs = json.load(sys.stdin)
loki_url = '${LOKI_URL}/loki/api/v1/push'

streams = {}
for entry in logs:
    ts = entry.get('timestamp', '')
    payload = entry.get('jsonPayload', {})
    http_req = entry.get('httpRequest', {})
    security = payload.get('enforcedSecurityPolicy', {})

    # Extract key fields
    src_ip = http_req.get('remoteIp', 'unknown')
    method = http_req.get('requestMethod', '')
    path = http_req.get('requestUrl', '').split('?')[0] if http_req.get('requestUrl') else ''
    status = str(http_req.get('status', ''))
    user_agent = http_req.get('userAgent', '')
    outcome = security.get('outcome', 'UNKNOWN')
    rule = security.get('matchedAction', security.get('name', 'unknown'))
    priority = str(security.get('priority', ''))

    # Build log line
    line = json.dumps({
        'src_ip': src_ip,
        'method': method,
        'path': path,
        'status': status,
        'outcome': outcome,
        'rule': rule,
        'priority': priority,
        'user_agent': user_agent[:100],
    })

    # Group by outcome for Loki streams
    key = outcome
    if key not in streams:
        streams[key] = []

    # Convert timestamp to nanoseconds
    try:
        t = time.mktime(time.strptime(ts[:19], '%Y-%m-%dT%H:%M:%S'))
        ts_ns = str(int(t * 1e9))
    except:
        ts_ns = str(int(time.time() * 1e9))

    streams[key].append([ts_ns, line])

# Build Loki push payload
loki_streams = []
for outcome, values in streams.items():
    loki_streams.append({
        'stream': {
            'job': 'cloud-armor',
            'policy': 'tiresias-waf',
            'outcome': outcome,
        },
        'values': sorted(values, key=lambda x: x[0])
    })

payload = json.dumps({'streams': loki_streams}).encode()
req = urllib.request.Request(loki_url, data=payload, headers={'Content-Type': 'application/json'})
try:
    resp = urllib.request.urlopen(req, timeout=10)
    print(f'Pushed {len(logs)} Cloud Armor logs to Loki ({resp.status})')
except Exception as e:
    print(f'Error pushing to Loki: {e}', file=sys.stderr)
    sys.exit(1)
"

# Save timestamp for next run
echo "$NOW" > "$STATE_FILE"
