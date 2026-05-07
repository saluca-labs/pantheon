# Two-Way Contract Exchange Pipeline

**Status:** SPEC  
**Author:** Cristian Ruvalcaba  
**Date:** 2026-04-03  
**Version:** 1.0  

---

## 1. Overview

This specification defines a two-way contract exchange pipeline between Saluca (the Tiresias platform operator) and its counterparties: reseller partners, MSSP partners, enterprise customers, and MSSP customers. The pipeline enables Saluca to draft, send, negotiate, redline, and execute contracts with counterparties through an iterative review cycle, all backed by hash-chain integrity verification.

This is NOT a customer-facing contract-as-a-service product. This is Saluca's own contract execution workflow for agreements with its customers and partners.

### What Exists Today

The `_soul_contracts` table (migration `0014`) stores contract versions with:
- SHA-256 hash chain linking each version to its predecessor (`chain.py`)
- AI-assisted review engine with negotiation policy (`review.py`)
- Status workflow: draft -> review -> accepted -> signed
- Terminal hash incorporating both signatures
- Discount code generation from signed contracts

Current limitations:
- Admin-internal only -- no counterparty access
- No version history (each row is a standalone version, not linked to a parent contract)
- No redline mechanism
- No comments or annotations
- No magic link access for external parties

---

## 2. Contract Lifecycle

```
DRAFT --> SENT --> COUNTERPARTY_REVIEW --> REDLINED --> SALUCA_REVIEW -->
ACCEPTED --> PENDING_SIGNATURE --> SIGNED --> ACTIVE --> EXPIRED | TERMINATED
```

### State Transitions

| From | To | Actor | Trigger |
|---|---|---|---|
| (none) | DRAFT | Saluca admin | Create contract |
| DRAFT | SENT | Saluca admin | Send to counterparty |
| SENT | COUNTERPARTY_REVIEW | System | Counterparty opens magic link |
| COUNTERPARTY_REVIEW | REDLINED | Counterparty | Submits redlined version |
| REDLINED | SALUCA_REVIEW | System | Auto-transitions on redline receipt |
| SALUCA_REVIEW | SENT | Saluca admin | Sends counter-redline |
| SALUCA_REVIEW | ACCEPTED | Saluca admin | Accepts current version |
| REDLINED | ACCEPTED | Saluca admin | Accepts redlined version as-is |
| ACCEPTED | PENDING_SIGNATURE | System | Auto-transitions on acceptance |
| PENDING_SIGNATURE | SIGNED | Both | Both parties sign |
| SIGNED | ACTIVE | System | Auto-transitions on dual signature |
| ACTIVE | EXPIRED | System | Contract end date reached |
| ACTIVE | TERMINATED | Either | Early termination |

Every state transition produces an audit record:
- Timestamp (UTC)
- Actor identity (Saluca user ID or counterparty token reference)
- Previous state and new state
- Hash chain entry linking to prior audit record

---

## 3. Two-Way Exchange Flow

```
Saluca (Admin)                              Counterparty (Partner/Customer)
    |                                             |
    |-- Create draft from template -------------->|
    |-- Send for review (generates magic link) -->|
    |                                             |-- Receive email with magic link
    |                                             |-- Open contract (COUNTERPARTY_REVIEW)
    |                                             |-- Read, annotate, redline
    |                                             |-- Submit redlined version (REDLINED)
    |<-- Slack + email notification ------------  |
    |-- Review redlines (SALUCA_REVIEW)           |
    |   AI review engine flags risk items         |
    |-- Option A: Accept redlines                 |
    |-- Option B: Reject + counter-redline        |
    |-- Option C: Partial accept + counter ----->>|
    |                                             |-- Receive updated version
    |                                             |-- Review, re-redline if needed
    |                 ... iterate ...              |
    |-- Mark ACCEPTED (both agree) -------------->|
    |                                             |-- Sign (e-signature / acknowledgment)
    |-- Countersign ---------------------------->>|
    |-- Contract ACTIVE                           |-- Contract ACTIVE
```

The iteration loop (SENT -> COUNTERPARTY_REVIEW -> REDLINED -> SALUCA_REVIEW -> SENT) can repeat as many times as needed. Each cycle creates a new version.

---

## 4. Contract Types

