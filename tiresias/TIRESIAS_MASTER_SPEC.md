# Tiresias Master Specification Document

## 1. Executive Summary

Tiresias is a comprehensive cybersecurity platform designed for the age of AI agents. It provides observability, policy enforcement, and anomaly detection for AI powered applications and autonomous agent teams. The platform is built on a modular architecture that combines an open source core (Apache 2.0) with commercial enterprise extensions. Tiresias offers multi tenant SaaS, on premises, and MSSP deployment models with support for major cloud providers and AI model providers. The product launch is targeted within 48 hours, with current infrastructure deployed on GKE and a functioning marketing site.

## 2. Product Overview

Tiresias consists of five main product components and supporting infrastructure.

**Core Products:**
1. **Tiresias Proxy (Open Source Core):** OpenAI compatible observability proxy that logs, routes, and encrypts all LLM traffic. Provides multi provider failover and basic analytics.
2. **SoulAuth:** Agent identity and policy decision point. Manages SoulKeys (SHA 512), JWT capability tokens, and an 8 stage policy evaluation engine with policy as code (YAML/git).
3. **SoulWatch:** Behavioral anomaly detection system with 18 anomaly types. Includes Sigma rule engine, playbooks, quarantine, and SIEM forwarding (Splunk, Elastic, Azure Sentinel, Syslog, Webhook).
4. **SoulGate:** API gateway with rate limiting, circuit breaking, and 40+ prompt injection pattern detection aligned with OWASP LLM Top 10.
5. **Aletheia (Embedded):** Chain of Thought audit system with SHA 512 hashing, AES 256 GCM encryption, PII sanitization, and policy enforcement for tool calls.

**Supporting Components:**
- **Portal:** Next.js 16/React 19 management dashboard with 71 pages, Stripe integration, and Obsidian Flux design system.
- **MiroShark Integration:** Cognitive rehearsal engine for agent simulation and policy testing (internal AGPL 3.0 fork).
- **Orchestration Layer:** Kairos mesh adapter and Consul service mesh for distributed agent runtime.
- **Agent Management Spec:** Planned enhancement for managing 100k+ agents with extended lifecycle (spec only).
- **Agent Harness Enhancement:** Planned Till Done Service, Sub Agent Dashboard, and Extension System (spec only).

## 3. Architecture and Data Flows

**Deployment Architecture:**
```
[Client Apps] -> [SoulGate:8002] -> [Tiresias Proxy:8080] -> [Upstream LLM Providers]
       |                |                   |
       v                v                   v
[SoulAuth:8000]  [SoulWatch:8001]   [Dashboard:3000]
       |                |
       v                v
[PostgreSQL DB]   [SIEM Forwarding]
```

**Data Flow for LLM Request:**
1. Client request arrives at SoulGate (port 8002).
2. SoulGate performs rate limiting, geo IP checks, and prompt injection scanning.
3. SoulGate calls SoulAuth (port 8000) for policy evaluation (8 stage PDP).
4. If allowed, request is forwarded to Tiresias Proxy (port 8080).
5. Proxy encrypts payload (AES 256 GCM), logs to database, routes to appropriate LLM provider (OpenAI, Anthropic, Gemini, Groq) with cascade failover.
6. Response is streamed back through proxy, logged, decrypted, and returned through SoulGate.
7. SoulWatch monitors the entire transaction for behavioral anomalies.
8. Aletheia captures and seals the Chain of Thought audit trail.

**Policy Evaluation Flow (SoulAuth PDP):**
```
1. Token Validation (ES256 JWT)
2. Org Policy Check (org_policy.yaml)
3. Project Policy Check (project_policies/*.yaml)
4. Agent Policy Check (agent_policies/*.yaml)
5. Context Gate (request context analysis)
6. Input Gate (v3.0+ with PRH and Z3 verification)
7. Model Gate (allowed models/endpoints)
8. Action Gate (tool call permissions)
```

