# Tiresias Integration Guide

> _This document is part of the Tiresias App Proxy knowledge base — the App Proxy stays branded Tiresias under the Pantheon umbrella. See ADR-013 in `docs/decisions/` for the carve-out._

## OpenAI Integration

Wrap the OpenAI client to route requests through Tiresias:

```python
import openai
from tiresias import SoulClient

soul = SoulClient(soulkey="sk_live_YOUR_KEY")

# Use Tiresias as a drop-in proxy
client = openai.OpenAI(
    base_url=soul.proxy_url,
    api_key="not-needed"  # auth via soulkey
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello"}]
)
```

## Anthropic Integration

```python
import anthropic
from tiresias import get_proxy_headers

client = anthropic.Anthropic(
    base_url="https://api.tiresias.your-domain.com/v1/proxy",
    default_headers=get_proxy_headers(soulkey="sk_live_YOUR_KEY")
)
```

## LangChain Integration

```python
from langchain_openai import ChatOpenAI
from tiresias import SoulClient

soul = SoulClient(soulkey="sk_live_YOUR_KEY")

llm = ChatOpenAI(
    base_url=soul.proxy_url,
    api_key="placeholder",
    model="gpt-4o"
)
```

## SIEM Integration

### Syslog Export (UDP/TCP/TLS)

Navigate to Detection > SIEM Config. Click "Add Connector" and select Syslog.
Enter your SIEM host, port, and transport (UDP/TCP/TLS).
Set event filters to control which severity levels and event types are forwarded.
Events are forwarded in CEF (Common Event Format) within 5 seconds of detection.

### Webhook Export

Click "Add Connector" and select Webhook.
Enter your webhook URL. Tiresias will POST JSON payloads with 3 retry attempts on failure.
Webhook payload format:
```json
{
  "event_type": "detection.match",
  "severity": "high",
  "rule_title": "Prompt Injection Detected",
  "tenant_id": "...",
  "timestamp": "2026-03-21T14:00:00Z",
  "evidence": {}
}
```

## Environment Variables

Configure Tiresias SDK behavior with these environment variables:
- TIRESIAS_API_URL: Backend URL (default: https://api.tiresias.your-domain.com)
- TIRESIAS_SOULKEY: Default soulkey (alternative to passing in code)
- TIRESIAS_LOG_LEVEL: Logging verbosity (DEBUG/INFO/WARNING)
- TIRESIAS_TIMEOUT_SECONDS: Request timeout (default: 30)

## Troubleshooting

- Requests not appearing in Traces: Check that TIRESIAS_API_URL is set correctly and soulkey is valid.
- SIEM events not received: Check connector health at Detection > SIEM Config and verify firewall allows outbound connections.
- PRH blocking legitimate requests: Lower the auto_quarantine_threshold via PUT /v1/prh/config or disable specific categories.
- Agent quarantined unexpectedly: Check Detection > Detection Feed for the triggering rule. Release via Quarantine page.