| Type Key | Display Name | Auto-Generate Trigger |
|---|---|---|
| `partner_reseller` | Partner Agreement (Reseller) | Partner approved with type=reseller |
| `partner_mssp` | MSSP Partner Agreement | Partner approved with type=mssp |
| `ela` | Enterprise License Agreement | Enterprise tenant created |
| `dpa` | Data Processing Agreement | Any new tenant (GDPR/CCPA) |
| `nda` | Non-Disclosure Agreement | Manual or pre-partner onboarding |
| `sla` | Service Level Agreement | Bundled with ELA or partner agreement |
| `custom` | Custom Agreement | Manual creation only |

---

## 5. Redline Mechanism

### 5.1 Version Model

Each version is a **complete document snapshot**, not a diff. This ensures every version is self-contained and independently verifiable via its hash.

**Version numbering:**
- `v1.0` -- initial draft from Saluca
- `v1.1` -- first counterparty redline
- `v1.2` -- Saluca counter-redline
- `v1.3` -- second counterparty redline
- `v2.0` -- major revision (Saluca resets from new template or fundamental restructure)
- Minor versions increment automatically. Major versions are set explicitly by Saluca admin.

**Each version record contains:**
- Full document content (Markdown)
- Author: `saluca` or `counterparty`
- Change summary (free text describing what changed)
- Content hash (SHA-256, linked to previous version hash)
- AI review results (risk score, flagged clauses)

### 5.2 Diff Computation

Diffs are computed on-demand, never stored. The API provides a diff endpoint that takes two version IDs and returns a structured diff (line-level, using `difflib` or equivalent). The portal renders diffs with additions/deletions highlighted.

### 5.3 Threaded Comments

Comments are attached to a specific version and optionally to a specific section anchor within the document. Sections are identified by Markdown heading slugs (e.g., `limitation-of-liability`).

Comment threads:
- Top-level comment references a version + optional section anchor
- Replies reference the parent comment ID
- Comments are attributed to either `saluca:<user_id>` or `counterparty:<token_ref>`
- Comments can be marked as resolved by either party

---

## 6. Counterparty Access

### 6.1 Magic Link (Primary)

Counterparties access contracts via a time-limited, contract-scoped magic link. No platform login required.

**Token generation:**
1. Saluca admin triggers "Send for review"
2. System generates a 256-bit random token
3. Token is SHA-256 hashed before storage (only the hash is persisted)
4. Raw token is embedded in the magic link URL: `https://tiresias.network/contracts/review/{raw_token}`
5. Email sent to counterparty contact with the link

**Token properties:**
- Default expiry: 7 days (configurable per contract)
- Scoped to exactly one contract ID
- Single counterparty email binding (optional, can be enforced)
- Revocable by Saluca admin
- Maximum 5 active tokens per contract (prevents link sprawl)

**Token validation flow:**
1. Counterparty clicks link
2. Server hashes the incoming token, looks up in `_contract_access_tokens`
3. Validates: not expired, not revoked, contract scope matches
4. Returns contract data; sets a session cookie for subsequent requests in the same session

### 6.2 Tenant Portal Login (Secondary)

If the counterparty is already a tenant with portal access (enterprise customer or MSSP customer), they can optionally access their contracts through their existing portal session at `/dashboard/contracts`. This uses standard tenant authentication and only shows contracts where `tenant_id` matches their tenant.

### 6.3 Access Boundaries

Counterparties (via magic link) can:
- View the contract they were sent
- View version history for that contract
- Submit redlines
- Add comments
- Sign/acknowledge

Counterparties CANNOT:
- View other contracts
- Access any other Tiresias feature
- List contracts
- Modify tokens or access settings

---

## 7. Database Schema

### 7.1 Modifications to `_soul_contracts`

Add columns to the existing table:

```sql
ALTER TABLE _soul_contracts
    ADD COLUMN parent_contract_id UUID REFERENCES _soul_contracts(id),
    ADD COLUMN counterparty_name VARCHAR(255),
    ADD COLUMN counterparty_email VARCHAR(255),
    ADD COLUMN counterparty_org VARCHAR(255),
    ADD COLUMN version_label VARCHAR(20) DEFAULT 'v1.0',
    ADD COLUMN version_author VARCHAR(20) DEFAULT 'saluca'
        CHECK (version_author IN ('saluca', 'counterparty')),
    ADD COLUMN change_summary TEXT,
    ADD COLUMN expires_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN effective_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN terminated_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN termination_reason TEXT;
```

The `parent_contract_id` column links all versions of the same logical contract. The first version (v1.0) has `parent_contract_id = NULL`; all subsequent versions reference the v1.0 row's `id`. This allows querying the full history of a contract.

### 7.2 New Table: `_contract_versions`

A dedicated versions table to cleanly separate version history from the primary contract record. The primary `_soul_contracts` row represents the *current* state; `_contract_versions` holds the full history including the current version.