**Enterprise Two Tier Architecture:**
- **TIRESIAS_MODE:** onprem (default), dedicated, or saas
- **Cloud Proxy:** Optional add on for on premises deployments
- **Per Tenant Compute Isolation:** Namespace isolation and Row Level Security (RLS)
- **Investigation System:** 3 tier evidence model (raw, processed, derived)

## 4. Full Feature Matrix by Component

### Tiresias Proxy (Open Source Core)
- **LLM Proxy:** OpenAI compatible endpoint (`/v1/chat/completions`) with streaming
- **Multi Provider Routing:** OpenAI, Anthropic (format translation), Gemini, Groq
- **Cascade Failover:** Automatic failover between providers
- **Envelope Encryption:** AES 256 GCM per tenant, KEK wrapping (local, AWS KMS, HashiCorp Vault, Azure KV, GCP SM)
- **Basic Analytics:** Spend, requests, latency, errors (`/v1/analytics/*`)
- **Session Management:** Tagging, retrieval, replay (`/v1/sessions/{id}/replay`)
- **Admin API:** Provider management, config reload
- **Generic Reverse Proxy:** `/api/{path}` passthrough for other APIs
- **Dashboard:** Basic metrics dashboard (port 3000)

### SoulAuth (Enterprise)
- **Agent Identity:** SoulKeys (SHA 512 based)
- **Policy Decision Point:** 8 stage evaluation pipeline
- **Capability Tokens:** ES256 JWT with 300 900s TTL
- **Policy as Code:** YAML/git based policy hierarchy (org > project > agent)
- **Multi Tenancy:** Full tenant isolation
- **Team RBAC:** 7 roles with fine grained permissions
- **Partner Program:** Multi tier partner management
- **Aletheia CoT Audit:** Integrated audit chain sealing
- **API Surface:** 176 endpoints

### SoulWatch (Enterprise)
- **Behavioral Anomaly Detection:** 18 anomaly types with 7 day baseline
- **Sigma Rule Engine:** Custom detection rules
- **Playbooks:** Automated response workflows
- **Quarantine:** Agent and session isolation
- **SIEM Forwarding:** Splunk, Elastic, Azure Sentinel, Syslog, Webhook
- **CEF Format:** Common Event Format support
- **WebSocket Streaming:** Real time alert streaming
- **API Surface:** Extensive monitoring endpoints

### SoulGate (Enterprise)
- **API Gateway:** Request routing and transformation
- **Rate Limiting:** Token bucket algorithm
- **Circuit Breaker:** Failure protection for upstream services
- **Prompt Injection Detection:** 40+ patterns (OWASP LLM Top 10)
- **Geo IP Filtering:** Geographic access controls
- **Audit Logging:** Comprehensive request logging
- **Input Gate:** v3.0+ with Pattern Recognition Heuristics (60 regex patterns) and Z3 formal verification

### Aletheia (Embedded Enterprise)
- **Chain of Thought Audit:** Immutable audit trails
- **Cryptographic Sealing:** SHA 512 hashing with AES 256 GCM encryption
- **PII Sanitization:** Automatic sensitive data redaction
- **Policy Enforcement:** Tool call evaluation and validation
- **Evidence Chain:** 3 tier evidence model for investigations

### Portal
- **Dashboard:** 71 pages of management interfaces
- **Billing:** Stripe integration with live price IDs
- **Design System:** Obsidian Flux (custom)
- **Multi Product Management:** Unified view across all components
- **Reporting:** Basic reports (some currently mocked)

### MiroShark Integration
- **Agent Simulation:** Multi agent social simulation (OASIS/CAMEL AI fork)
- **Policy Testing:** Tiresias policy enforcement gate integration
- **Visualization:** God view (PixiJS), isometric (Godot 4), first person (planned)
- **API Integration:** All LLM calls routed through Tiresias proxy
- **Session Tracking:** `miroshark-{sim_id}` session IDs
- **Internal Platform:** Slack Overworld replacement (planned)

