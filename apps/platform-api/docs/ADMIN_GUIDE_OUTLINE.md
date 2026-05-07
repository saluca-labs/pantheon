# Tiresias Administration Guide — v3.0

> **Classification:** Internal / Customer-Facing  
> **Audience:** Security administrators, SOC managers, MSSPs, platform operators  
> **Modeled after:** Cisco Secure Firewall Management Center Administration Guide  

---

## Part I: Getting Started

### Chapter 1: Introduction to Tiresias

- 1.1 What Is Tiresias — Platform purpose: identity, monitoring, and gateway security for AI agents
- 1.2 Platform Components — SoulAuth, SoulWatch, SoulGate, Portal, and Tiresias Proxy overview
- 1.3 The Closed-Loop Security Model — How detection feeds enforcement and enforcement generates audit events
- 1.4 Key Concepts and Terminology — SoulKeys, tenants, agents, capability tokens, baselines, policy-as-code
- 1.5 Licensing and Subscription Tiers — Free, Starter, Professional, Enterprise, and MSSP tier capabilities
- 1.6 What's New in v3.0 — Release notes, breaking changes, migration notes from v2.x

### Chapter 2: System Architecture

- 2.1 Architecture Overview — Microservices topology, stateless design, horizontal scaling
- 2.2 Component Interactions — Data flow between SoulAuth, SoulWatch, SoulGate, and Portal
- 2.3 Deployment Models — SaaS (GCP Cloud Run), hybrid, on-premises, and air-gapped options
- 2.4 Network Requirements — Ports, protocols, TLS requirements, and firewall rules
- 2.5 Tenant Isolation Architecture — Per-tenant data paths, cross-tenant prevention, and isolation guarantees
- 2.6 High Availability and Fault Tolerance — Redundancy, failover behavior, and graceful degradation model
- 2.7 Security Properties — Zero-trust evaluation, tamper-evident logging, deterministic enforcement

### Chapter 3: Deployment Guide

- 3.1 Prerequisites and System Requirements — Hardware, software, container runtime, and database dependencies
- 3.2 Deploy Tiresias on GCP Cloud Run — Step-by-step SaaS deployment with secrets and environment variables
- 3.3 Deploy Tiresias with Docker Compose — Self-hosted multi-container deployment with build arguments
- 3.4 Deploy Tiresias on Kubernetes — Helm chart installation, resource limits, and pod configuration
- 3.5 Configure TLS Certificates — Certificate provisioning, rotation, and mutual TLS for service-to-service
- 3.6 Configure the Database — PostgreSQL setup, connection pooling, schema migration, and backup strategy
- 3.7 Validate the Deployment — Health checks, smoke tests, and post-deployment verification procedures
- 3.8 Upgrade and Rollback Procedures — Zero-downtime upgrades, database migration, and rollback steps

### Chapter 4: Initial Configuration

- 4.1 Create the Root Tenant — First-time tenant provisioning and admin account setup
- 4.2 Configure the Portal — Portal environment variables, NEXT_PUBLIC_* build arguments, and proxy settings
- 4.3 Register Your First Agent — Issue a SoulKey, assign scopes, and verify agent authentication
- 4.4 Configure Alerting Channels — Email, Slack, webhook, and PagerDuty notification setup
- 4.5 Set Up SIEM Integration — Connect Splunk, Elasticsearch, Azure Sentinel, or Syslog receivers
- 4.6 Configure Baseline Learning Period — Set initial observation window for behavioral anomaly detection
- 4.7 Verify End-to-End Security Pipeline — Test the closed loop: agent request through detection to enforcement

---

## Part II: Authentication & Access Control

### Chapter 5: SoulAuth — Agent Identity Management

- 5.1 Understanding SoulKeys — Cryptographic agent identity, SHA-512 hashing, one-time display at issuance
- 5.2 Issue and Revoke SoulKeys — Create, rotate, suspend, and permanently revoke agent credentials
- 5.3 Configure Agent Scopes — Define resource access boundaries and action permissions per agent
- 5.4 Manage Agent Groups — Group agents by function, department, or risk level for bulk policy application
- 5.5 Configure Key Rotation Policies — Automatic rotation schedules, grace periods, and rollover behavior
- 5.6 View Agent Identity Audit Trail — Inspect the tamper-evident hash chain for identity lifecycle events
- 5.7 Troubleshoot Agent Authentication Failures — Diagnose expired keys, scope mismatches, and clock skew issues

