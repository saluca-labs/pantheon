# Security Policy

## Supported Versions

Pantheon ships from `main` — there's no long-lived release branch
strategy. Security fixes land on `main` and are tagged when a
backport-worthy issue surfaces.

| Branch / tag | Supported |
| --- | --- |
| `main` (current) | Yes |
| Tagged releases on `main` from the last 90 days | Security fixes only |
| Anything older, including pre-rename `tiresias-*` tags | No — please upgrade |

> **Historical note:** This component shipped previously as "Tiresias
> Platform v2.x / v3.x" before the rename to Pantheon. The pre-rename
> tags are not supported; please migrate to the current `main`.

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report vulnerabilities by email to: **security@saluca.com**

Include in your report:
- Description of the vulnerability and affected component
- Steps to reproduce
- Potential impact assessment
- Any proposed remediation (optional but appreciated)

### Response Timeline

| Stage    | Target SLA               |
| -------- | ------------------------ |
| Acknowledge | Within 48 hours       |
| Triage   | Within 7 days            |
| Resolution | Depends on severity   |

We follow a **responsible disclosure** model. We ask that you:

1. Give us reasonable time to investigate and patch before public disclosure.
2. Avoid accessing or modifying data beyond what is required to demonstrate the vulnerability.
3. Do not disrupt production systems or extract customer data.

We will credit researchers in our release notes unless you prefer anonymity.

## Bug Bounty

We do not currently offer a bug bounty program.

## Security Contact

security@saluca.com

All security communications are handled by the Saluca LLC security team and treated as confidential.