### Orchestration Layer
- **Kairos Mesh Adapter:** Anthropic KAIROS daemon integration
- **Consul Service Mesh:** 3 node quorum for high availability
- **Access Matrix:** 2D matrix (persona x project) with default deny
- **Workflow Engine:** 10 active workflows (OSINT, IR, Release Mgmt, etc.)
- **Meta Harness:** 5 subsystems (Body Awareness, Self Healing, Auto Research, Dream Cycle, HITL Escalation)

## 5. API Surface Summary

### Tiresias Proxy API (Port 8080)
- **Health:** `/health`
- **LLM Proxy:** `/v1/chat/completions` (POST, streaming)
- **Session Management:** `/v1/sessions/{id}/tag` (POST), `/v1/sessions/{id}` (GET)
- **Admin:** `/v1/admin/providers` (GET/PUT), `/v1/admin/reload` (POST)
- **Generic Proxy:** `/api/{path}` (all methods, reverse proxy)
- **Analytics:** `/v1/analytics/*` (spend, requests, latency, errors)
- **Passthrough:** `/v1/{path}` (OpenAI API passthrough)

### Dashboard API (Port 3000)
- **Metrics:** `/dash/v1/spend`, `/dash/v1/requests`, `/dash/v1/latency`, `/dash/v1/errors`
- **Sessions:** `/dash/v1/sessions/top`, `/dash/v1/sessions/{id}/replay`
- **Providers:** `/dash/v1/providers/health`

### SoulAuth API (Port 8000, 176 endpoints)
- **Authentication:** `/v1/auth/token` (POST), `/v1/auth/validate` (POST)
- **Policy Evaluation:** `/v1/auth/evaluate` (POST) - CRITICAL: currently UNHEALTHY
- **Policy Management:** `/v1/policies/{org|project|agent}` (CRUD)
- **Tenant Management:** `/v1/tenants/*` (CRUD)
- **Team RBAC:** `/v1/teams/*`, `/v1/members/*`
- **Partner Program:** `/v1/partners/*`
- **SoulKeys:** `/v1/keys/*` (generation, rotation, revocation)

### SoulWatch API (Port 8001)
- **Monitoring:** `/v1/watch/events` (streaming WebSocket)
- **Anomalies:** `/v1/anomalies/*` (list, acknowledge, resolve)
- **Playbooks:** `/v1/playbooks/*` (execute, manage)
- **Quarantine:** `/v1/quarantine/*` (add, remove, list)
- **SIEM Configuration:** `/v1/siem/*` (configure forwarders)
- **Sigma Rules:** `/v1/sigma/*` (manage detection rules)

### SoulGate API (Port 8002)
- **Gateway:** `/v1/gate/proxy` (main entry point)
- **Rate Limit Config:** `/v1/gate/limits/*` (manage token buckets)
- **Circuit Breakers:** `/v1/gate/breakers/*` (status, reset)
- **Pattern Management:** `/v1/gate/patterns/*` (injection patterns)
- **Geo IP Rules:** `/v1/gate/geo/*` (allow/block lists)

### Portal API (Integrated with Portal)
- **User Management:** `/api/v1/users/*`
- **Billing:** `/api/v1/billing/*` (Stripe webhooks, subscriptions)
- **Dashboard Data:** `/api/v1/dashboard/*` (aggregated metrics)
- **Agent Management:** `/api/v1/agents/*` (CRUD operations)
- **Report Generation:** `/api/v1/reports/*` (partially mocked)

**Total API Endpoints:** 263+ across all services

## 6. Database Schema Summary

**Primary Database:** PostgreSQL 16 (Cloud SQL on GCP)

### Core Tables (46 tables total)

**Audit & Logging:**
- `tiresias_audit_log`: Complete audit trail with CoT hashes
- `tiresias_api_log`: API request/response logging
- `tiresias_usage_buckets`: Aggregated usage metrics
- `tiresias_api_endpoint_buckets`: Endpoint specific usage

**Licensing & Billing:**
- `tiresias_licenses`: License keys and entitlements
- `subscriptions`: Stripe subscription data
- `invoices`: Billing invoices