```sql
CREATE TABLE _contract_versions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id     UUID NOT NULL REFERENCES _soul_contracts(id) ON DELETE CASCADE,
    version_number  INTEGER NOT NULL,
    version_label   VARCHAR(20) NOT NULL,           -- 'v1.0', 'v1.1', 'v2.0'
    author          VARCHAR(20) NOT NULL             -- 'saluca' or 'counterparty'
                    CHECK (author IN ('saluca', 'counterparty')),
    content         TEXT NOT NULL,
    content_hash    VARCHAR(128) NOT NULL,
    prev_hash       VARCHAR(128),
    change_summary  TEXT,
    review_status   VARCHAR(50),                     -- 'auto_accept', 'needs_review', 'auto_reject'
    review_notes    TEXT,
    review_risk_score FLOAT,
    status          VARCHAR(50) NOT NULL DEFAULT 'draft',
    created_by      VARCHAR(255) NOT NULL,           -- user ID or token reference
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

    UNIQUE (contract_id, version_number)
);

CREATE INDEX idx_contract_versions_contract ON _contract_versions(contract_id);
CREATE INDEX idx_contract_versions_hash ON _contract_versions(content_hash);
```

### 7.3 New Table: `_contract_comments`

```sql
CREATE TABLE _contract_comments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id     UUID NOT NULL REFERENCES _soul_contracts(id) ON DELETE CASCADE,
    version_id      UUID NOT NULL REFERENCES _contract_versions(id) ON DELETE CASCADE,
    parent_id       UUID REFERENCES _contract_comments(id) ON DELETE CASCADE,
    section_anchor  VARCHAR(255),                    -- markdown heading slug, nullable
    author_type     VARCHAR(20) NOT NULL             -- 'saluca' or 'counterparty'
                    CHECK (author_type IN ('saluca', 'counterparty')),
    author_id       VARCHAR(255) NOT NULL,           -- user ID or token reference
    author_name     VARCHAR(255) NOT NULL,           -- display name
    body            TEXT NOT NULL,
    resolved        BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_by     VARCHAR(255),
    resolved_at     TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_contract_comments_contract ON _contract_comments(contract_id);
CREATE INDEX idx_contract_comments_version ON _contract_comments(version_id);
CREATE INDEX idx_contract_comments_parent ON _contract_comments(parent_id);
CREATE INDEX idx_contract_comments_section ON _contract_comments(section_anchor);
```

### 7.4 New Table: `_contract_access_tokens`

```sql
CREATE TABLE _contract_access_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id     UUID NOT NULL REFERENCES _soul_contracts(id) ON DELETE CASCADE,
    token_hash      VARCHAR(128) NOT NULL UNIQUE,    -- SHA-256 of raw token
    counterparty_email VARCHAR(255) NOT NULL,
    counterparty_name  VARCHAR(255),
    expires_at      TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked         BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at      TIMESTAMP WITH TIME ZONE,
    revoked_by      VARCHAR(255),
    last_accessed   TIMESTAMP WITH TIME ZONE,
    access_count    INTEGER NOT NULL DEFAULT 0,
    created_by      VARCHAR(255) NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_contract_tokens_hash ON _contract_access_tokens(token_hash);
CREATE INDEX idx_contract_tokens_contract ON _contract_access_tokens(contract_id);
CREATE INDEX idx_contract_tokens_email ON _contract_access_tokens(counterparty_email);
```

### 7.5 New Table: `_contract_signatures`

```sql
CREATE TABLE _contract_signatures (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id     UUID NOT NULL REFERENCES _soul_contracts(id) ON DELETE CASCADE,
    version_id      UUID NOT NULL REFERENCES _contract_versions(id) ON DELETE CASCADE,
    signer_type     VARCHAR(20) NOT NULL             -- 'saluca' or 'counterparty'
                    CHECK (signer_type IN ('saluca', 'counterparty')),
    signer_name     VARCHAR(255) NOT NULL,
    signer_email    VARCHAR(255) NOT NULL,
    signer_title    VARCHAR(255),
    signer_org      VARCHAR(255),
    signature_method VARCHAR(50) NOT NULL DEFAULT 'acknowledgment'
                    CHECK (signature_method IN ('acknowledgment', 'esignature', 'docusign', 'manual')),
    signature_data  JSON,                            -- method-specific payload (e-sig image hash, DocuSign envelope ID, etc.)
    ip_address      VARCHAR(45),                     -- signer's IP at time of signing
    user_agent      TEXT,                             -- signer's browser UA
    content_hash    VARCHAR(128) NOT NULL,            -- hash of the version content at signing time
    terminal_hash   VARCHAR(128),                     -- computed after both parties sign
    signed_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_contract_signatures_contract ON _contract_signatures(contract_id);
CREATE INDEX idx_contract_signatures_version ON _contract_signatures(version_id);
```

