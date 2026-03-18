# SoulAuth — Requirements Summary

## Functional Requirements
1. Soulkey identity system with SHA-512 hashed storage
2. Policy-as-code with YAML definitions per tenant/persona
3. PDP endpoint for JIT access evaluation
4. Capability token issuance (JWT ES256, 5-15min TTL)
5. PEP middleware for boundary enforcement
6. Multi-tenant isolation via tenant_id
7. Immutable audit logging for all auth events
8. Escalation/delegation workflow
9. Self-service trial provisioning
10. Admin API for key/policy/tenant management

## Non-Functional Requirements
- Identity resolution: <100ms avg
- Policy evaluation: <500ms avg
- Token validation: <100ms
- 99.9% uptime target
- 100% audit coverage
- Zero standing permissions

## Technology Stack (Approved)
- FastAPI + Uvicorn
- Supabase (PostgreSQL)
- SQLAlchemy + Alembic
- PyJWT with ES256
- PyYAML + Jinja2
- structlog for logging
- pytest for testing
