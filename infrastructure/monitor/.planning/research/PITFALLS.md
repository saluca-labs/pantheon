# Domain Pitfalls

**Domain:** Infrastructure monitoring, drift detection, and security observability on a resource-constrained single-VM environment
**Researched:** 2026-03-19
**Environment:** Single GCP VM (4GB memory), Docker containers, Python services, Supabase, Grafana Loki, Telegram alerts

---

## Critical Pitfalls

Mistakes that cause rewrites, outages, or render the entire monitoring system untrustworthy.

### Pitfall 1: The Observer Kills the Observed (Resource Contention on 4GB VM)

**What goes wrong:** The monitoring stack (Tiresias container, drift scanner, security telemetry collectors) consumes enough memory and CPU that the services being monitored degrade or OOM-kill. Agent-zero already has a 4GB memory limit. Adding Prometheus, a drift scanner running every 5 minutes, log collectors, and a security analysis engine on the same host creates a resource war where monitoring causes the very outages it exists to detect.

**Why it happens:** Monitoring tools are designed for dedicated infrastructure. Prometheus with default retention eats 1-2GB easily. Python-based scanners with subprocess calls (docker inspect, nmap) spike memory. Log collectors buffer in memory. On a dedicated monitoring server this is fine; on a shared 4GB VM it is catastrophic.

**Consequences:** OOM kills cascade unpredictably. Docker's OOM killer may kill the monitoring container (silent failure) or kill a production service (monitoring-induced outage). Either outcome destroys trust in the system.

**Warning signs:**
- Memory usage consistently above 75% of VM total
- Swap usage appearing on a VM that should not need swap
- Intermittent container restarts correlating with scan intervals
- Drift scanner or security rules timing out

**Prevention:**
- Hard memory limits on every container: Tiresias gets 256MB max, not "whatever is available"
- Use lightweight collection only: no local Prometheus server (push metrics to Grafana Cloud Loki which is already in use), no local time-series DB
- Drift scanner must be event-driven or long-interval (not 5-minute full scans) -- use filesystem inotify for config changes, Docker events API for container state, and full scans only every 30-60 minutes
- Profile memory usage of every component before deploying alongside production services
- Set `mem_limit` and `memswap_limit` in docker-compose for Tiresias container

**Detection:** `docker stats --no-stream` as a cron job writing to Supabase, alert when any container exceeds 80% of its limit.

**Phase:** Must be addressed in Phase 1 (infrastructure setup). Getting memory budgets wrong early means everything built on top is unreliable.

---

### Pitfall 2: Who Watches the Watchmen (Monitoring Bootstrap Paradox)

**What goes wrong:** Tiresias monitors all services. Tiresias goes down. No alerts fire because the alerting system IS Tiresias. Hours pass. You discover the outage by accident when checking a dashboard manually. This is the most dangerous failure mode in any monitoring system -- the silent monitoring death.

**Why it happens:** Self-referential monitoring creates a circular dependency. If the monitoring container crashes, the thing that would detect the crash is itself dead. This is not a theoretical concern -- it is the single most common failure mode in small-scale monitoring deployments where budget prevents redundant monitoring infrastructure.

**Consequences:** Complete loss of visibility during the exact moments visibility matters most. Drift accumulates undetected. Security events go unlogged. The system provides a false sense of security that is worse than having no monitoring at all.

**Warning signs:**
- No "monitoring is healthy" heartbeat in your external channel
- Gaps in telemetry data with no corresponding alerts
- Tiresias container restarting without anyone being notified
- Audit log has time gaps

**Prevention:**
- Implement a dead man's switch: Tiresias sends a heartbeat to an external service every N minutes. If the heartbeat stops, the external service alerts via a completely independent channel. Options:
  - Simplest: a cron job on the VM (outside Docker) that checks if the Tiresias container is running and sends a Telegram alert directly if it is not. This is not elegant but breaks the circular dependency.
  - Better: Use an external heartbeat service (Healthchecks.io has a free tier, or the existing `alfred_monitor` service if it runs independently of Tiresias)
- `alfred_monitor` already exists as a separate service -- it must NOT depend on Tiresias for its own health checking. Keep it as the independent watchdog.
- The dead man's switch must use a different notification path than Tiresias (direct Telegram API call, not routed through Tiresias alerting).