**Identity & Access:**
- `tenants`: Multi tenant isolation
- `soulkeys`: Agent identity keys (SHA 512)
- `users`: Portal users
- `teams`: RBAC teams
- `roles`: 7 predefined roles with permissions
- `jwt_tokens`: Issued capability tokens

**Policy Management:**
- `org_policies`: Organization level policies
- `project_policies`: Project specific policies
- `agent_policies`: Agent specific policies
- `policy_versions`: Git like versioning

**Monitoring & Detection:**
- `anomalies`: Detected behavioral anomalies
- `sigma_rules`: Detection rules
- `playbook_executions`: Playbook run history
- `quarantine_records`: Isolated agents/sessions

**SIEM Integration:**
- `siem_forwarders`: Configured SIEM connections
- `forwarded_alerts`: Sent alerts tracking

**Session Management:**
- `sessions`: LLM session tracking
- `session_tags`: User defined session tags
- `replay_data`: Session replay information

**Provider Management:**
- `llm_providers`: Configured LLM providers
- `provider_health`: Health check results
- `failover_history`: Cascade failover events

**Encryption:**
- `key_encryption_keys`: KEKs for envelope encryption
- `data_encryption_keys`: Tenant specific DEKs (wrapped)

**Partner Program:**
- `partners`: Partner organizations
- `commissions`: Earned commissions
- `partner_keys`: Distributed license keys

## 7. Encryption and Security Architecture

**Cryptographic Foundations:**
- **SoulKeys:** SHA 512 based agent identity
- **JWT Tokens:** ES256 signatures for capability tokens
- **Audit Chains:** SHA 512 hashing for CoT immutability

**Envelope Encryption:**
- **Per Tenant DEK:** AES 256 GCM data encryption keys
- **KEK Wrapping:** DEKs wrapped by Key Encryption Keys
- **KEK Providers:** Local, AWS KMS, HashiCorp Vault, Azure Key Vault, GCP Secret Manager
- **Key Rotation:** Automatic DEK rotation, manual KEK rotation

**Network Security:**
- **TLS:** Managed certificates via GCE Load Balancer
- **Service Mesh:** Consul 3 node quorum with Tailscale transport
- **Workload Identity:** GCP Workload Identity for service accounts

**Data Security:**
- **PII Sanitization:** Automatic detection and redaction in audit trails
- **Row Level Security:** PostgreSQL RLS for tenant isolation
- **Namespace Isolation:** Kubernetes namespaces per tenant (SaaS)

**Access Security:**
- **8 Stage PDP:** Comprehensive policy evaluation
- **Default Deny:** All access denied unless explicitly allowed
- **2D Access Matrix:** Persona x Project authorization
- **300 900s TTL:** Short lived capability tokens

**Compliance Features:**
- **Audit Trail:** Immutable CoT chains with cryptographic sealing
- **SIEM Integration:** CEF format for compliance reporting
- **Policy as Code:** Git backed policy for change tracking
- **GDPR/HIPAA Ready:** PII sanitization and data residency controls

**Pentest Program:**
- **Weekly Scans:** Nuclei + ZAP + Trivy full scans
- **Daily CVE Monitoring:** Automated vulnerability tracking
- **Self Monitoring:** Scanner vs SoulWatch detection comparison
- **Grafana SOC:** 10 dashboards with custom datasource plugins

## 8. Infrastructure and Deployment

### SaaS Deployment (Current: GKE)
- **GCP Project:** salucainfrastructure
- **Clusters:** tiresias-prod, tiresias-partner, tiresias-v2
- **Services on tiresias-prod:**
  - portal (2 pods, HPA 2-10)
  - marketing-portal (1 pod)
  - soulauth (2 pods, HPA 2-10)
  - soulwatch (2 pods, HPA 2-10)
  - soulgate (2 pods, HPA 2-10)
  - tiresias-proxy (3 pods, HPA 3-20)
  - redis (1 pod)