### Chapter 6: Authorization Policies

- 6.1 Authorization Policy Model — Resource, action, scope triplets and policy evaluation order
- 6.2 Admin RBAC Roles and Permissions — Portal-level roles, permission matrix, new permissions: `users:*`, `teams:*`, `invites:*` (v3.3.0)
- 6.2.1 Team-Level Roles and Permissions (v3.3.0) — Team role hierarchy (team_admin/analyst/member), permission resolution, account admin designations
- 6.3 Write Authorization Policies in YAML — Policy-as-code syntax, examples, and best practices
- 6.4 Configure Policy Sync from Git — Version-controlled policy deployment, branch strategies, and rollback
- 6.5 Test Policies with Dry-Run Mode — Validate policy changes against real traffic without enforcement
- 6.6 Manage Policy Versions and Rollback — Compare versions, audit changes, and revert to known-good state
- 6.7 Troubleshoot Authorization Denials — Inspect decision logs, trace policy evaluation, and resolve conflicts

### Chapter 7: Capability Tokens and Identity Federation

- 7.5 Just-In-Time User Provisioning — JIT provisioning flow, invite-aware provisioning (v3.3.0): pending invites honored at first login to pre-assign team and role

### Chapter 7 (continued): Capability Tokens

- 7.1 Capability Token Architecture — ES256-signed JWTs, lifetime management, and claim structure
- 7.2 Configure Token Lifetimes — Set TTL between 300-900 seconds, per-agent and per-scope overrides
- 7.3 Token Refresh and Renewal Flows — Client-side refresh strategies, sliding windows, and forced re-auth
- 7.4 Inspect and Decode Tokens — CLI and Portal tools for token inspection and claim validation
- 7.5 Revoke Active Tokens — Emergency token revocation, blocklist propagation, and cache invalidation
- 7.6 Monitor Token Usage Patterns — Detect abnormal token issuance rates or reuse anomalies

---

## Part III: Agent Security

### Chapter 8: Agent Lifecycle Management

- 8.1 Agent Registration Workflows — Manual, API-driven, and auto-registration with approval gates
- 8.2 Configure Agent Metadata — Labels, tags, department assignment, and custom attributes
- 8.3 Manage Agent Status — Active, suspended, quarantined, and decommissioned state transitions
- 8.4 Decommission an Agent — Secure decommission procedure: key revocation, log retention, and cleanup
- 8.5 Bulk Agent Operations — Import, export, and batch update agent configurations via CSV or API
- 8.6 View the Agent Inventory Dashboard — Filter, search, and audit all registered agents across tenants

### Chapter 9: Agent Behavioral Baselines

- 9.1 How Behavioral Baselines Work — Per-agent learning, feature extraction, and deviation scoring
- 9.2 Configure Baseline Learning Parameters — Observation window, minimum sample size, and confidence thresholds
- 9.3 View and Interpret Agent Baselines — Understand normal request rates, resource patterns, and timing profiles
- 9.4 Reset or Rebuild a Baseline — Force re-learning after legitimate behavior changes or deployments
- 9.5 Tune Anomaly Sensitivity — Adjust detection thresholds per agent or agent group to reduce false positives
- 9.6 Exclude Known Patterns from Detection — Whitelist scheduled jobs, batch operations, and maintenance windows

### Chapter 10: Agent-to-Agent Trust

- 10.1 Delegation Chain Model — How agents delegate authority and how trust is verified at each hop
- 10.2 Configure Trust Policies — Define which agents can delegate to which others and under what constraints
- 10.3 Monitor Active Delegation Chains — Real-time visibility into active delegations and chain depth
- 10.4 Set Delegation Limits — Maximum chain depth, time limits, and scope narrowing requirements
- 10.5 Investigate Delegation Abuse — Detect privilege accumulation, circular delegation, and chain hijacking

---

## Part IV: Threat Detection & Response

### Chapter 11: SoulWatch — Detection Engine

