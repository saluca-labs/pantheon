#!/usr/bin/env python3
"""Cloud Armor Pub/Sub → Loki forwarder.

Pulls Cloud Armor WAF log entries from GCP Pub/Sub and pushes them to Loki.
Runs on the GCP VM (34.41.26.234) which has pubsub scope.

Usage:
    python3 pubsub-to-loki.py [--loki-url http://192.168.12.167:3100] [--batch-size 100]
"""

import json
import time
import sys
import os
import urllib.request
import subprocess
from datetime import datetime

LOKI_URL = os.environ.get("LOKI_URL", "http://192.168.12.167:3100")
PROJECT = os.environ.get("GCP_PROJECT", "salucainfrastructure")
SUBSCRIPTION = os.environ.get("PUBSUB_SUBSCRIPTION", "cloud-armor-logs-sub")
BATCH_SIZE = int(os.environ.get("BATCH_SIZE", "100"))
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "10"))


def pull_messages():
    """Pull messages from Pub/Sub using gcloud CLI."""
    try:
        result = subprocess.run(
            [
                "gcloud", "pubsub", "subscriptions", "pull", SUBSCRIPTION,
                "--project", PROJECT,
                "--limit", str(BATCH_SIZE),
                "--auto-ack",
                "--format", "json",
            ],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode != 0:
            if "listed 0 items" in result.stderr.lower() or not result.stdout.strip():
                return []
            print(f"gcloud error: {result.stderr}", file=sys.stderr)
            return []
        output = result.stdout.strip()
        if not output or output == "[]":
            return []
        return json.loads(output)
    except subprocess.TimeoutExpired:
        print("gcloud pull timed out", file=sys.stderr)
        return []
    except json.JSONDecodeError:
        return []


def parse_log_entry(raw_data):
    """Parse a Cloud Logging entry from Pub/Sub message data."""
    try:
        entry = json.loads(raw_data)
    except json.JSONDecodeError:
        return None

    payload = entry.get("jsonPayload", {})
    http_req = entry.get("httpRequest", {})
    security = payload.get("enforcedSecurityPolicy", {})
    rate_info = security.get("rateLimitAction", {})
    remote_info = payload.get("securityPolicyRequestData", {}).get("remoteIpInfo", {})

    return {
        "timestamp": entry.get("timestamp", ""),
        "log_line": json.dumps({
            "src_ip": http_req.get("remoteIp", payload.get("remoteIp", "unknown")),
            "method": http_req.get("requestMethod", ""),
            "path": (http_req.get("requestUrl", "") or "").split("?")[0],
            "status": str(http_req.get("status", "")),
            "outcome": security.get("outcome", "UNKNOWN"),
            "rule": security.get("configuredAction", ""),
            "priority": str(security.get("priority", "")),
            "user_agent": (http_req.get("userAgent", "") or "")[:100],
            "region": remote_info.get("regionCode", ""),
            "asn": str(remote_info.get("asn", "")),
            "rate_outcome": rate_info.get("outcome", ""),
            "backend": entry.get("resource", {}).get("labels", {}).get("backend_service_name", ""),
        }),
        "outcome": security.get("outcome", "UNKNOWN"),
    }


def push_to_loki(entries):
    """Push parsed entries to Loki."""
    streams = {}
    for entry in entries:
        outcome = entry["outcome"]
        if outcome not in streams:
            streams[outcome] = []
        try:
            dt = datetime.fromisoformat(entry["timestamp"].replace("Z", "+00:00"))
            ts_ns = str(int(dt.timestamp() * 1e9))
        except (ValueError, AttributeError):
            ts_ns = str(int(time.time() * 1e9))
        streams[outcome].append([ts_ns, entry["log_line"]])

    loki_streams = []
    for outcome, values in streams.items():
        loki_streams.append({
            "stream": {
                "job": "cloud-armor",
                "policy": "tiresias-waf",
                "outcome": outcome,
            },
            "values": sorted(values, key=lambda x: x[0]),
        })

    data = json.dumps({"streams": loki_streams}).encode()
    req = urllib.request.Request(
        f"{LOKI_URL}/loki/api/v1/push",
        data=data,
        headers={"Content-Type": "application/json"},
    )
    try:
        resp = urllib.request.urlopen(req, timeout=10)
        return resp.status
    except Exception as e:
        print(f"Loki push error: {e}", file=sys.stderr)
        return None


def main():
    print(f"Cloud Armor → Loki forwarder started")
    print(f"  Pub/Sub: {PROJECT}/{SUBSCRIPTION}")
    print(f"  Loki: {LOKI_URL}")
    print(f"  Poll interval: {POLL_INTERVAL}s, batch size: {BATCH_SIZE}")

    total_forwarded = 0

    while True:
        try:
            messages = pull_messages()
            if not messages:
                time.sleep(POLL_INTERVAL)
                continue

            entries = []
            for msg in messages:
                raw = msg.get("message", {}).get("data", "")
                if not raw:
                    continue
                # Pub/Sub data is base64 encoded
                import base64
                try:
                    decoded = base64.b64decode(raw).decode("utf-8")
                except Exception:
                    decoded = raw
                parsed = parse_log_entry(decoded)
                if parsed:
                    entries.append(parsed)

            if entries:
                status = push_to_loki(entries)
                total_forwarded += len(entries)
                print(f"[{datetime.utcnow().isoformat()[:19]}] "
                      f"Forwarded {len(entries)} entries (total: {total_forwarded}, "
                      f"HTTP {status})")

        except KeyboardInterrupt:
            print(f"\nStopped. Total forwarded: {total_forwarded}")
            break
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