**Detection:** If you ever see a gap in your heartbeat log, the dead man's switch failed silently. Test it monthly by deliberately stopping Tiresias and confirming the alert fires.

**Phase:** Must be addressed in Phase 1 alongside initial deployment. A monitoring system without a dead man's switch is a liability, not an asset.

---

### Pitfall 3: Alert Fatigue Destroys the Entire System's Value

**What goes wrong:** The monitoring system fires 50+ alerts per day. Within a week, alerts become background noise. Within a month, critical alerts are ignored alongside the noise. A real security incident occurs, the alert fires, and nobody acts on it because it looks like every other alert.

**Why it happens:** New monitoring deployments start with enthusiasm -- every metric gets an alert, every threshold is set conservatively, every anomaly triggers a notification. The PROJECT.md lists 10+ automation triggers, each producing alerts. On a single-person team (CISO wearing all hats), even 5 non-actionable alerts per day is too many.

**Consequences:** The monitoring system becomes actively harmful -- it provides a false sense of security ("we have alerting") while the human has been conditioned to ignore it. This is worse than no monitoring because it removes the motivation to check things manually.

**Warning signs:**
- More than 3 Telegram alerts per day that do not require immediate action
- Alerts that are acknowledged but not acted upon
- "Informational" alerts mixed into the same channel as critical alerts
- Repeated alerts for the same unresolved condition

**Prevention:**
- Implement strict alert severity levels with different channels:
  - CRITICAL (Telegram, immediate): Service down, security breach detected, unsafe drift. Target: fewer than 1 per week.
  - WARNING (Telegram, batched daily digest): Certificate expiring, resource trending high, safe drift auto-remediated. Target: daily summary, not individual messages.
  - INFO (Supabase log only, no notification): Routine scan completed, heartbeat confirmed, baseline synced. Never notify.
- Every alert must answer: "What should I do RIGHT NOW?" If the answer is "nothing," it is not an alert -- it is a log entry.
- Start with fewer rules and add based on actual incidents, not anticipated ones. The PROJECT.md lists prompt injection detection, port scan detection, auth failure correlation, PII detection, cert expiry, health degradation, and drift. Deploy with only drift + service health + auth failures initially. Add detection rules one at a time after baselining normal behavior.
- Implement alert suppression: if the same alert fires 3 times in an hour, suppress subsequent instances and send a single "recurring condition" summary.

**Detection:** Track alert-to-action ratio. If fewer than 50% of alerts result in a human taking action, the alerting is too noisy.

**Phase:** Phase 2 (alerting pipeline). But the architecture decision -- severity tiers and channel separation -- must be made in Phase 1.

---

### Pitfall 4: Drift Scanner Creates More Drift Than It Detects (State Mutation)

**What goes wrong:** The drift scanner needs read access to Docker, system configs, network state, and service endpoints. In practice, "read" operations have side effects: querying Docker stats affects scheduling, scanning endpoints generates log entries that trigger security rules, and the scanner itself creates artifacts (temp files, connections, log entries) that the next scan detects as drift.

**Why it happens:** The assumption that observation is passive is false in computing. Every `docker inspect` call, every HTTP health check, every file stat generates events. On a system instrumented for security telemetry, the scanner's own activity becomes signal that the security monitor must distinguish from real threats.

**Consequences:** False positive drift detection (scanner's own artifacts detected as changes), security alert loops (scanner's HTTP probes flagged as suspicious), and cascading re-scans that waste resources. In the worst case, an auto-remediation system "fixes" something the scanner itself caused.

**Warning signs:**
- Drift reports consistently showing the same "drift" items that auto-resolve
- Security rules triggering on internal scanner IP/user-agent
- Scan duration increasing over time as artifacts accumulate
- Auto-remediation loops (fix applied, detected as new drift, fixed again)

**Prevention:**
- Scanner identity must be explicitly whitelisted in security rules. Create a scanner service account, use a distinct user-agent, and exempt its source IP/container from threat detection rules.
- Scanner must not write to any filesystem or database it monitors. Scan results go to Tiresias-owned tables only.
- Auto-remediation must have a circuit breaker: if the same remediation fires more than twice in an hour, halt and alert a human. Never allow unbounded auto-fix loops.
- Implement a "scan fingerprint" -- the scanner records what it touched during each run so subsequent runs can distinguish scanner artifacts from real drift.

