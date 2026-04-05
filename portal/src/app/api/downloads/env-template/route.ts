/**
 * GET /api/downloads/env-template?tenant_id=X&license_key=Y
 *
 * Serves a pre-filled .env file for self-hosted deployment.
 * Generates a random KEK for the customer.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const ENV_TEMPLATE = `# Tiresias — Self-Hosted Configuration
# Generated for your deployment. Review and set your Postgres password.
#
# Quick start:
#   1. Save this file as .env next to docker-compose.yml
#   2. Set a secure POSTGRES_PASSWORD below
#   3. docker compose up -d
#   4. Visit http://localhost:8080/health

# ─── Required ────────────────────────────────────────────────────────────────

# Postgres
POSTGRES_USER=tiresias
POSTGRES_PASSWORD=CHANGE_ME
POSTGRES_DB=tiresias

# Tenant identity (pre-filled from your account)
TIRESIAS_TENANT_ID={{TENANT_ID}}

# Encryption key (auto-generated — 64 hex chars / 32 bytes)
TIRESIAS_KEK={{KEK}}

# License key (pre-filled from your account)
TIRESIAS_LICENSE_KEY={{LICENSE_KEY}}

# ─── Optional ────────────────────────────────────────────────────────────────

# Proxy
PROXY_PORT=8080
SOULAUTH_PORT=8000
TIRESIAS_PROVIDERS=anthropic,openai
TIRESIAS_UPSTREAM_URL=https://api.openai.com
TIRESIAS_RETENTION_DAYS=90
TIRESIAS_USAGE_RETENTION_DAYS=365
TIRESIAS_GENERIC_PROXY_MODE=false
LOG_LEVEL=info

# KEK Provider (default: local)
# Options: local, aws-kms, gcp-sm
TIRESIAS_KEK_PROVIDER=local

# AWS KMS (if TIRESIAS_KEK_PROVIDER=aws-kms)
TIRESIAS_AWS_KMS_KEY_ID=
TIRESIAS_AWS_KMS_REGION=us-east-1

# GCP Secret Manager (if TIRESIAS_KEK_PROVIDER=gcp-sm)
TIRESIAS_GCP_PROJECT_ID=
TIRESIAS_GCP_SECRET_ID=

# JWT Keys (auto-generated on first boot if empty)
JWT_PRIVATE_KEY=
JWT_PUBLIC_KEY=
`;

export async function GET(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get("tenant_id") || "";
  const licenseKey = request.nextUrl.searchParams.get("license_key") || "";

  // Generate a cryptographically random KEK (64 hex chars = 32 bytes)
  const kek = crypto.randomBytes(32).toString("hex");

  const envContent = ENV_TEMPLATE
    .replace("{{TENANT_ID}}", tenantId)
    .replace("{{KEK}}", kek)
    .replace("{{LICENSE_KEY}}", licenseKey);

  return new NextResponse(envContent, {
    status: 200,
    headers: {
      "Content-Type": "text/plain",
      "Content-Disposition": 'attachment; filename=".env"',
    },
  });
}