- 11.1 Detection Engine Architecture — Event ingestion, rule evaluation, baseline comparison, and alert generation
- 11.2 Built-In Anomaly Types — Eight out-of-box detectors: rate spikes, off-hours, credential stuffing, scope escalation, unusual resources, geo anomalies, pattern breaks, privilege accumulation
- 11.3 Configure Detection Sensitivity — Per-anomaly-type threshold tuning, suppression windows, and alert fatigue reduction
- 11.4 View the Real-Time Event Feed — Live security event stream with filtering, search, and drill-down
- 11.5 Manage Alert Severity Levels — Map anomaly types and rule matches to severity tiers (info, low, medium, high, critical)
- 11.6 Configure Alert Escalation Paths — Time-based escalation, on-call routing, and acknowledgment workflows

### Chapter 12: Sigma Detection Rules

- 12.1 Sigma Rule Format for Tiresias — Supported Sigma YAML syntax, field mappings, and Tiresias extensions
- 12.2 Write Custom Detection Rules — Step-by-step rule authoring with field matching, wildcards, and aggregation
- 12.3 Import Community Sigma Rules — Load and adapt existing Sigma rules for agent security use cases
- 12.4 Configure Time-Window Aggregations — Sliding window, tumbling window, and session-based correlation
- 12.5 Test Rules Against Historical Data — Backtest rules against stored events to validate detection efficacy
- 12.6 Manage Rule Lifecycle — Enable, disable, version, and deprecate detection rules
- 12.7 Troubleshoot Rules That Don't Fire — Diagnose field mismatches, scope issues, and evaluation order problems

### Chapter 13: Automated Response Playbooks

- 13.1 Playbook Architecture — Event trigger, condition evaluation, action execution, and audit logging
- 13.2 Configure Quarantine Policies — Auto-suspend keys, force re-auth, kill sessions, or throttle agents per anomaly type
- 13.3 Built-In Response Actions — Suspend SoulKey, revoke tokens, block IP, notify admin, create incident
- 13.4 Write Custom Response Playbooks — YAML-based playbook authoring with conditional logic and action chaining
- 13.5 Configure Response Cooldown Periods — Prevent response storms with minimum intervals between actions
- 13.6 Test Playbooks in Simulation Mode — Dry-run playbook execution against synthetic events
- 13.7 Review Playbook Execution History — Audit trail of every automated response action with outcome and timing

### Chapter 14: Incident Investigation

- 14.1 Navigate the Incident Dashboard — Incident list, severity sorting, assignment, and status tracking
- 14.2 Investigate a Security Event — Step-by-step event triage: timeline, context, related events, and agent history
- 14.3 Correlate Events Across Agents — Cross-agent event correlation to identify coordinated attacks
- 14.4 Export Investigation Data — Package evidence for handoff to IR teams, legal, or law enforcement
- 14.5 Close and Document Incidents — Resolution classification, lessons learned, and rule tuning recommendations

---

## Part V: API Gateway Security

### Chapter 15: SoulGate — Gateway Configuration

- 15.1 Gateway Architecture Overview — Seven-stage security pipeline and request lifecycle
- 15.2 Deploy and Configure SoulGate — Upstream service registration, listener configuration, and TLS termination
- 15.3 Configure Route Policies — Path-based routing, method restrictions, and per-route security overrides
- 15.4 Configure Rate Limiting — Per-agent, per-route, and global rate limits with burst allowance
- 15.5 Configure IP and Geographic Access Control — Allowlists, blocklists, and country-level restrictions
- 15.6 Monitor Gateway Health — Request throughput, latency percentiles, error rates, and upstream status
- 15.7 Troubleshoot Gateway Errors — Diagnose 401, 403, 429, 502, and 503 responses

### Chapter 16: Prompt Injection Detection

- 16.1 Prompt Injection Threat Model — Attack taxonomy aligned to OWASP LLM Top 10
- 16.2 Built-In Detection Rules — Overview of 40+ pattern-based detection rules with severity classifications
- 16.3 Configure Detection Thresholds — Tune composite risk scoring, warn thresholds, and block thresholds
- 16.4 Write Custom Prompt Injection Rules — Pattern authoring for organization-specific attack vectors
- 16.5 Review Blocked Requests — Inspect detection details, risk scores, and matched patterns
- 16.6 Handle False Positives — Whitelist legitimate patterns, tune rules, and adjust scoring weights
- 16.7 Monitor Detection Efficacy — Track detection rates, false positive rates, and coverage gaps over time

### Chapter 17: Circuit Breakers and Anti-Weaponization