**Detection:** Count remediation actions per drift item. If any item has more than 2 remediations in 24 hours, it is likely a feedback loop.

**Phase:** Phase 2 (drift detection implementation). The whitelisting architecture must be designed in Phase 1.

---

## Moderate Pitfalls

### Pitfall 5: Baseline Rot (Declared State Diverges from Intended State)

**What goes wrong:** The YAML baseline in git was accurate when written. Six months later, the infrastructure has evolved through legitimate changes that were never reflected back to the baseline. Now the drift scanner reports dozens of "drift" items that are actually the new normal. The team either ignores all drift reports (alert fatigue) or spends hours updating the baseline after every change (toil).

**Why it happens:** The dual-layer approach (git YAML + Supabase) described in PROJECT.md is architecturally sound, but it requires discipline: every legitimate infrastructure change must update the YAML baseline. In a small team moving fast, this discipline breaks down quickly. The baseline becomes aspirational rather than declarative.

**Prevention:**
- Make baseline updates part of the deployment workflow, not a separate step. If you change a Docker compose file, the CI must also update the baseline YAML or the deploy is blocked.
- Implement "drift acceptance" -- a mechanism to promote detected drift to the new baseline with a single command, creating a git commit with the change. This reduces the friction of baseline maintenance from "edit YAML, commit, push" to "accept this drift."
- Run a weekly "baseline freshness" check that compares the last baseline update timestamp to the last infrastructure change timestamp. If the gap exceeds 7 days, alert.

**Detection:** Rising count of "known drift" items that nobody addresses. If the drift report consistently shows more than 5 items, the baseline is rotting.

**Phase:** Phase 2 (drift detection). Build the "drift acceptance" workflow from day one -- do not defer it.

---

### Pitfall 6: Security Detection Without Response Playbooks (Detection-Response Gap)

**What goes wrong:** The system detects a port scan, fires an alert, and... then what? The human reads the Telegram message, thinks "that's concerning," and goes back to what they were doing. There is no documented response procedure, no automated containment, no escalation path. Detection without response is security theater.

**Why it happens:** Building detection rules is interesting engineering. Writing runbooks for each detection is tedious documentation. Teams consistently build the detection layer and defer the response layer "until we need it." When they need it, they are in the middle of an incident and improvising.

**Prevention:**
- For every detection rule deployed, require a corresponding response playbook BEFORE the rule goes live. The playbook does not need to be automated -- it can be a checklist -- but it must exist.
- Minimum playbook: (1) What does this alert mean? (2) What should I check first? (3) What is the containment action? (4) When do I escalate?
- For single-person operations, automated containment is more important than for large teams. If an auth failure correlation fires at 3 AM, automatic IP blocking with a 1-hour TTL is better than a Telegram message that gets read at 8 AM.
- Store playbooks alongside detection rules in the same git repo. If you `git rm` a rule, the playbook goes with it.

**Detection:** Audit each detection rule: does it have a corresponding playbook? If not, it is incomplete.

**Phase:** Phase 3 (security monitoring). Every detection rule must ship with its response procedure.

---

### Pitfall 7: PII Detection False Positives on LLM Traffic

**What goes wrong:** PII detection on LLM request/response streams flags enormous amounts of content as containing PII. Names mentioned in conversation, example email addresses in code, phone numbers in documentation -- all trigger PII alerts. The signal-to-noise ratio makes PII detection worthless.

**Why it happens:** LLM traffic is fundamentally different from structured API traffic. Conversations naturally contain names, locations, and identifiers that are contextually appropriate. Regex-based PII detection cannot distinguish between "my SSN is 123-45-6789" and "the test SSN 123-45-6789 in the unit test."

**Prevention:**
- Do not deploy regex-based PII detection on LLM traffic. Use contextual classification that understands whether PII is being transmitted (user sharing their own data) vs. referenced (discussion about PII handling).
- Start with high-confidence PII patterns only: credit card numbers (Luhn-validated), SSNs (with context), API keys (entropy-based). Skip names, emails, and phone numbers initially.
- Implement a "PII allowlist" for known-safe patterns in your specific traffic (e.g., your own email addresses, test data patterns).
- Log PII detections without alerting for the first 30 days. Review the log to calibrate before turning on alerts.