### 7.6 New Table: `_contract_audit_log`

```sql
CREATE TABLE _contract_audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id     UUID NOT NULL REFERENCES _soul_contracts(id) ON DELETE CASCADE,
    version_id      UUID REFERENCES _contract_versions(id),
    action          VARCHAR(50) NOT NULL,            -- 'created', 'sent', 'viewed', 'redlined', 'accepted', 'signed', etc.
    actor_type      VARCHAR(20) NOT NULL,            -- 'saluca', 'counterparty', 'system'
    actor_id        VARCHAR(255) NOT NULL,
    prev_status     VARCHAR(50),
    new_status      VARCHAR(50),
    details         JSON,                            -- action-specific metadata
    prev_audit_hash VARCHAR(128),                    -- hash chain linking to previous audit entry
    audit_hash      VARCHAR(128) NOT NULL,           -- SHA-256(prev_audit_hash || action || actor || timestamp)
    ip_address      VARCHAR(45),
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_contract_audit_contract ON _contract_audit_log(contract_id);
CREATE INDEX idx_contract_audit_action ON _contract_audit_log(action);
CREATE INDEX idx_contract_audit_hash ON _contract_audit_log(audit_hash);
```

---

## 8. API Endpoints

### 8.1 Admin Endpoints (Saluca)

All admin endpoints require standard Tiresias admin authentication.

#### `POST /v1/contracts`
Create a new draft contract.

**Request:**
```json
{
    "contract_type": "partner_reseller",
    "counterparty_name": "Acme Security Inc.",
    "counterparty_email": "legal@acmesec.com",
    "counterparty_org": "Acme Security Inc.",
    "tenant_id": "uuid (optional)",
    "partner_id": "uuid (optional)",
    "content": "# Partner Agreement\n\n...",
    "template_id": "uuid (optional, uses template content if provided)",
    "expires_at": "2027-04-03T00:00:00Z (optional)",
    "effective_at": "2026-04-03T00:00:00Z (optional)"
}
```

**Response:** `201 Created`
```json
{
    "contract_id": "uuid",
    "version_id": "uuid",
    "version_label": "v1.0",
    "status": "draft",
    "content_hash": "sha256...",
    "created_at": "2026-04-03T..."
}
```

**Logic:**
1. Create `_soul_contracts` row with status=DRAFT
2. Create `_contract_versions` row (version 1, label v1.0, author=saluca)
3. Compute content hash with genesis prev_hash
4. Run AI review (`review.py`) to pre-flag risk items
5. Write audit log entry

---

#### `PUT /v1/contracts/{id}/send`
Send contract to counterparty for review. Generates a magic link and sends notification email.

**Request:**
```json
{
    "message": "Please review the attached partner agreement. (optional)",
    "token_expiry_days": 7,
    "counterparty_email": "legal@acmesec.com (overrides contract default)"
}
```

**Response:** `200 OK`
```json
{
    "contract_id": "uuid",
    "status": "sent",
    "access_token": "raw_token (returned once, not stored)",
    "magic_link": "https://tiresias.network/contracts/review/{raw_token}",
    "expires_at": "2026-04-10T...",
    "email_sent": true
}
```

**Logic:**
1. Validate contract exists and is in DRAFT or SALUCA_REVIEW state
2. Generate 256-bit random token, store SHA-256 hash in `_contract_access_tokens`
3. Enforce max 5 active tokens per contract
4. Update contract status to SENT
5. Send email via `src/email/sender.py` with magic link and optional message
6. Post to Slack #contracts channel
7. Write audit log entry

---

#### `GET /v1/contracts/{id}/versions`
List all versions of a contract.

**Response:** `200 OK`
```json
{
    "contract_id": "uuid",
    "current_status": "redlined",
    "versions": [
        {
            "version_id": "uuid",
            "version_number": 1,
            "version_label": "v1.0",
            "author": "saluca",
            "change_summary": "Initial draft from reseller template",
            "content_hash": "sha256...",
            "review_status": "auto_accept",
            "review_risk_score": 0.0,
            "created_at": "2026-04-03T..."
        },
        {
            "version_id": "uuid",
            "version_number": 2,
            "version_label": "v1.1",
            "author": "counterparty",
            "change_summary": "Modified liability cap to $500K, added audit clause",
            "content_hash": "sha256...",
            "review_status": "needs_review",
            "review_risk_score": 0.5,
            "created_at": "2026-04-05T..."
        }
    ]
}
```

