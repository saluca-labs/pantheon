# Tiresias Platform — Licensing and Activation Guide

This document describes how licensing works in the Tiresias platform, how to activate a license, and how to troubleshoot common issues.

---

## How Licensing Works

Tiresias uses a signed JWT (JSON Web Token) as its license key. The token is issued by Saluca and contains all entitlement information for your deployment.

**License key location:** Set the `TIRESIAS_LICENSE_KEY` environment variable in your `.env` file. You must also set `TIRESIAS_LICENSE_SECRET` — the HMAC shared secret used to verify the JWT signature. Without both values, license validation will fail.

**Validation behavior:**

- On startup, SoulAuth reads `TIRESIAS_LICENSE_KEY` and validates the JWT signature (using the HMAC secret from `TIRESIAS_LICENSE_SECRET`), expiration, and tier.
- Periodic re-validation occurs during runtime to detect expiration.
- When `SOULAUTH_LICENSE_REQUIRED=true` (the production default), SoulAuth will refuse to start without a valid license.
- When `SOULAUTH_LICENSE_REQUIRED=false`, the platform runs in Community Edition mode with no license required.

**JWT payload fields:**

| Field | Description |
|---|---|
| `sub` | Customer name |
| `tier` | License tier (`community`, `starter`, `pro`, `enterprise`, `mssp`, `saas`) |
| `features` | Array of enabled feature flags |
| `is_nfr` | Boolean — true for not-for-resale / internal evaluation licenses |
| `max_tenants` | Reserved for future use — present in the JWT but not currently enforced by the platform |
| `max_agents_per_tenant` | Reserved for future use — present in the JWT but not currently enforced by the platform |
| `iat` | Issued-at timestamp |
| `exp` | Expiration timestamp |

---

## Tiers and Features

Tiers are cumulative. Each tier includes everything from the tier below it plus the additions listed.

**Tier hierarchy:** community < starter < pro < enterprise < mssp < saas

| Feature | Community | Starter | Pro | Enterprise | MSSP | SaaS |
|---|---|---|---|---|---|---|
| Proxy | Yes | Yes | Yes | Yes | Yes | Yes |
| Logging | Yes | Yes | Yes | Yes | Yes | Yes |
| Basic portal | Yes | Yes | Yes | Yes | Yes | Yes |
| `analytics` | — | — | Yes | Yes | Yes | Yes |
| `pii_scanning` | — | — | Yes | Yes | Yes | Yes |
| `siem_forwarding` | — | — | Yes | Yes | Yes | Yes |
| `detection_rules` | — | — | Yes | Yes | Yes | Yes |
| `delegation` | — | — | Yes | Yes | Yes | Yes |
| `policy_git_sync` | — | — | Yes | Yes | Yes | Yes |
| `action_pipeline` | — | Monitor | Monitor | Active | Active | Active |
| `audit_export` | — | — | — | Yes | Yes | Yes |
| `custom_detection` | — | — | — | Yes | Yes | Yes |
| `enforcement` | — | — | — | Yes | Yes | Yes |
| `investigation` | — | — | — | Yes | Yes | Yes |
| `byok` | — | — | — | Yes | Yes | Yes |
| `sigma_rules` | — | — | — | Yes | Yes | Yes |
| `team_management` | — | — | — | Yes | Yes | Yes |
| `multi_tenant` | — | — | — | Yes | Yes | Yes |
| `prh_engine` | — | — | — | Yes | Yes | Yes |
| `contract_management` | — | — | — | Yes | Yes | Yes |
| `billing_management` | — | — | — | — | — | Yes |
| `saas_management` | — | — | — | — | — | Yes |
| `white_label` | — | — | — | — | Yes | Yes |
| `partner_channels` | — | — | — | — | Yes | Yes |

---

## Activating Your License

1. **Set the license key and HMAC secret.** Add the following to your `.env` file:

   ```
   TIRESIAS_LICENSE_KEY=eyJhbGciOiJIUzI1NiIs...  # your full JWT
   TIRESIAS_LICENSE_SECRET=your-hmac-shared-secret  # required for signature verification
   ```

2. **Enable license enforcement.** Ensure the following is set:

   ```
   SOULAUTH_LICENSE_REQUIRED=true
   ```