**Detection:** PII alert volume exceeding 10 per day on a small LLM deployment almost certainly indicates false positives.

**Phase:** Phase 4 or later. PII detection is a differentiator, not table stakes. Get drift and security monitoring working first.

---

### Pitfall 8: Modeling Enterprise Deployment on Toy Scale Masks Real Problems

**What goes wrong:** The single-VM deployment works perfectly. You declare the enterprise reference architecture validated. An actual enterprise deploys with 50 VMs, network segmentation, multiple availability zones, and everything breaks because the architecture assumed co-located services, single-network communication, and no latency.

**Why it happens:** The PROJECT.md explicitly positions this as modeling an enterprise on-prem deployment. The gap between a single Docker bridge network and an enterprise network with firewalls, VLANs, and WAN links is enormous. Patterns that work on `agent-net` (direct container-to-container communication, no TLS needed internally, no DNS resolution issues) will not transfer.

**Prevention:**
- Document explicitly which aspects of the deployment model transfer to enterprise and which do not. Create a "deployment model gap analysis" that lists assumptions (single network, co-located services, no TLS internal, single point of administration) and their enterprise equivalents.
- Where possible, add friction that simulates enterprise conditions: use TLS between containers even though they are on the same bridge network, use DNS names instead of container names, implement authentication between monitoring components.
- Do not claim "enterprise-ready" based on single-VM testing. Claim "reference architecture validated at small scale" and list what still needs validation at enterprise scale.

**Detection:** If you cannot articulate three specific differences between your deployment and an enterprise deployment, you have not thought about this enough.

**Phase:** Phase 1 (architecture design). The gap analysis should be part of the initial design document, not an afterthought.

---

## Minor Pitfalls

### Pitfall 9: Telegram as Single Notification Channel

**What goes wrong:** Telegram bot gets rate-limited, API goes down, or Telegram is blocked in a network. All alerting stops silently.

**Prevention:** Implement a fallback notification path. Simplest option: if Telegram send fails, write to a local file and send an email via a different provider. The dead man's switch (Pitfall 2) partially addresses this, but only for the "monitoring is dead" case, not the "monitoring is alive but cannot notify" case.

**Phase:** Phase 2 (alerting pipeline). Add retry logic and a fallback channel.

---

### Pitfall 10: Supabase as Operational Store Creates External Dependency

**What goes wrong:** Supabase has an outage or network connectivity to Supabase drops. The drift scanner cannot read baselines, security events cannot be logged, audit trail has gaps. Monitoring continues but is degraded and potentially blind.

**Prevention:** Cache the last-known baseline locally in the Tiresias container. If Supabase is unreachable, scan against cached baseline and buffer events locally. Flush buffer when connectivity returns. Never fail-open (skip scanning) due to Supabase unavailability.

**Detection:** Track Supabase query latency. If p99 exceeds 2 seconds, connectivity is degrading.

**Phase:** Phase 2 (drift detection). Build the local cache from the start -- do not assume Supabase is always available.

---

### Pitfall 11: Kali Sidecar Scans Trigger External Alerts

**What goes wrong:** Active scanning from the Kali container (nmap, nuclei) against public-facing endpoints triggers alerts at GCP level (abuse detection), at upstream providers (Cloudflare WAF), or at other tenants sharing infrastructure. GCP may suspend the VM.

**Prevention:** Scope Kali scans to internal-only targets (container-to-container on agent-net). For external endpoint monitoring, use passive HTTP probes only, not active vulnerability scanning. If active scanning of external endpoints is needed, rate-limit aggressively and ensure GCP's acceptable use policy permits it.

**Detection:** Monitor for GCP abuse notifications. Check Cloudflare WAF logs for blocks originating from your VM IP.

**Phase:** Phase 3 (security monitoring). Define the scan scope explicitly before deploying any active scanning.

---

### Pitfall 12: 5-Minute Drift Scans on Docker Create Excessive I/O

**What goes wrong:** The PROJECT.md specifies 5-minute drift scan intervals. Each scan calls `docker inspect` on every container, reads config files, checks port bindings, queries service health endpoints, and writes results. On a VM with limited IOPS (standard GCP persistent disk), this creates I/O pressure that affects all services.