---

#### `POST /v1/contracts/{id}/versions`
Submit a counter-redline (Saluca side).

**Request:**
```json
{
    "content": "# Partner Agreement\n\n... (complete updated document)",
    "change_summary": "Accepted liability cap at $500K, rejected audit clause modification",
    "major_revision": false
}
```

**Response:** `201 Created` (same shape as POST /v1/contracts response)

**Logic:**
1. Create new `_contract_versions` row with incremented version number
2. Version label: if `major_revision=true`, bump major (v2.0); otherwise bump minor (v1.2)
3. Hash chain: new content hash links to previous version's hash
4. Run AI review on the delta between this version and the previous counterparty version
5. Status remains SALUCA_REVIEW until explicitly sent
6. Write audit log

---

#### `GET /v1/contracts/{id}/diff?v1={version_id}&v2={version_id}`
Compute diff between two versions.

**Response:** `200 OK`
```json
{
    "contract_id": "uuid",
    "v1": { "version_id": "uuid", "version_label": "v1.0" },
    "v2": { "version_id": "uuid", "version_label": "v1.1" },
    "diff": {
        "additions": 12,
        "deletions": 3,
        "changes": [
            {
                "section": "limitation-of-liability",
                "type": "modified",
                "old_text": "Liability shall not exceed $1,000,000",
                "new_text": "Liability shall not exceed $500,000"
            }
        ],
        "unified_diff": "--- v1.0\n+++ v1.1\n@@ -42,3 +42,3 @@\n-Liability shall not exceed $1,000,000\n+Liability shall not exceed $500,000"
    }
}
```

---

#### `PUT /v1/contracts/{id}/accept`
Accept the current version. Transitions to PENDING_SIGNATURE.

**Request:**
```json
{
    "notes": "All terms acceptable. (optional)"
}
```

**Logic:**
1. Validate contract is in SALUCA_REVIEW or REDLINED state
2. Update status to ACCEPTED, then immediately to PENDING_SIGNATURE
3. Notify counterparty via email that the contract is ready for signature
4. Write audit log

---

#### `PUT /v1/contracts/{id}/sign`
Saluca countersign.

**Request:**
```json
{
    "signer_name": "Cristian Ruvalcaba",
    "signer_title": "CEO, Saluca LLC",
    "signer_email": "cristian@saluca.com"
}
```

**Logic:**
1. Validate contract is in PENDING_SIGNATURE state
2. Validate counterparty has already signed (or allow Saluca to sign first)
3. Create `_contract_signatures` row
4. If both parties have signed, compute terminal hash and transition to SIGNED then ACTIVE
5. Write audit log

---

#### `POST /v1/contracts/{id}/access-token`
Generate a new magic link for a counterparty.

**Request:**
```json
{
    "counterparty_email": "legal@acmesec.com",
    "counterparty_name": "Jane Smith",
    "expiry_days": 7
}
```

**Rate limit:** Maximum 10 token generations per contract per 24-hour period.

---

#### `GET /v1/contracts/{id}/comments`
List all comments for a contract, optionally filtered by version or section.

**Query params:** `version_id`, `section_anchor`, `resolved` (boolean)

---

#### `POST /v1/contracts/{id}/comments`
Add a comment (Saluca side).

**Request:**
```json
{
    "version_id": "uuid",
    "section_anchor": "limitation-of-liability (optional)",
    "parent_id": "uuid (optional, for replies)",
    "body": "We can accept the $500K cap but need to keep the aggregate limit."
}
```

---

#### `PUT /v1/contracts/{id}/comments/{comment_id}/resolve`
Mark a comment thread as resolved.

---

### 8.2 Counterparty Endpoints (Token-Authenticated)

All counterparty endpoints authenticate via the magic link token. The token is passed as a path parameter and validated on every request.

#### `GET /v1/contracts/review/{token}`
View contract via magic link.

**Response:** `200 OK`
```json
{
    "contract_id": "uuid",
    "contract_type": "partner_reseller",
    "counterparty_name": "Acme Security Inc.",
    "status": "sent",
    "current_version": {
        "version_id": "uuid",
        "version_label": "v1.0",
        "content": "# Partner Agreement\n\n...",
        "content_hash": "sha256...",
        "created_at": "2026-04-03T..."
    },
    "versions": [ ... ],
    "comments": [ ... ],
    "can_redline": true,
    "can_sign": false
}
```

