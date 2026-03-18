# SoulAuth System Architecture Design

## Executive Summary

SoulAuth is an enterprise-grade zero-trust identity and authorization system for AI agent ecosystems. This document outlines the technical architecture for implementation.

## Core Principles

1. **Zero Standing Access** - No persistent permissions, all access JIT-evaluated
2. **Identity ≠ Authorization** - Soulkeys prove identity, policy determines access
3. **Policy-as-Code** - Git-managed, PR-reviewed authorization rules
4. **Enforce at Boundaries** - PEPs validate tokens at every resource entry
5. **Granular Scoping** - Per-persona, per-resource, per-action, per-context

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    SOULAUTH SYSTEM                             │
├─────────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │   Policy    │    │   Identity      │    │    Audit        │  │
│  │  Repository │◄───│     Store       │◄───│     Log         │  │
│  │             │    │                 │    │                 │  │
│  │ - Git-based │    │ - _soulkeys     │    │ - _soulauth_    │  │
│  │ - YAML      │    │ - Multi-tenant  │    │   _audit        │  │
│  │ - Versioned │    │   soulkeys      │    │                 │  │
│  └─────────────┘    └─────────────────┘    └─────────────────┘  │
│         │                   │                   │                  │
│         ▼                   ▼                   ▼                  │
│  ┌─────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │   Policy    │    │   Policy        │    │    Policy       │  │
│  │  Cache      │    │  Decision       │    │    Enforcement │  │
│  │             │    │  Point (PDP)    │    │    Points(PEPs) │  │
│  │ - _soulauth_│    │   /v1/auth/     │    │   Middleware,   │  │
│  │   _policy_  │    │    evaluate     │    │   Node Agents,  │  │
│  │   _cache    │    │                 │    │   API Proxies   │  │
│  └─────────────┘    └─────────────────┘    └─────────────────┘  │
│                                       │                          │
│                                       ▼                          │
│           ┌─────────────────────────────────────┐              │
│           │        External Resources           │              │
│           │      - Memory (Asphodel)           │              │
│           │      - Vault                       │              │
│           │      - Mesh (Tailscale)            │              │
│           │      - External APIs               │              │
│           └─────────────────────────────────────┘              │
│                                                               │
└─────────────────────────────────────────────────────────────────┘
```

## Technology Stack Recommendations

### Backend Services
- **soul-svc**: FastAPI (Python) - Primary API service
- **PEP Middleware**: Python (FastAPI middleware) or Go (high-performance)
- **Policy Engine**: Python with PyYAML + Jinja2 for policy resolution
- **Token Service**: Python with PyJWT for capability tokens

### Database (Supabase)
- **Identity**: `_soulkeys` table with SHA-512 key hashing
- **Policy**: `_soulauth_policy_cache` for resolved policies
- **Audit**: `_soulauth_audit` with time-based partitioning
- **Trials**: `_soulauth_trials` for self-service provisioning
- **Delegations**: `_soulauth_delegations` for temporary access grants

### External Dependencies
- **Git**: Policy-as-code repository management
- **Email**: SendGrid/Mailgun for trial verification
- **DNS**: Domain validation for anti-abuse
- **Monitoring**: Prometheus + Grafana for observability

## Data Flow Architecture

### 1. Identity Resolution Flow
```
Agent Request
     │
     ▼
Validate soulkey via SHA-512 lookup in _soulkeys
     │
     ▼
Resolve tenant_id, persona_id, status
     │
     ▼
Check active/suspended status
     │
▼
Proceed to PDP or DENY
```

### 2. Policy Decision Flow
```
Identity Context + Request
     │
     ▼
PDP /v1/auth/evaluate endpoint
     │
     ├─ Load policy from _soulauth_policy_cache
     ├─ Evaluate against policy-as-code YAML
     ├─ Check context (node, time, resource)
     ├─ Apply conditions and approvals
     │
     ▼
