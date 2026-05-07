# Troubleshooting Guide

> Quick-reference troubleshooting for Tiresias SaaS proxy customers.
> For detailed internal decision trees, see the Administration Guide.

---

## 1. 401 Unauthorized -- Invalid or Missing API Key

Your request was rejected because the proxy could not authenticate it.

### Checklist

| Check | Details |
|---|---|
| Is the `X-Tiresias-Api-Key` header set? | Every request to the proxy must include this header. |
| Does the key start with `tir_`? | All proxy API keys use the `tir_` prefix. If your key looks different, you may be using an internal SoulKey instead. |
| Has the key been rotated or revoked? | Keys can be rotated from the dashboard (Settings > API Keys) or via the admin API. After rotation, the old key is immediately invalid. |

### Example Request

```bash
curl https://proxy.tiresias.network/v1/chat/completions \
  -H "X-Tiresias-Api-Key: tir_your_key_here" \
  -H "Authorization: Bearer sk-your-llm-key" \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-4o", "messages": [{"role": "user", "content": "Hello"}]}'
```

If you receive `401` and your key is correct, verify it has not been revoked:

```
GET /v1/portal/keys/status
X-Tiresias-Api-Key: tir_your_key_here
```

---

## 2. 429 Too Many Requests -- Rate Limit Exceeded

Your request was throttled because you exceeded the rate limit for your tier.

### Response Headers

| Header | Description |
|---|---|
| `Retry-After` | Seconds to wait before retrying. |
| `X-RateLimit-Limit` | Maximum requests allowed per window. |
| `X-RateLimit-Remaining` | Requests remaining in the current window. |
| `X-RateLimit-Reset` | Unix timestamp when the window resets. |

### Resolution

1. **Wait** for the `Retry-After` duration, then retry.
2. **Implement exponential backoff** in your client code.
3. **Upgrade your tier** for higher limits. See [Pricing](/pricing) for tier comparison.

### Rate Limits by Tier

| Tier | Requests / minute | Requests / day |
|---|---|---|
| Community | 20 | 1,000 |
| Starter | 60 | 10,000 |
| Pro | 300 | 100,000 |
| Enterprise | Custom | Custom |

---

## 3. 502 Bad Gateway -- Upstream LLM Provider Error

A `502` means the Tiresias proxy forwarded your request to the LLM provider, but the provider returned an error or was unreachable.

**Tiresias is not the source of this error.** The proxy is passing through the upstream failure.

### Checklist

| Check | Details |
|---|---|
| Is your LLM API key valid? | Pass your provider key via the standard `Authorization: Bearer <key>` header. Tiresias forwards this to the upstream. |
| Is the model name correct? | Typos in the `model` field (e.g., `gpt-4-o` instead of `gpt-4o`) cause provider-side 404s that surface as 502s. |
| Is the provider experiencing an outage? | Check [OpenAI Status](https://status.openai.com), [Anthropic Status](https://status.anthropic.com), or your provider's status page. |
| Is the request payload valid? | Malformed JSON or invalid parameters are rejected by the provider. |

### Debugging

The proxy includes the upstream error in the response body when available:

```json
{
  "error": {
    "type": "upstream_error",
    "status": 502,
    "upstream_status": 401,
    "message": "Upstream returned 401: Invalid API key"
  }
}
```

Check the `upstream_status` and `message` fields to identify the root cause.

---

## 4. Dashboard Shows No Data

If you log into the Tiresias portal and see empty charts or "No data available" messages:

### Checklist

| Check | Details |
|---|---|
| Have you made any proxied calls? | Data appears within seconds of your first request through the proxy. New accounts start with no data. |
| Is your API key associated with the correct tenant? | Each API key is scoped to a single tenant. Verify with `GET /v1/portal/keys/status`. |
| Did you just rotate your key? | After key rotation, the new key is associated with the same tenant. Data is not lost. |
| Are you filtering by the correct time range? | The dashboard defaults to the last 24 hours. Expand the range if your calls were older. |

### Tenant Isolation

Tiresias enforces strict tenant isolation. You can only see data from requests authenticated with keys belonging to your tenant. There is no cross-tenant data leakage.

---

## 5. Policy Sync Stale (Enterprise On-Prem)

If you are running an Enterprise on-premises deployment with Git-based policy sync and policies are not updating:

### Checklist

| Check | Details |
|---|---|
| Check sync status | `GET /v1/portal/policies/sync-status` returns the last sync time and any errors. |
| Verify deploy key | The Git deploy key must have **read access** to the policy repository. |
| Check network connectivity | The on-prem instance must be able to reach the Git remote over HTTPS or SSH. |
| Check sync interval | Default sync interval is 60 seconds. Recent changes may not have synced yet. |

### Force a Manual Sync

```bash
curl -X POST /v1/portal/policies/sync \
  -H "X-Tiresias-Api-Key: tir_your_admin_key"
```

---

## Frequently Asked Questions

### How do I rotate my API key?

Use the admin API to rotate your proxy key:

```bash
curl -X POST https://api.tiresias.network/v1/soulauth/admin/keys/proxy/rotate \
  -H "X-Tiresias-Api-Key: tir_your_current_key" \
  -H "Content-Type: application/json"
```

The response contains your new key. The old key is immediately invalidated. Update all clients before rotating.

You can also rotate from the portal: **Settings > API Keys > Rotate**.

---

### Is my data encrypted?

Yes. All data is encrypted at rest and in transit.

- **In transit:** TLS 1.3 for all connections.
- **At rest:** AES-256-GCM envelope encryption.
- **Enterprise tier:** Customer-held encryption keys. You control the root key, and Tiresias cannot decrypt your data without it.

---

### What models are supported?

Tiresias proxies to any **OpenAI-compatible API**, including:

- **OpenAI** -- GPT-4o, GPT-4, GPT-3.5 Turbo, o1, o3
- **Anthropic** -- Claude Opus, Sonnet, Haiku (via OpenAI-compatible endpoint)
- **Google Gemini** -- Gemini 2.5 Pro, Flash
- **Groq** -- Llama, Mixtral (ultra-low latency)
- **Ollama** -- Any locally hosted model
- **Any provider** with an OpenAI-compatible `/v1/chat/completions` endpoint

Configure the upstream in your proxy settings or pass the `X-Tiresias-Upstream` header per-request.

---

### Can I use this with my existing OpenAI SDK?

Yes. Change your base URL and add the Tiresias API key header. No other code changes needed.

**Python:**

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://proxy.tiresias.network/v1",
    api_key="sk-your-openai-key",
    default_headers={
        "X-Tiresias-Api-Key": "tir_your_tiresias_key"
    }
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello"}]
)
```

**Node.js:**

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://proxy.tiresias.network/v1",
  apiKey: "sk-your-openai-key",
  defaultHeaders: {
    "X-Tiresias-Api-Key": "tir_your_tiresias_key",
  },
});

const response = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello" }],
});
```

**curl:**

```bash
export OPENAI_BASE_URL=https://proxy.tiresias.network/v1
curl $OPENAI_BASE_URL/chat/completions \
  -H "Authorization: Bearer sk-your-openai-key" \
  -H "X-Tiresias-Api-Key: tir_your_tiresias_key" \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-4o", "messages": [{"role": "user", "content": "Hello"}]}'
```
