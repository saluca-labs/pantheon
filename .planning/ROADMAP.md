# SoulAuth Implementation Roadmap — Execution Plan

## Phase 1: Foundation
### Plan 1.1: Database Schema
- Create all 5 tables: _soulkeys, _soulauth_policy_cache, _soulauth_audit, _soulauth_delegations, _soulauth_trials
- Create indexes as specified in SPEC.md
- Create Alembic migration infrastructure

### Plan 1.2: FastAPI Skeleton
- Project structure: main.py, routers, models, schemas, config
- Database connection with SQLAlchemy async
- Configuration management (env-based)
- Error handling, structured logging, health endpoint

### Plan 1.3: Soulkey Generation & Identity Resolution
- generate_soulkey() function (SHA-512)
- Identity resolution endpoint GET /v1/auth/identity
- Key lifecycle management (active/suspended/revoked)
- Admin key issuance endpoint POST /v1/soulauth/admin/keys

### Plan 1.4: Policy Loader
- YAML policy file parsing
- Policy validation against schema
- Policy cache management (Supabase _soulauth_policy_cache)
- Role template resolution

## Phase 2: Core Authorization
### Plan 2.1: PDP Endpoint
- POST /v1/auth/evaluate — full evaluation logic
- Context-aware policy evaluation (node, session, time)
- JIT constraint checks (TTL, concurrent caps, operating window)
- Condition evaluation (approval, rate limits)

### Plan 2.2: Capability Token System
- JWT issuance with ES256 signing
- Token claims: iss, sub, tid, pid, scp, sid, jti, iat, exp
- Token validation utility
- Token revocation tracking

### Plan 2.3: PEP Middleware
- FastAPI middleware for capability token validation
- Scope derivation from request path
- Session binding validation
- SoulAuthContext injection into request.state

### Plan 2.4: Audit Logging
- Audit event logging to _soulauth_audit
- Event type classification
- Audit query API endpoints
- Structured logging with correlation IDs

## Phase 3: Multi-Tenancy & Admin
### Plan 3.1: Tenant isolation middleware
### Plan 3.2: Admin API (keys, policy, tenant management)
### Plan 3.3: Policy-as-code git integration

## Phase 4: Advanced Features
### Plan 4.1: Escalation & delegation
### Plan 4.2: Trial system
### Plan 4.3: Performance optimization

## Phase 5: Testing & Validation
### Plan 5.1: Unit tests for all core components
### Plan 5.2: Integration test suite
### Plan 5.3: Security validation