GRANT/DENY + capability token issuance
```

### 3. Capability Token Structure
```json
{
  "iss": "soul-svc",
  "sub": "sk_agent_sal_alfred_a3f8c2d9e1b04f7a8c6d2e9f0b3a5c7d",
  "exp": 1745030400,
  "iat": 1745026800,
  "jti": "session_abc123_def456",
  "tenant_id": "saluca",
  "persona": "alfred",
  "scopes": ["memory:read:*", "vault:read:OPENAI_API_KEY"],
  "targets": ["claude-code-gcp", "ai-lab"],
  "context": {"ip": "192.168.1.100", "user_agent": "alfred-agent"}
}
```

## Multi-Tenancy Architecture

### Tenant Isolation Strategy
- **Database**: Shared Supabase instance with tenant_id filtering
- **Policy**: Per-tenant directories in policy repository
- **API**: Namespace endpoints by tenant when needed
- **Audit**: Partitioned audit logs by tenant

### Tenant Structure
```
soulauth-policy/
├── tenants/
│   ├── saluca/          # Tenant Zero - Saluca LLC
│   │   ├── tenant.yaml
│   │   ├── personas/
│   │   └── resources/
│   ├── acme-corp/       # Corporate tenant
│   │   ├── tenant.yaml
│   │   ├── personas/
│   │   └── resources/
│   └── startup-xyz/     # Startup tenant
│       ├── tenant.yaml
│       ├── personas/
│       └── resources/
└── shared/
    ├── roles.yaml
    └── defaults.yaml
```

## Security Architecture

### Key Management
- **Soulkey Generation**: Secure random generation with SHA-512 storage
- **Key Lifecycle**: Issue → Active → Suspended → Revoked (terminal)
- **Key Distribution**: Raw key shown once, never reissued
- **Key Rotation**: Automated expiry and revocation

### Zero-Trust Implementation
- **Short-lived Tokens**: 5-15 minute TTL
- **Session Binding**: JWT jti prevents replay attacks
- **Context Validation**: IP, user-agent, node affinity checks
- **Policy Enforcement**: PEPs at every boundary

### Audit Architecture
- **Immutable Logs**: Write-only access to audit tables
- **Partitioning**: Monthly partitioning for performance
- **Event Types**: auth_eval, token_issue, access_grant, policy_sync
- **Retention**: 1 year+ for compliance

## Implementation Phases

### Phase 1: Foundation (Days 1-2)
- Database schema implementation
- Basic soul-svc skeleton
- Identity resolution system
- Core policy evaluation logic

### Phase 2: Core Functionality (Days 3-4)
- PDP/PEP integration
- Token issuance and validation
- Policy-as-Code loader
- Basic audit logging

### Phase 3: Multi-Tenancy (Days 5-6)
- Tenant isolation
- Policy repository integration
- Admin API
- Coexistence with existing auth

### Phase 4: Advanced Features (Days 7-8)
- Trial system
- Delegation/escalation
- Performance optimization
- Monitoring and observability

## Deployment Architecture

### Local Development
- Docker containers for all services
- Local Supabase instance
- Git policy repository
- Load testing environment

### Production Deployment
- Kubernetes cluster on GCP
- Multi-region deployment for redundancy
- CDN for policy distribution
- Monitoring stack integration

### Integration Points
- **Existing System**: Parallel to `sk_soul_*` tenant API keys
- **Asphodel**: Memory access via soulkeys
- **Tailscale**: Node access control via PEPs
- **Vault**: Secret access via policy scopes

## Monitoring & Observability

### Key Metrics
- Authentication success/failure rates
- Policy evaluation latency
- Token issuance volume
- Audit event volume
- PEP performance metrics

### Logging Strategy
- Structured JSON logging
- Correlation IDs across requests
- Error classification and alerting
- Performance profiling integration

### Alerting Rules
- High failure rate (>5%)
- Policy evaluation timeout (>2s)
- Unusual access patterns
- Excessive token issuance
- Suspicious IP activity

## Risk Mitigation

### Security Risks
- **Token theft**: Short TTL + session binding
- **Policy bypass**: Multiple PEP layers + audit trails
- **Key compromise**: Revocation + suspension capabilities
- **Resource exhaustion**: Rate limits + capability quotas

### Operational Risks
- **Policy errors**: Validation + staged rollout
- **Database performance**: Caching + indexing strategy
- **Service availability**: Redundancy + failover
- **Data loss**: Regular backups + point-in-time recovery

## Success Criteria

### Functional Requirements
- ✅ Soulkey identity resolution (100ms avg)
- ✅ Policy evaluation (500ms avg)
- ✅ Capability token validation (<100ms)
- ✅ Multi-tenant isolation
- ✅ Audit log completeness (100% coverage)

### Performance Targets
- 99.9% uptime for soul-svc
- <500ms end-to-end auth latency
- 10K+ concurrent capability checks
- 1M+ daily audit events

### Security Targets
- Zero standing permissions
- 100% audit coverage
- Automated revocation on key compromise
- GDPR compliance for trial data