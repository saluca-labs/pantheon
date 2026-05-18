# Tiresias Quickstart Guide

> _This document is part of the Tiresias App Proxy knowledge base — the App Proxy stays branded Tiresias under the Pantheon umbrella. See ADR-013 in `docs/decisions/` for the carve-out._

## Installation

Install the Tiresias SDK using pip:

```
pip install tiresias-sdk
```

Requirements: Python 3.9+, pip 21+.

## Creating a SoulKey

A SoulKey is your API credential. Create one from the dashboard under Settings > API Keys.
Click "Create Key", enter a label (e.g. "production"), and optionally set an expiry date.
The key value is shown exactly once — copy it immediately.

## Sending Your First Request

```python
from tiresias import SoulClient

client = SoulClient(soulkey="sk_live_YOUR_KEY_HERE")
client.connect()

# Send a proxied LLM request (OpenAI-compatible)
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

## Verifying in the Dashboard

After sending your first request, open the dashboard and navigate to Observability > Traces.
Your request should appear within 5 seconds with latency, tokens, and provider details.

## Common Setup Errors

- "Invalid soulkey": Check that you copied the full key including the `sk_live_` prefix.
- "Quota exceeded": Your tier limit was reached. Check Usage widget on Overview page.
- "Connection refused": Backend URL not configured. Set TIRESIAS_API_URL environment variable.
- "403 Forbidden": Your soulkey may be revoked or expired. Create a new key in Settings > API Keys.

## Next Steps

- Set up detection rules: go to Detection > Rules in the dashboard.
- Configure SIEM export: go to Detection > SIEM Config.
- Enable PRH prompt risk analysis: go to Detection > PRH.