**Logic:**
1. Hash incoming token, look up in `_contract_access_tokens`
2. Validate not expired, not revoked
3. Update `last_accessed` and increment `access_count`
4. If first access, transition contract from SENT to COUNTERPARTY_REVIEW
5. Return contract with current version, version history, and comments
6. Write audit log (action: `viewed`)

---

#### `POST /v1/contracts/review/{token}/redline`
Submit a redlined version.

**Request:**
```json
{
    "content": "# Partner Agreement\n\n... (complete redlined document)",
    "change_summary": "Modified liability cap, added data residency clause"
}
```

**Logic:**
1. Validate token and contract is in COUNTERPARTY_REVIEW or SENT state
2. Create new `_contract_versions` row (author=counterparty)
3. Auto-increment minor version label
4. Hash chain: link to previous version hash
5. Run AI review (`review.py`) against Saluca's negotiation policy
6. Transition contract to REDLINED (then auto-transition to SALUCA_REVIEW)
7. Notify Saluca via email + Slack
8. Write audit log

---

#### `POST /v1/contracts/review/{token}/comments`
Add comments from counterparty.

**Request:** Same shape as admin comment endpoint.

---

#### `PUT /v1/contracts/review/{token}/sign`
Sign or acknowledge the contract.

**Request:**
```json
{
    "signer_name": "Jane Smith",
    "signer_title": "VP Legal, Acme Security Inc.",
    "signer_email": "jane.smith@acmesec.com",
    "signature_method": "acknowledgment"
}
```

**Logic:**
1. Validate token and contract is in PENDING_SIGNATURE state
2. Capture IP address and User-Agent from request
3. Compute content hash of current version (verify it matches stored hash)
4. Create `_contract_signatures` row
5. If Saluca has already signed, compute terminal hash and transition to SIGNED -> ACTIVE
6. Notify Saluca via email + Slack
7. Write audit log

---

## 9. Portal Pages

### 9.1 Admin Pages

#### `/dashboard/contracts` (Enhanced)
Existing contracts list page, enhanced with:
- Status badges showing lifecycle state with color coding
- Counterparty name and org columns
- Version count indicator (e.g., "v1.3 -- 4 versions")
- Last activity timestamp
- Filter by: status, contract type, counterparty, date range
- Bulk actions: send reminders, revoke access tokens

#### `/dashboard/contracts/new`
Create contract form:
- Select contract type (dropdown)
- Select template or start from blank
- Counterparty fields: name, email, organization
- Link to tenant or partner (autocomplete search)
- Contract dates: effective date, expiration date
- Rich text editor for contract content (Markdown with preview)

#### `/dashboard/contracts/{id}`
Contract detail page with:
- **Header:** Contract type, counterparty info, current status badge, key dates
- **Version Timeline:** Visual timeline showing all versions with author indicators (left=Saluca, right=counterparty). Click any version to view it.
- **Diff Viewer:** Side-by-side diff between any two versions. Additions in green, deletions in red. Section-level navigation.
- **Comments Panel:** Threaded comments anchored to document sections. Inline comment markers in the document view.
- **Actions Bar:** Context-sensitive actions based on current state (Send, Accept, Counter-Redline, Sign, Revoke Token, etc.)
- **Audit Trail:** Collapsible audit log showing every state transition and action

#### `/dashboard/contracts/{id}/send`
Send to counterparty form:
- Confirm or update counterparty email
- Optional message to include in email
- Token expiry duration (default 7 days)
- Preview of the email that will be sent

### 9.2 Counterparty Pages

#### `/contracts/review/{token}`
Public-facing contract review page. No login required (token-gated). Professional, clean design -- this is customer-facing.

**Layout:**
- **Top bar:** Saluca / Tiresias branding (minimal). Contract title and type. Status indicator.
- **Document view:** Full contract content rendered from Markdown. Section navigation sidebar.
- **Redline mode:** Toggle to enable editing. Changes tracked visually. Change summary field required before submission.
- **Comments:** Inline comment markers. Click section heading to add comment. Thread view in right panel.
- **Version history:** Dropdown to view previous versions. Diff view between current and any prior version.
- **Action buttons:**
  - "Submit Redline" (when in review state, redline mode active)
  - "Sign / Acknowledge" (when in pending_signature state)
  - "Download PDF" (any state)