- **Database:** Cloud SQL PostgreSQL 16
- **Ingress:** GCE Load Balancer with 3 managed TLS certificates
- **Domains:**
  - tiresias.network (marketing)
  - proxy.tiresias.network (proxy API)
  - platform.tiresias.network (portal)
  - api.tiresias.network (SoulAuth API)
  - status.tiresias.network (Gatus monitoring)

### On Premises Deployment
- **Minimum Requirements:** Kubernetes 1.24+ or Docker Compose
- **Database Options:** PostgreSQL 14+ or SQLite (development)
- **Storage:** 100GB+ for audit logs
- **Network:** Outbound HTTPS to LLM providers
- **Installation:** 1,500+ line installation guide
- **Air Gap Support:** Relay service for disconnected environments

### MSSP Deployment
- **Multi Tenant Isolation:** Namespace per customer
- **Billing:** $4999 base + $199 per tenant monthly
- **White Labeling:** Custom branding support
- **Partner Portal:** Dedicated management interface

### Two Tier Architecture
- **TIRESIAS_MODE Environment Variable:**
  - `onprem`: Self hosted default
  - `dedicated`: Single tenant cloud
  - `saas`: Multi tenant SaaS
- **Cloud Proxy Add On:** Optional relay for on premises to cloud logging
- **Per Tenant Compute:** Isolated Kubernetes namespaces in SaaS mode

### Monitoring Stack
- **Primary:** GKE Managed Prometheus
- **Secondary:** LGTM stack (Loki, Grafana, Tempo, Mimir) on DreamServer
- **Uptime:** Gatus on status.tiresias.network
- **Logging:** Cloud Logging with custom sinks

**Current Infrastructure Issues:**
- gcloud authentication expired
- cert-manager/external-secrets pods pending (GCE quota issue)
- Database password drift fixed 2026-04-09

## 9. Pricing and Packaging

### Product SKUs

**Tiresias Proxy (Open Source):**
- **Free Tier:** Apache 2.0, self-hosted, unlimited agents, community support

**Tiresias Platform (Commercial):**
- **Open:** Free, 25 agents, 7 day retention
- **Starter:** $49/month, 50 agents, 30 day retention
- **Pro:** $199/month, 250 agents, 90 day retention, API access
- **Enterprise:** $2499/month, unlimited agents, custom retention, SLA
- **Platform:** $14999/month + $10/tenant, multi-tenant, white label
- **OEM:** $49999-$199999 one-time, embeddable, royalty model
- **MSSP:** $4999/month + $199/tenant, reseller rights

**Discounts:**
- **Annual:** 17% discount for annual pre-payment
- **Partner:** Free Pro key for partners, 25% commission on referrals

**Payment Processing:**
- **Processor:** Stripe
- **Price IDs:** All live and integrated
- **Billing Cycles:** Monthly or annual
- **Invoicing:** Available for Enterprise+ tiers

**Partner Program:**
- **Tiers:** Referral, Silver, Gold
- **Commission:** 25% recurring revenue
- **Benefits:** Co-marketing, sales enablement, technical support

## 10. Market Positioning and Competitive Analysis

**Target Market:** Enterprises deploying AI agents at scale requiring security, compliance, and observability.

**Primary Use Cases:**
1. **Financial Services:** Audit trails for regulatory compliance (SOX, FINRA)
2. **Healthcare:** HIPAA compliant AI interactions with PHI
3. **Government:** FedRAMP ready AI agent security
4. **Technology:** Scaling autonomous agent teams with security controls
5. **MSSPs:** Managed security services for AI deployments

**Competitive Landscape:**

**vs. LangChain Fleet:**
- **Differentiator 1:** Full policy enforcement vs. basic orchestration
- **Differentiator 2:** Behavioral anomaly detection vs. no security monitoring
- **Differentiator 3:** Chain of Thought audit trails vs. basic logging
- **Differentiator 4:** Multi-provider failover vs. single provider
- **Differentiator 5:** Enterprise RBAC vs. basic access controls
- **Differentiator 6:** SIEM integration vs. isolated system
- **Differentiator 7:** On-premises deployment vs. cloud-only