**Prevention:** Use event-driven detection for Docker state (subscribe to Docker events API for container start/stop/die/health_status events) and reserve full declarative scans for longer intervals (30-60 minutes). The events API is nearly zero-cost compared to polling.

**Detection:** Monitor disk I/O wait times. If `iowait` exceeds 5% during scan windows, the scan interval is too aggressive.

**Phase:** Phase 2 (drift detection). Architect for event-driven detection from the start, with full scans as a reconciliation backup.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Phase 1: Infrastructure & baseline setup | Resource contention (P1), bootstrap paradox (P2), enterprise model gaps (P8) | Set hard memory limits, implement dead man's switch, document model gaps |
| Phase 2: Drift detection engine | Baseline rot (P5), scanner state mutation (P4), I/O overhead (P12), Supabase dependency (P10) | Build drift acceptance workflow, whitelist scanner identity, use event-driven detection, cache locally |
| Phase 3: Security monitoring | Alert fatigue (P3), detection-response gap (P6), Kali scan scope (P11), Telegram SPOF (P9) | Start with 3 rules max, require playbooks, internal-only active scans, add notification fallback |
| Phase 4: Advanced detection (PII, prompt injection) | PII false positives (P7) | Contextual classification, 30-day silent logging before alerting |
| Ongoing: Operations | All of the above compounding | Monthly review of alert-to-action ratio, baseline freshness, memory budgets |

---

## Sources

- [Mitigating Alert Fatigue in Cloud Monitoring (ScienceDirect)](https://www.sciencedirect.com/science/article/pii/S138912862400375X)
- [Preventing Alert Fatigue in Network Monitoring (LogicMonitor)](https://www.logicmonitor.com/blog/network-monitoring-avoid-alert-fatigue)
- [Alert Fatigue: What It Is and How to Fix It (Netdata)](https://www.netdata.cloud/academy/what-is-alert-fatigue-and-how-to-prevent-it/)
- [GreptimeDB Monitoring Bootstrapping (Greptime)](https://www.greptime.com/blogs/2024-11-26-bootstrap)
- [Securing Your Monitoring Stack with a Dead Man Switch](https://seifrajhi.github.io/blog/securing-monitoring-stack-dead-man-switch/)
- [How to Set Up Heartbeat and Dead Man's Switch Alerts (OneUptime)](https://oneuptime.com/blog/post/2026-02-06-heartbeat-dead-man-switch-opentelemetry-pipeline/view)
- [Prometheus Dead Man's Switch Setup](https://jakubstransky.com/2019/01/26/who-monitors-prometheus/)
- [Monitoring and Debugging Prometheus (PromLabs)](https://training.promlabs.com/training/monitoring-and-debugging-prometheus/metrics-based-meta-monitoring/end-to-end-watchdog-alerts/)
- [Making SIEM Alerts Smarter: Best Practices (Cymulate)](https://cymulate.com/blog/smarter-siem-alerts-validation/)
- [9 Ways to Eliminate False Positive SIEM Alerts (ConnectWise)](https://www.connectwise.com/blog/9-ways-to-eliminate-siem-false-positives)
- [Alert Tuning Best Practices for SOC (Prophet Security)](https://www.prophetsecurity.ai/blog/security-operations-center-soc-best-practices-alert-tuning)
- [Config Drift Detection: Top Open Source Tools 2025](https://www.ai-infra-link.com/mastering-config-drift-detection-top-open-source-tools-for-2025/)
- [How to Detect and Prevent Configuration Drift in IaC (Snyk)](https://snyk.io/articles/infrastructure-as-code-iac/detect-prevent-configuration-drift/)
- [Infrastructure Drift Detection (Spacelift)](https://spacelift.io/blog/drift-detection)
- [AI in Incident Response: Automation Improves MTTR (Rootly)](https://rootly.com/blog/ai-in-incident-response-how-automation-improves-mttr)
- [Reducing MTTR with Automated Policy Workflows (FireMon)](https://www.firemon.com/blog/reducing-mttr-with-automated-policy-workflows/)
- [Docker Container Performance Metrics (Last9)](https://last9.io/blog/docker-container-performance-metrics/)
- [Node Exporter Memory Usage (GitHub Issue)](https://github.com/prometheus/node_exporter/issues/2726)