- 17.1 Circuit Breaker Model — Closed, open, and half-open states with transition logic
- 17.2 Configure Circuit Breaker Thresholds — Failure rate, minimum request volume, and recovery timeout
- 17.3 Anti-Weaponization Safeguards — Minimum request threshold, per-source failure ratio, and admin lock
- 17.4 Configure the Admin Lock — Manual override to prevent automatic state transitions during active attacks
- 17.5 Monitor Circuit Breaker State — Real-time state visibility, transition history, and impact analysis
- 17.6 Troubleshoot False Circuit Opens — Diagnose premature opens caused by backend issues vs. actual attacks

---

## Part VI: Observability & Analytics

### Chapter 18: Portal Dashboard

- 18.1 Navigate the Portal — Layout, navigation hierarchy, and role-based view restrictions
- 18.2 Configure the Executive Dashboard — Widget selection, time ranges, and KPI display for security posture
- 18.3 Use the Agent Activity View — Per-agent request history, behavioral trends, and anomaly indicators
- 18.4 Use the Threat Overview — Aggregated threat metrics, top attack types, and trending detections
- 18.5 Create Custom Dashboard Views — Build role-specific dashboards with drag-and-drop widget arrangement
- 18.6 Export Reports — PDF, CSV, and scheduled email reports for compliance and executive briefing

### Chapter 19: Logging and Audit

- 19.1 Audit Log Architecture — Tamper-evident SHA-256 hash chain, log schema, and retention policies
- 19.2 Search and Filter Audit Logs — Query by agent, time range, event type, severity, and outcome
- 19.3 Configure Log Retention Policies — Per-tenant retention periods, archival, and purge schedules
- 19.4 Verify Audit Log Integrity — Hash chain validation, gap detection, and tamper alerting
- 19.5 Forward Logs to External Systems — SIEM integration configuration for Splunk, Elastic, Sentinel, and Syslog
- 19.6 Configure CEF Event Formatting — Common Event Format field mapping and custom extension fields

### Chapter 20: Metrics and Alerting

- 20.1 Prometheus Metrics Reference — Available metrics, labels, and scrape endpoint configuration
- 20.2 Configure Grafana Dashboards — Import pre-built dashboards and create custom visualizations
- 20.3 Set Up Alert Rules — Threshold-based, anomaly-based, and composite alert conditions
- 20.4 Configure Notification Channels — Email, Slack, PagerDuty, webhook, and SMS notification setup
- 20.5 Monitor Platform Health — Service status, database performance, queue depth, and resource utilization
- 20.6 Capacity Planning — Request volume projections, scaling triggers, and resource sizing guidelines

---

## Part VII: Enterprise Features

### Chapter 21: Multi-Tenancy

- 21.1 Tenant Model and Isolation — Data partitioning, namespace isolation, and cross-tenant prevention
- 21.2 Create and Configure Tenants — Tenant provisioning, admin assignment, and feature enablement
- 21.3 Configure Tenant-Level Policies — Per-tenant security defaults, rate limits, and detection thresholds
- 21.4 Manage Tenant Quotas — Agent limits, request volume caps, and storage allocation per tenant
- 21.5 Monitor Cross-Tenant Activity — Audit inter-tenant operations and detect isolation violations

### Chapter 22: Single Sign-On and Identity Federation

- 22.1 SSO Architecture — SAML 2.0 and OIDC integration for Portal administrator authentication
- 22.2 Configure SAML SSO — IdP metadata import, attribute mapping, and assertion validation
- 22.3 Configure OIDC SSO — Client registration, scope configuration, and token exchange
- 22.4 Map External Groups to Roles — Sync IdP group memberships to Tiresias RBAC roles
- 22.5 Troubleshoot SSO Login Failures — Diagnose certificate issues, clock skew, and attribute mismatches

### Chapter 23: Role-Based Access Control

- 23.1 RBAC Model — Two-layer role architecture: portal-level (owner/admin/operator/viewer) + team-level (team_admin/analyst/member). Account admin and secondary admin designations (v3.3.0)
- 23.2 Assign Roles to Portal Users — Per-tenant role assignment, multi-tenant access, and least privilege
- 23.2.1 Manage Users (v3.3.0) — User CRUD via `/v1/users` API: list, get, update role/admin flags, delete
- 23.2.2 Manage Teams (v3.3.0) — Team lifecycle via `/v1/teams` API: create, list, update, delete; member management via `/v1/teams/{id}/members`
- 23.2.3 Manage Invitations (v3.3.0) — Invitation system via `/v1/invites` API: create, list, revoke, accept; JIT provisioning honors pending invites
- 23.3 Create Custom Roles — Define custom permission sets for specialized operational needs
- 23.4 Audit Role Assignments — Track who has access to what, when roles changed, and by whom
- 23.5 Configure API Key Permissions — Scope API keys to specific roles and tenants for automation