**vs. Custom Solutions:**
- **Advantage:** Integrated platform vs. piecemeal solutions
- **Advantage:** Proven architecture vs. custom development
- **Advantage:** Compliance ready vs. building from scratch

**vs. OpenAI原生监控:**
- **Advantage:** Provider agnostic vs. vendor lock-in
- **Advantage:** Advanced security controls vs. basic usage tracking
- **Advantage:** Private deployment options vs. cloud-only

**Unique Value Proposition:** "Tiresias sees threats. Never data." - Full visibility into AI agent behavior without accessing sensitive business data.

**Patent Portfolio:** 29+ provisional patents filed covering:
- Chain of Thought audit trails
- Behavioral anomaly detection for AI agents
- Policy enforcement pipeline architecture
- Multi-provider failover with encryption

**Trade Secrets:**
- SALUCA-ALFRED: Core policy evaluation algorithm
- NS3: Neural simulation scheduling system

## 11. Internal Operations: The 138 Agent Fleet

**Saluca operates 138 AI agents across 11 departments doing real work.** Legal analysis, patent generation, marketing content, security operations, R&D, revenue operations, compliance. These are not demo agents or test fixtures. They produce real deliverables that drive the business.

**Three layers make this possible:**

1. **MiroShark (Coordination):** The simulation substrate that gives agents the tools to coordinate at scale. SOP rehearsal, decision modeling, policy change impact analysis. Without this layer, 138 agents cannot operate as a coherent organization.

2. **Slack (Observation):** 265 channels across departments. Cristian's window into agent interactions, decisions, escalations, and cross-department coordination. The human oversight layer.

3. **Tiresias (Governance):** Every LLM call from every agent routes through the Tiresias proxy. SoulAuth manages identity and policy. SoulWatch monitors behavior. SoulGate enforces rate limits and detects prompt injection. Aletheia seals audit trails. This is the product, running in production, governing real work.

**The demo is the product itself.** When prospects see Tiresias, they see real dashboards with real telemetry from real agent operations at enterprise scale. Real policy enforcement decisions, real anomaly detections, real audit trails, real cost attribution across 138 agents and 11 departments. The data speaks for itself.

**Architecture:**
- **LLM Routing:** All agent calls through Tiresias proxy (`minipc:8080/v1`)
- **Policy Enforcement:** Three-level hierarchy (org > project > agent) evaluated on every request
- **Audit Logging:** Full CoT chains sealed via Aletheia
- **Behavioral Monitoring:** SoulWatch baselines across all 138 agents with 7-day sliding windows
- **10 Active Workflows:** OSINT, incident response, release management, compliance, patent lifecycle, content pipeline, vendor review, security architecture, change management, daily briefing
- **Twin Architecture:** Agents paired as Twin A (consensus) and Twin I (divergent), enabling A/B policy testing at the identity level

## 12. Orchestration and Workflow Architecture

**Agent Runtime Spec (STEEL-RUNTIME):**
- **Access Matrix:** Two-dimensional (persona x project) with RW/RO/deny grants
- **Result Envelope:** Standardized response format with metadata
- **Auto-Decomposition:** `/gsd:auto` endpoint for task breakdown
- **Worktree Isolation:** Isolated execution environments per agent
- **PDP Integration:** Tiresias policy evaluation for all actions

**Active Workflows (10):**
1. **OSINT Security:** External threat intelligence gathering
2. **Security Architecture:** Design and review of security controls
3. **Incident Response:** SEV-0 through SEV-4 automated response
4. **Daily Briefing:** Automated security briefings
5. **Release Management:** CI/CD pipeline security validation
6. **Change Management:** Policy change impact analysis
7. **Patent Lifecycle:** Patent application automation
8. **Compliance/Privacy:** GDPR, HIPAA, SOC2 compliance checks
9. **Content Pipeline:** Marketing and documentation generation
10. **Vendor Review:** Third-party risk assessment