**Design requirements:**
- Mobile-responsive (counterparty legal teams may review on mobile)
- Print-friendly contract view
- Accessibility: WCAG 2.1 AA compliance
- No Tiresias platform chrome -- this is a standalone, purpose-built page

---

## 10. Notifications

### 10.1 Email Notifications (via Resend)

| Event | Recipient | Template |
|---|---|---|
| Contract sent for review | Counterparty | Magic link, contract summary, expiry date |
| Counterparty submits redline | Saluca admin(s) | Link to contract, change summary, AI risk score |
| Saluca sends updated version | Counterparty | Magic link (reuse or new), what changed |
| Contract accepted | Counterparty | Ready for signature, link to sign |
| Counterparty signs | Saluca admin(s) | Link to countersign |
| Both parties signed (ACTIVE) | Both | Confirmation, PDF copy, terminal hash |
| Access token expiring (24h) | Counterparty | Reminder with link |
| Contract expiring (30d) | Both | Renewal notice |

Email sender: `contracts@tiresias.network`  
Reply-to: `legal@saluca.com`

### 10.2 Slack Notifications (#contracts channel)

All contract state transitions post to `#contracts` with:
- Contract type and counterparty
- Old state -> new state
- Actor
- Link to admin contract detail page
- Risk score highlight if needs_review or auto_reject

### 10.3 In-App Notifications

Admin dashboard notification bell shows contract events. Badge count for items requiring attention (REDLINED contracts awaiting review, PENDING_SIGNATURE contracts awaiting countersign).

---

## 11. Security

### 11.1 Hash Chain Integrity

Extends the existing `chain.py` module:

- **Version chain:** Each `_contract_versions.content_hash` links to the previous version's hash via `compute_content_hash(content, prev_hash)`. Identical to the existing mechanism.
- **Audit chain:** Each `_contract_audit_log.audit_hash` links to the previous audit entry's hash: `SHA-256(prev_audit_hash || action || actor_id || created_at_iso)`.
- **Terminal hash:** Computed when both signatures exist: `compute_terminal_hash(content_hash, counterparty_signer, saluca_signer, signed_at)`. Uses the existing function.
- **Verification:** The existing `verify_chain()` function is extended to verify both version chains and audit chains. A new endpoint exposes per-contract chain verification.

### 11.2 Magic Link Security

- Tokens: 256-bit cryptographically random (`secrets.token_urlsafe(32)`)
- Storage: Only SHA-256 hash stored in database (raw token never persisted)
- Expiry: Default 7 days, configurable 1-30 days
- Rate limit: Maximum 10 token generations per contract per 24 hours
- Rate limit: Maximum 100 token validations per IP per hour (brute-force protection)
- Revocation: Immediate revocation by admin; revocation timestamp and actor recorded
- Scope: Each token grants access to exactly one contract
- Binding: Optional email binding (if set, counterparty must confirm email to access)

### 11.3 Access Control

- Admin endpoints: Standard Tiresias admin auth (JWT via `X-Tenant-ID` header or session)
- Counterparty endpoints: Token-only authentication; no platform session
- Counterparty tokens provide READ access to one contract and WRITE access to redlines/comments/signatures on that contract only
- No cross-contract access; no enumeration possible

### 11.4 Data Protection

- Contract content encrypted at rest using existing envelope encryption (AES-256-GCM, KEK in Cloud KMS)
- Magic link tokens transmitted only over HTTPS
- Signature metadata (IP, User-Agent) stored for non-repudiation
- PII in counterparty fields (name, email) subject to tenant data retention policies

### 11.5 Audit

- Every action logged in `_contract_audit_log` with hash chain
- Audit log is append-only; no UPDATE or DELETE operations on audit rows
- Audit entries include IP address for all external (counterparty) actions
- Full audit trail exportable for compliance (SOC 2, ISO 27001)

---

## 12. Implementation Phases

### Phase 1: Version History + Admin Redline Workflow + Magic Link Access
**Target: 1 week**

Deliverables:
- Database migration: new tables (`_contract_versions`, `_contract_access_tokens`, `_contract_audit_log`)
- Columns added to `_soul_contracts`
- `POST /v1/contracts` -- create draft with version tracking
- `POST /v1/contracts/{id}/versions` -- submit redline (admin)
- `GET /v1/contracts/{id}/versions` -- list versions
- `GET /v1/contracts/{id}/diff` -- compute diff
- `PUT /v1/contracts/{id}/send` -- generate magic link
- `POST /v1/contracts/{id}/access-token` -- generate additional tokens
- `GET /v1/contracts/review/{token}` -- view via magic link (read-only)
- Hash chain on versions and audit log
- Admin UI: enhanced contract list, version timeline, diff viewer

