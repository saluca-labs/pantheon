# Tiresias API Reference

> _This document is part of the Tiresias App Proxy knowledge base — the App Proxy stays branded Tiresias under the Pantheon umbrella. See ADR-013 in `docs/decisions/` for the carve-out._

## Authentication

All API requests require a SoulKey in the Authorization header:
```
Authorization: Bearer sk_live_YOUR_KEY
```

## Auth Endpoints

### POST /v1/auth/validate
Validate a SoulKey and return its metadata.
Request body: {"soulkey": "sk_live_..."}
Response: {"valid": true, "tenant_id": "...", "tier": "pro", "expires_at": "2026-12-31T00:00:00Z"}

### POST /v1/auth/revoke
Revoke a SoulKey immediately.
Request body: {"soulkey": "sk_live_..."}
Response: {"revoked": true, "soulkey_id": "..."}

## Enforcement Endpoints

### GET /v1/enforcement/quarantine
List all quarantined soulkeys for the tenant.
Response: {"items": [{"soulkey_id": "...", "reason": "...", "quarantined_at": "..."}]}

### POST /v1/enforcement/quarantine
Quarantine a soulkey manually.
Request body: {"soulkey_id": "...", "reason": "suspicious activity", "action": "block"}
Response: {"quarantined": true, "ticket_id": "..."}

### DELETE /v1/enforcement/quarantine/{soulkey_id}
Release a quarantined soulkey.
Response: {"released": true}

## Detection Endpoints

### GET /v1/detection/matches
List recent Sigma rule matches.
Query params: ?limit=50&severity=high
Response: {"matches": [{"rule_id": "...", "severity": "high", "matched_at": "...", "fields": {}}]}

### GET /v1/detection/rules
List all Sigma detection rules.
Response: {"rules": [{"id": "...", "title": "...", "enabled": true, "severity": "high"}]}

### POST /v1/detection/rules
Create a new Sigma detection rule.
Request body: {"title": "...", "content": "---\ntitle: ...\nlogsource:\n  ..."}
Response: {"id": "...", "title": "...", "created_at": "..."}

### POST /v1/detection/rules/test
Test a rule against a sample event.
Request body: {"rule_id": "...", "event": {"model": "gpt-4o", "tokens": 5000}}
Response: {"matched": true, "matched_fields": ["tokens"], "rule_title": "..."}

## Analytics Endpoints

### GET /v1/analytics/anomalies
List detected anomalies.
Query params: ?limit=100&since=2026-01-01T00:00:00Z
Response: {"anomalies": [{"type": "rate_spike", "severity": "high", "evidence": {}, "detected_at": "..."}]}

### GET /v1/analytics/baselines
List agent behavioral baselines.
Response: {"baselines": [{"soulkey_id": "...", "avg_tokens_per_request": 450, "avg_requests_per_hour": 12}]}

## PRH Endpoints

### POST /v1/prh/analyze
Analyze a prompt for risk.
Request body: {"prompt": "Ignore previous instructions and...", "soulkey_id": "optional"}
Response: {"score": 0.92, "category": "injection", "patterns": ["ignore previous"], "confidence": 0.87}

### GET /v1/prh/config
Get current PRH configuration for the tenant.
Response: {"enabled": true, "threshold": 0.7, "auto_quarantine_threshold": 0.9, "categories": {"injection": true, "jailbreak": true}}

### PUT /v1/prh/config
Update PRH configuration.
Request body: {"threshold": 0.75, "categories": {"injection": true, "jailbreak": false}}
Response: {"updated": true}

## Support Endpoints

### POST /v1/support/tickets
Create a support ticket.
Request body: {"subject": "...", "description": "...", "severity": "p2", "category": "bug"}
Response: {"ticket_id": "A3F2C1B0", "sla_deadline": "2026-03-22T14:00:00Z"}

### GET /v1/support/tickets
List support tickets for the tenant.
Response: {"tickets": [{"ticket_id": "...", "status": "open", "severity": "p2", "subject": "..."}]}

## SIEM Endpoints

### GET /v1/siem/connectors
List SIEM connectors.
Response: {"connectors": [{"id": "...", "type": "syslog", "host": "...", "enabled": true}]}

### POST /v1/siem/connectors
Create a SIEM connector (syslog or webhook).
Request body: {"type": "webhook", "url": "https://...", "filters": {"severity": ["high", "critical"]}}

### GET /v1/siem/health
Check connector health.
Response: {"connectors": [{"id": "...", "status": "connected", "last_event_at": "..."}]}