**Kairos Mesh Adapter:**
- **Purpose:** Adapts Anthropic KAIROS daemon into distributed soul-svc mesh
- **Node Topology:**
  - soul-svc (GCP): Primary orchestration node
  - minipc (claude-code): Development and testing node
  - GCP VM (picoclaw, 68 agents): Scale node
  - tablet: Mobile interface node
- **Heartbeat Loop:** Regular health checks per node

**Consul Service Mesh:**
- **Quorum:** 3-node (GCP VM, DreamServer, NanoClaw) for high availability
- **Transport:** Tailscale encrypted tunnels
- **Service Discovery:** Automatic service registration and discovery

**Meta-Harness Research:**
- **Body Awareness:** System self-monitoring and health assessment
- **Self-Healing:** Automated recovery from failures
- **Auto-Research:** Continuous learning and improvement
- **Dream Cycle:** Offline processing and consolidation
- **HITL Escalation:** Human-in-the-loop escalation paths

## 13. Gap Analysis for Market Readiness

### P0 Critical (Must fix before launch)

1. **SoulAuth PDP Endpoint Unhealthy:** `/v1/auth/evaluate` returns UNHEALTHY on status page
   - **Impact:** Policy enforcement completely broken
   - **Fix:** Debug 8-stage PDP pipeline, check database connections
   - **File:** `Z:\tiresias\soulauth\src\pdp\evaluator.py`

2. **API Documentation 404:** `api.tiresias.network/docs` returns 404
   - **Impact:** Developers cannot integrate with SoulAuth
   - **Fix:** Ensure FastAPI docs are enabled in production
   - **File:** `Z:\tiresias\soulauth\src\main.py`

3. **Platform Subpage Redirects:** All platform.tiresias.network subpages redirect to login
   - **Impact:** No public product information for potential customers
   - **Fix:** Create public product pages or adjust auth middleware
   - **File:** `portal/src/middleware.ts`

4. **Homepage Stat Counters Show "0":** Marketing homepage displays zero values
   - **Impact:** Looks like an unused product
   - **Fix:** Connect to real metrics or implement plausible values
   - **File:** `marketing-portal/src/components/Stats.tsx`

### P1 High Priority (Fix within 48 hours)

5. **Policy Git-Sync Not Configured:** Policy as code git integration not functional
   - **Impact:** Policies cannot be version controlled or collaboratively edited
   - **Fix:** Configure git webhooks and sync service
   - **File:** `Z:\tiresias\soulauth\src\policy\git_sync.py`

6. **Reports Page Uses Hardcoded Mocks:** Portal reports show dummy data
   - **Impact:** Enterprise customers cannot generate real reports
   - **Fix:** Connect to real analytics data sources
   - **File:** `portal/src/pages/reports/*.tsx`

7. **Support Backend Local JSON:** Support ticket system uses local JSON files
   - **Impact:** Cannot scale support operations
   - **Fix:** Implement database backend for support tickets
   - **File:** `portal/src/lib/support.ts`

8. **DLQ Mocked:** Dead Letter Queue for failed messages is mocked
   - **Impact:** Message loss during service failures
   - **Fix:** Implement actual DLQ with Redis or PostgreSQL
   - **File:** `Z:\tiresias\shared\dlq.py`

9. **API-EU Domain Missing:** api-eu.tiresias.network referenced in legal docs but no DNS
   - **Impact:** European customers cannot use GDPR-compliant endpoint
   - **Fix:** Deploy EU region endpoint or remove references
   - **File:** `legal/terms.md`

### P2 Medium Priority (Fix post-launch)

10. **Blog Links Empty:** Marketing blog section has no content
    - **Impact:** Poor SEO and thought leadership presence
    - **Fix:** Create initial blog content or remove section temporarily

11. **"Talk to Sales" Raw mailto::** Contact links use basic mailto: without CRM integration
    - **Impact:** Lost lead tracking and poor user experience
    - **Fix:** Implement Calendly or CRM integration