3. **Restart SoulAuth** to pick up the new configuration:

   ```bash
   docker compose restart soulauth
   ```

4. **Verify activation.** Confirm SoulAuth is running with the correct tier:

   ```bash
   curl localhost:8000/health
   ```

   A healthy response confirms the license was accepted. The response includes the active tier and enabled features.

---

## License Expiration

**What happens when a license expires:**

- SoulAuth emits a structured log event `license.grace_period` when the license has expired but the grace period is still active.
- After the grace period elapses, SoulAuth emits `license.expired_past_grace` and licensed features are disabled.
- The portal displays a warning banner indicating the license has expired.
- Licensed features continue to function during the grace period but will stop if the service is restarted after expiration.

**Grace period:** SoulAuth does not hard-stop immediately on expiration. Running instances continue operating, but a restart after expiration will fail if `SOULAUTH_LICENSE_REQUIRED=true`.

**Renewal:** Contact [sales@saluca.com](mailto:sales@saluca.com) to obtain a renewed license key. Replace the value of `TIRESIAS_LICENSE_KEY` in your `.env` and restart SoulAuth.

---

## Upgrading Tiers

1. Request an upgraded license from Saluca. A new JWT will be issued with the higher tier and expanded feature array.
2. Replace the `TIRESIAS_LICENSE_KEY` value in your `.env` file with the new token.
3. Restart SoulAuth:

   ```bash
   docker compose restart soulauth
   ```

4. Verify the new tier via the health endpoint.

No data migration is required. Features unlock immediately upon activation of the new license.

---

## Community Edition

The Community Edition runs without a license and is suitable for evaluation and basic proxy use cases.

**Configuration:**

```
SOULAUTH_LICENSE_REQUIRED=false
```

No `TIRESIAS_LICENSE_KEY` or `TIRESIAS_LICENSE_SECRET` is needed.

**Included capabilities:**

- LLM proxy with request routing
- Request and response logging
- Basic portal access

**Not included:** Detection, SIEM forwarding, enforcement, delegation, multi-tenant, analytics, audit export, custom detection rules, policy git sync, white labeling, investigation, BYOK, PII scanning, Sigma rules, team management, billing management, PRH engine, SaaS management, partner channels, contract management.

---

## Troubleshooting

**`license.grace_period` event in logs**

The `exp` claim in your JWT has passed and the system is running in grace period. Decode the token to confirm:

```bash
echo "$TIRESIAS_LICENSE_KEY" | cut -d. -f2 | base64 -d 2>/dev/null | jq .exp
```

Contact [sales@saluca.com](mailto:sales@saluca.com) for a renewed key before the grace period ends.

**`license.expired_past_grace` event in logs**

The license has expired and the grace period has elapsed. Licensed features are now disabled. Obtain a renewed key from [sales@saluca.com](mailto:sales@saluca.com) immediately.

**"License required" — SoulAuth refuses to start**

`SOULAUTH_LICENSE_REQUIRED=true` is set but `TIRESIAS_LICENSE_KEY` is missing or empty. Either:

- Set a valid `TIRESIAS_LICENSE_KEY` and `TIRESIAS_LICENSE_SECRET` in your `.env`, or
- Set `SOULAUTH_LICENSE_REQUIRED=false` to run in Community Edition mode.

**Signature verification fails**

`TIRESIAS_LICENSE_SECRET` is missing or incorrect. The JWT is signed with HS256 (HMAC-SHA256) and requires the shared secret for verification. Ensure the secret provided by Saluca is set correctly in your `.env`.

**Feature not available despite having a license**

Your current tier may not include the feature. Decode the JWT to inspect the `tier` and `features` fields:

```bash
echo "$TIRESIAS_LICENSE_KEY" | cut -d. -f2 | base64 -d 2>/dev/null | jq '{tier, features}'
```

Refer to the tier table above to confirm which features are included in your tier. Contact Saluca to upgrade if needed.

**Health check returns unhealthy but license is valid**

- Confirm the `.env` file is mounted into the SoulAuth container.
- Confirm the JWT has not been truncated (long tokens can be cut off by shell quoting issues — wrap the value in double quotes).
- Confirm `TIRESIAS_LICENSE_SECRET` is set and matches the secret used to sign the JWT.
- Check SoulAuth container logs: `docker compose logs soulauth`.