### Chapter 24: Compliance and Regulatory

- 24.1 Compliance Dashboard — Real-time compliance posture for SOC 2, ISO 27001, and GDPR requirements
- 24.2 Generate Compliance Reports — Automated evidence collection for audit periods
- 24.3 Configure Data Residency — Geographic constraints on data storage and processing locations
- 24.4 Configure Data Retention for Compliance — Map retention policies to regulatory requirements
- 24.5 Privacy Controls — Data minimization, purpose limitation, and right-to-erasure implementation
- 24.6 Export Audit Evidence Packages — Package logs, configs, and policies for external auditors

---

## Part VIII: MSSP Operations

### Chapter 25: MSSP Platform Configuration

- 25.1 MSSP Deployment Architecture — Multi-customer isolation, shared infrastructure, and management hierarchy
- 25.2 Onboard a New Customer Tenant — Automated tenant provisioning, default policy application, and welcome workflow
- 25.3 Configure Customer Tier Packages — Map Stripe subscription tiers to feature sets and resource limits
- 25.4 Manage Partner Revenue Share — Configure partner margins, billing splits, and revenue reporting
- 25.5 Set Customer-Specific SLAs — Response time commitments, uptime guarantees, and escalation policies

### Chapter 26: MSSP Monitoring and Operations

- 26.1 Multi-Customer Security Dashboard — Aggregated threat view across all managed tenants
- 26.2 Configure Cross-Customer Alerting — Unified alert queue with customer context and priority routing
- 26.3 Manage SOC Analyst Workflows — Triage queues, assignment rules, and handoff procedures
- 26.4 Generate Customer-Facing Reports — White-labeled security reports with customer branding
- 26.5 Monitor Service Health Per Customer — Per-tenant SLA tracking, incident counts, and response metrics
- 26.6 Offboard a Customer Tenant — Data export, retention hold, secure deletion, and access revocation

---

## Part IX: Administration

### Chapter 27: Billing and Subscription Management

- 27.1 Subscription Tier Overview — Free, Starter, Professional, Enterprise, and MSSP feature comparison
- 27.2 Configure Stripe Integration — API key setup, webhook endpoints, and payment processing
- 27.3 Manage Customer Subscriptions — Upgrade, downgrade, cancel, and apply promotional pricing
- 27.4 View Billing History and Invoices — Payment history, invoice retrieval, and failed payment handling
- 27.5 Configure Usage-Based Billing — Per-agent and per-request metering, overage charges, and alerts

### Chapter 28: Backup and Disaster Recovery

- 28.1 Backup Strategy — Database, configuration, policy, and secret backup procedures
- 28.2 Configure Automated Backups — Schedule, retention, encryption, and offsite replication
- 28.3 Restore from Backup — Step-by-step restore procedures for database, config, and secrets
- 28.4 Disaster Recovery Procedures — RTO/RPO targets, failover steps, and recovery validation
- 28.5 Test Your DR Plan — Tabletop exercises, partial failover tests, and full DR drills

### Chapter 29: Platform Maintenance

- 29.1 Monitor System Health — Service health endpoints, dependency checks, and degradation indicators
- 29.2 Perform Rolling Updates — Zero-downtime upgrade procedures with canary validation
- 29.3 Manage Database Migrations — Schema versioning, migration execution, and rollback procedures
- 29.4 Rotate Platform Secrets — Service account keys, database credentials, and TLS certificate rotation
- 29.5 Configure Maintenance Windows — Scheduled maintenance, customer notification, and reduced-functionality mode
- 29.6 Performance Tuning — Connection pooling, cache sizing, query optimization, and worker scaling

### Chapter 30: Troubleshooting