12. **Company Page Minimal:** About page lacks company information
    - **Impact:** Low trust for enterprise buyers
    - **Fix:** Add team, mission, and customer logos

13. **Input Enforcement Missing Quadrant:** SALUCA-036 specification incomplete
    - **Impact:** Incomplete prompt injection protection
    - **Fix:** Complete PRH pattern library and Z3 verification integration
    - **File:** `Z:\saluca-corp\specs\SALUCA-036-input-enforcement.md`

14. **MiroShark Phase 0 Blocked:** Simulation engine not deployable
    - **Impact:** Cannot demonstrate policy testing capabilities
    - **Fix:** Resolve Reatan 5090 provisioning or use alternative hardware

15. **Agent Management Spec Not Implemented:** Enhanced lifecycle layer is spec-only
    - **Impact:** Cannot scale beyond basic agent management
    - **Fix:** Implement AGENT_MANAGEMENT_SPEC.md
    - **File:** `Z:\_ahiPaper\AGENT_MANAGEMENT_SPEC.md`

## 14. 48-Hour Action Plan Prioritized by Impact

### Hour 0-12: Critical Foundation
1. **Fix SoulAuth PDP (P0):** Debug `/v1/auth/evaluate` endpoint. Check database connections, JWT validation, and policy loading. Expected fix time: 4 hours.
2. **Enable API Docs (P0):** Configure FastAPI docs in production with proper authentication. Expected fix time: 1 hour.
3. **Create Public Product Pages (P0):** Build at least 3 public pages on platform.tiresias.network (features, pricing, documentation). Expected fix time: 6 hours.
4. **Fix Homepage Stats (P0):** Connect to real metrics or implement realistic mock values. Expected fix time: 2 hours.

### Hour 12-24: Core Functionality
5. **Configure Policy Git-Sync (P1):** Set up git webhook integration for policy as code. Expected fix time: 4 hours.
6. **Fix Reports Page (P1):** Connect reports to real analytics data. Start with basic spend and usage reports. Expected fix time: 6 hours.
7. **Implement Support Backend (P1):** Create PostgreSQL tables and API for support tickets. Expected fix time: 4 hours.
8. **Fix DLQ Implementation (P1):** Implement Redis-based dead letter queue. Expected fix time: 3 hours.

### Hour 24-36: Polish and Documentation
9. **Resolve API-EU Domain (P1):** Either deploy EU endpoint or update legal documentation. Expected fix time: 2 hours.
10. **Create Initial Blog Content (P2):** Publish 3 foundational blog posts about AI agent security. Expected fix time: 4 hours.
11. **Implement Sales CRM Integration (P2):** Replace mailto: with Calendly or HubSpot forms. Expected fix time: 3 hours.
12. **Enhance Company Page (P2):** Add team bios, mission statement, and customer logos. Expected fix time: 4 hours.

### Hour 36-48: Final Verification and Launch
13. **Run Full Test Suite:** Execute all 32 enterprise readiness tests. Expected time: 3 hours.
14. **Deploy to Staging:** Blue-green deployment verification using old cluster. Expected time: 2 hours.
15. **Update Documentation:** Ensure all installation guides and API docs are current. Expected time: 3 hours.
16. **Monitor Initial Traffic:** Watch Gatus and Grafana dashboards for issues. Expected time: 4 hours (ongoing).
17. **Launch Announcement:** Prepare and schedule launch communications. Expected time: 2 hours.

**Success Criteria for Launch:**
- All P0 issues resolved
- Core PDP functionality working
- Public product information available
- Real metrics displayed on marketing site
- Basic policy git-sync operational
- Enterprise readiness tests 30/32 passing minimum

**Contingency Plan:** If critical issues persist at hour 36, consider soft launch with limited beta customers while continuing to fix issues. Use feature flags to disable incomplete functionality for general availability.

---
**Document Version:** 1.0  
**Last Updated:** 2026-04-10  
**Author:** Senior Technical Writer & Product Architect  
**Status:** Approved for 48-Hour Launch Execution