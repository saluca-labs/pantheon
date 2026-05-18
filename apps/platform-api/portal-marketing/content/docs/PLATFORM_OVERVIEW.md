# Pantheon Platform Overview

The canonical one-page overview lives in the platform-api docs tree:

**[`apps/platform-api/docs/PLATFORM_OVERVIEW.md`](https://github.com/salucallc/pantheon/blob/main/apps/platform-api/docs/PLATFORM_OVERVIEW.md)**

Pantheon is a local-first OSS platform that bundles a FastAPI core
(platform-api), a Next.js dashboard (platform-web), and a set of nine
Agentic OS modules (Health, Maker, Filmmaker, CyberSec, Secure Dev,
Research, Business, Creator, Autobiographer) into one repo.

Highlights:

- Agentic OS layer — nine product surfaces, one dashboard shell
- Agent platform — first-class agents + prompts with bulk import
- Configurable agent store — LocalPg (default) or Supabase
- Per-tenant BYOK provider keys (Anthropic, OpenAI, Gemini, Groq, Ollama)
- SoulAuth federated identity (local, LDAP / AD, OIDC)
- No license key, no tier gate, no required external service
