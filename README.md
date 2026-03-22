# Tiresias Platform

Enterprise LLM security: identity, policy enforcement, and runtime monitoring for AI agents.

## Architecture

```
                         +-----------+
                         |  Portal   |  Next.js 16 dashboard
                         +-----+-----+
                               |
              +----------------+----------------+
              |                |                |
        +-----+-----+   +-----+-----+   +------+------+
        |  SoulAuth  |   |  SoulGate  |   |  SoulWatch  |
        | Identity & |   | API Gateway|   |  Behavioral |
        |   Policy   |   | Rate Limit |   |  Monitoring |
        +-----+------+   +-----+-----+   +------+------+
              |                |                |
              +----------------+----------------+
                               |
                        +------+------+
                        |  Cloud SQL  |
                        |  PostgreSQL |
                        +-------------+
```

- **SoulAuth** - Agent identity, RBAC, policy decision point, tenant management
- **SoulGate** - API security gateway with rate limiting, circuit breaker, proxy
- **SoulWatch** - Runtime anomaly detection, Aletheia CoT monitoring, quarantine
- **Portal** - Obsidian Flux design system, 50+ dashboard pages, billing, settings

## Quick Start

See [QUICKSTART.md](QUICKSTART.md) for setup instructions.

## Documentation

- [Architecture](ARCHITECTURE.md)
- [Specification](SPEC.md)
- [Setup Checklist](SETUP_CHECKLIST.md)
- [Changelog](CHANGELOG.md)
- [Security Policy](SECURITY.md)

## License

[Business Source License 1.1](LICENSE) - See LICENSE for details.

Built by [Saluca LLC](https://saluca.com)
