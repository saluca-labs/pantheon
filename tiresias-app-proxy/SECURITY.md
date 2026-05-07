# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Reporting a Vulnerability

Report security vulnerabilities to:

**Email:** security@saluca.com

Please include:

- Description of the vulnerability
- Steps to reproduce
- Affected component(s) and version(s)
- Impact assessment (confidentiality, integrity, availability)
- Any suggested remediation

## Response Timeline

| Milestone | Target |
|-----------|--------|
| Acknowledgment | 48 hours |
| Initial triage and severity assessment | 5 business days |
| Fix or mitigation plan (Critical/High) | 30 days |
| Fix or mitigation plan (Medium/Low) | 90 days |

## Scope

The following components are in scope:

- Authentication and authorization (API key verification, Cedar policy engine)
- Audit log integrity (hash chain)
- Wasm sandbox isolation (capability bridge, resource limits)
- Risk scoring and behavioral analysis
- Approval workflow
- Data handling (argument masking, sensitive pattern detection)

## Disclosure Policy

We follow coordinated disclosure. We ask that you do not publicly disclose the vulnerability until we have released a fix or 90 days have passed since your report, whichever comes first.

## Recognition

We appreciate the security research community's efforts to improve the security of the Tiresias platform. Reporters of valid vulnerabilities will be credited in the release notes (unless they prefer to remain anonymous).