### Phase 2: Counterparty Review Portal + Comments
**Target: 1 week**

Deliverables:
- `POST /v1/contracts/review/{token}/redline` -- counterparty submits redline
- `POST /v1/contracts/review/{token}/comments` -- counterparty adds comments
- `POST /v1/contracts/{id}/comments` -- admin adds comments
- `GET /v1/contracts/{id}/comments` -- list comments
- `PUT /v1/contracts/{id}/comments/{id}/resolve` -- resolve comment
- Database migration: `_contract_comments` table
- Counterparty review page (`/contracts/review/{token}`) -- full UI with redline mode and comments
- Admin UI: comments panel in contract detail page
- AI review integration: auto-review counterparty redlines against negotiation policy

### Phase 3: E-Signature + Notifications
**Target: 1 week**

Deliverables:
- `PUT /v1/contracts/{id}/accept` -- accept and move to pending signature
- `PUT /v1/contracts/{id}/sign` -- Saluca countersign
- `PUT /v1/contracts/review/{token}/sign` -- counterparty sign
- Database migration: `_contract_signatures` table
- Terminal hash computation on dual signature
- Email notifications for all state transitions (via Resend)
- Slack notifications to #contracts
- Signature capture UI (acknowledgment checkbox + signer details)
- PDF export of signed contract

### Phase 4: Template Library + Auto-Generation
**Target: 1 week**

Deliverables:
- Contract templates table and management UI
- Template variables (counterparty name, dates, pricing tier, etc.)
- Auto-generate partner agreement when partner is approved (hook into partner approval flow)
- Auto-generate ELA when enterprise tenant is created (hook into tenant creation flow)
- Auto-generate DPA for all new tenants
- Template versioning (templates themselves are version-controlled)
- Bulk operations: send reminders, revoke tokens, export

---

## 13. Integration Points

### 13.1 Existing Contract Module

- `src/contracts/chain.py` -- `compute_content_hash()` and `compute_terminal_hash()` used directly. `verify_chain()` extended to support new version table.
- `src/contracts/review.py` -- `review_contract_delta()` called on every new version (admin or counterparty) to produce risk scores and flagged clauses.
- `src/contracts/router.py` -- Existing endpoints (`/submit`, `/latest`, `/sign`, `/chain/verify`, `/discount`) remain functional. New exchange endpoints added alongside them. Migration path: eventually deprecate `/submit` in favor of `POST /v1/contracts` + version workflow.

### 13.2 Email

- `src/email/sender.py` -- All contract notification emails routed through existing email sender. New templates added for each notification type (Section 10.1).

### 13.3 Partner Program

- When a partner is approved (status changes to `active` in `_soul_partners`), auto-generate the appropriate partner agreement (reseller or MSSP) from template.
- The `contract_hash` column on `_soul_partners` (already exists in models.py) is updated to reference the active contract's terminal hash once signed.

### 13.4 Tenant Onboarding

- When an enterprise tenant is created, auto-generate an ELA from template.
- When any tenant is created, auto-generate a DPA from template.
- Contracts are linked to the tenant via `tenant_id` on `_soul_contracts`.

### 13.5 Billing / Stripe

- Existing `/v1/contracts/discount` endpoint continues to work. Discount codes are generated from signed contracts' terminal hashes.
- Partner pricing tiers from signed contracts feed into Stripe subscription metadata.

### 13.6 Audit / Compliance

- Contract audit log feeds into the platform's SOC 2 evidence collection.
- Hash chain verification is callable from the compliance dashboard.
- Signed contracts with terminal hashes serve as tamper-evident records.

---

## 14. Open Questions

1. **DocuSign integration in Phase 3?** The `signature_method` field supports it, but do we integrate with DocuSign/HelloSign for legally binding e-signatures, or is an acknowledgment-based flow sufficient for now?

2. **Contract content format.** Spec assumes Markdown. Should we support rich text (HTML) or only Markdown with rendered preview? Markdown is simpler and diffs cleanly.

3. **Multi-signer support.** Current design assumes one signer per side. Enterprise contracts may need multiple signers (e.g., legal + executive). Defer to Phase 4 or design now?

4. **Counterparty email verification.** Should magic links require email verification (click link in email -> confirm email -> access contract) or is the link itself sufficient proof of email receipt?

5. **Offline/PDF workflow.** Some counterparties may want to download a Word/PDF, redline offline, and re-upload. Support this in Phase 2 or defer?