- 30.1 Troubleshooting Methodology — Systematic approach: logs, metrics, traces, and escalation
- 30.2 Troubleshoot Authentication Failures — SoulKey errors, token validation failures, and clock synchronization
- 30.3 Troubleshoot Detection Issues — Rules not firing, false positives, baseline drift, and event gaps
- 30.4 Troubleshoot Gateway Errors — Upstream connectivity, TLS errors, rate limit misconfiguration, and timeouts
- 30.5 Troubleshoot Portal Issues — Build failures, proxy errors, WebSocket disconnects, and rendering problems
- 30.6 Troubleshoot SIEM Integration — Event delivery failures, format mismatches, and backpressure handling
- 30.7 Collect Diagnostic Bundles — Generate and submit support bundles with sanitized configuration and logs

---

## Part X: Reference

### Chapter 31: API Reference

- 31.1 API Authentication — SoulKey authentication, token acquisition, and request signing
- 31.2 SoulAuth API — Agent CRUD, key management, policy management, token endpoints, user management (`/v1/users`), team management (`/v1/teams`, `/v1/teams/{id}/members`), invitation management (`/v1/invites`) (v3.3.0: 17 new team RBAC endpoints)
- 31.3 SoulWatch API — Event query, rule management, baseline inspection, and playbook endpoints
- 31.4 SoulGate API — Route configuration, rate limit management, and circuit breaker control endpoints
- 31.5 Portal API — Dashboard data, report generation, and administrative operations
- 31.6 API Rate Limits and Pagination — Rate limit headers, cursor-based pagination, and bulk endpoints
- 31.7 Error Codes and Responses — Complete error code catalog with causes and resolution steps

### Chapter 32: Configuration Reference

- 32.1 Environment Variables — Complete list of environment variables for all services with defaults
- 32.2 YAML Policy Schema — Full schema reference for authorization policies, detection rules, and playbooks
- 32.3 Sigma Rule Field Mapping — Tiresias event fields mapped to Sigma taxonomy
- 32.4 CEF Field Mapping — Common Event Format field definitions for SIEM integration
- 32.5 Portal Build Arguments — NEXT_PUBLIC_* variables and their effects on Portal behavior
- 32.6 Docker Compose Reference — Complete docker-compose.yml with all services, volumes, and networks

### Chapter 33: Security Hardening Guide

- 33.1 Production Security Checklist — Pre-go-live verification of all security controls
- 33.2 Network Hardening — Firewall rules, network segmentation, and TLS configuration
- 33.3 Secret Management — Vault integration, secret rotation, and zero-knowledge storage
- 33.4 Container Hardening — Image scanning, non-root execution, read-only filesystems, and resource limits
- 33.5 Database Hardening — Encryption at rest, connection encryption, access restrictions, and audit logging
- 33.6 Portal Hardening — CSP headers, CORS configuration, session management, and XSS prevention

### Chapter 34: Glossary

- 34.1 Platform Terminology — SoulKey, SoulAuth, SoulWatch, SoulGate, capability token, baseline, tenant
- 34.2 Security Terminology — Zero trust, prompt injection, circuit breaker, anomaly detection, hash chain
- 34.3 Integration Terminology — CEF, Sigma, HEC, OIDC, SAML, RFC 5424, webhook

### Chapter 35: Release Notes and Changelog

- 35.1 v3.3 Release Notes — Team RBAC system, two-layer role model, 17 new API endpoints, 3 new DB tables, invite-aware JIT provisioning, Team Settings tab
- 35.2 v3.0 Release Notes — New features, breaking changes, and migration guide
- 35.3 v2.x Release Notes — Historical release notes for previous major version
- 35.3 Deprecation Notices — Features scheduled for removal with migration paths
- 35.4 Known Issues — Current known issues with workarounds and fix timelines

---

## Appendices

### Appendix A: Quick Reference Cards
- A.1 SoulKey Management Quick Reference — Common key operations in one page
- A.2 Sigma Rule Writing Quick Reference — Rule syntax cheat sheet with examples
- A.3 Troubleshooting Decision Tree — Flowchart for common issues

### Appendix B: Sample Configurations
- B.1 Starter Deployment — Minimal viable configuration for evaluation
- B.2 Production Single-Tenant — Recommended configuration for single-organization deployment
- B.3 MSSP Multi-Tenant — Reference architecture for managed security service providers

### Appendix C: Compliance Mapping
- C.1 SOC 2 Type II Control Mapping — Tiresias features mapped to SOC 2 trust service criteria
- C.2 ISO 27001 Annex A Mapping — Platform controls mapped to ISO 27001 requirements
- C.3 NIST CSF Mapping — Coverage mapped to NIST Cybersecurity Framework functions
