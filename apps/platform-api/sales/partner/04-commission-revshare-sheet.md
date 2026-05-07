# Tiresias Partner Program -- Commission & Revenue Share Reference Sheet

**Saluca LLC | For Approved Partners and Sales Engineers**
**Version:** 1.0 | **Effective:** 2026-04-06

---

## How You Earn

Tiresias partners earn recurring revenue. Not one-time referral fees, not points in a loyalty program. Real, ongoing income tied to the customers you bring and the tenants you manage.

There are two partner models. Pick the one that fits your business.

---

### Reseller Model

You refer customers to Tiresias. They subscribe directly through Stripe. You earn a percentage of their MRR for as long as they remain subscribed.

| Detail | Value |
|---|---|
| How customers subscribe | Directly via Stripe (their own subscription) |
| Tracking | Your `partner_id` embedded in referral link (`?ref=PARTNER_CODE`) |
| Default rev-share | **25% of customer MRR** |
| Rev-share range | 10% to 40% (negotiated at partner approval) |
| Rev-share duration | Lifetime of the customer subscription (no cap, no sunset) |
| Your involvement | Refer, support, and retain your customers |

**How it works:** You send prospects to Tiresias through your unique referral link. When they subscribe, their tenant is tagged with your `partner_id`. Every month, your rev-share is calculated on their actual paid MRR and credited to your payout ledger.

---

### MSSP Model

You run a managed security practice on top of Tiresias. You provision and manage tenants for your end customers. Two billing options exist.

#### Option A: Partner-Billed (Recommended for Starting Out)

You are the Stripe customer. You pay Tiresias one bill. You bill your own clients at whatever price you set.

| Detail | Value |
|---|---|
| Your Tiresias subscription | MSSP tier ($4,999/mo base) |
| Per-tenant cost to you | $199/tenant/mo |
| What you charge clients | Whatever you want |
| Your margin | Your price minus Tiresias cost |
| Billing relationship | You bill your clients directly |
| White-label | Yes, included with MSSP tier |
| Tenant provisioning | Via API (`POST /v1/partners/tenants`) and partner portal |

**Example:** You charge a client $500/mo for a Pro-tier managed tenant. Your Tiresias cost for that tenant is $199/mo. Your margin is $301/mo per client, every month, for as long as they stay.

#### Option B: Direct-Billed with Rev-Share (Coming in Phase 2)

Each of your sub-tenants gets their own Stripe subscription with Tiresias. You earn a rev-share percentage on each one.

| Detail | Value |
|---|---|
| Sub-tenant billing | Each tenant has own Stripe subscription |
| Default rev-share | **25% of sub-tenant MRR** |
| Rev-share range | 10% to 40% |
| Requires | Stripe Connect account setup |
| Automated payouts | Via Stripe Connect transfers |
| Billing relationship | Tiresias bills the sub-tenant; you earn a share |

**Example:** Your sub-tenant subscribes at Enterprise ($2,499/mo). Your 25% rev-share = $624.75/mo. Another at Pro ($199/mo) = $49.75/mo. These accumulate automatically.

---

## Earnings Scenarios

### Reseller Earnings (at 25% Rev-Share)

| Customers | Avg Tier | Customer MRR | Your Monthly Earnings | Your Annual Earnings |
|---|---|---|---|---|
| 5 | Starter ($49) | $245 | $61.25 | $735 |
| 10 | Starter ($49) | $490 | $122.50 | $1,470 |
| 10 | Pro ($199) | $1,990 | $497.50 | $5,970 |
| 10 | Enterprise ($2,499) | $24,990 | $6,247.50 | $74,970 |
| 25 | Mix (avg $300) | $7,500 | $1,875.00 | $22,500 |
| 50 | Mix (avg $400) | $20,000 | $5,000.00 | $60,000 |
| 100 | Mix (avg $500) | $50,000 | $12,500.00 | $150,000 |

**At higher rev-share tiers:**

| Customers | Avg MRR/Customer | Rev-Share % | Monthly Earnings | Annual Earnings |
|---|---|---|---|---|
| 25 | $300 | 15% | $1,125 | $13,500 |
| 25 | $300 | 25% | $1,875 | $22,500 |
| 25 | $300 | 35% | $2,625 | $31,500 |
| 50 | $400 | 15% | $3,000 | $36,000 |
| 50 | $400 | 25% | $5,000 | $60,000 |
| 50 | $400 | 35% | $7,000 | $84,000 |

---

### MSSP Earnings (Partner-Billed, Option A)

Your MSSP base subscription is $4,999/mo. Per-tenant cost is $199/mo. Everything above that is yours.

| Sub-Tenants | Your Price/Tenant | Tiresias Cost/Tenant | Margin/Tenant | Monthly Tenant Margin | MSSP Base Cost | Net Monthly Margin | Annual Net Margin |
|---|---|---|---|---|---|---|---|
| 5 | $350 | $199 | $151 | $755 | $4,999 | -$4,244 | -$50,928 |
| 10 | $350 | $199 | $151 | $1,510 | $4,999 | -$3,489 | -$41,868 |
| 20 | $400 | $199 | $201 | $4,020 | $4,999 | -$979 | -$11,748 |
| 25 | $400 | $199 | $201 | $5,025 | $4,999 | $26 | $312 |
| 30 | $450 | $199 | $251 | $7,530 | $4,999 | $2,531 | $30,372 |
| 50 | $500 | $199 | $301 | $15,050 | $4,999 | $10,051 | $120,612 |
| 75 | $500 | $199 | $301 | $22,575 | $4,999 | $17,576 | $210,912 |
| 100 | $500 | $199 | $301 | $30,100 | $4,999 | $25,101 | $301,212 |

**Break-even analysis:**

| Your Price/Tenant | Margin/Tenant | Tenants to Cover MSSP Base | Break-Even Tenants |
|---|---|---|---|
| $300 | $101 | 50 | ~50 |
| $350 | $151 | 34 | ~34 |
| $400 | $201 | 25 | ~25 |
| $450 | $251 | 20 | ~20 |
| $500 | $301 | 17 | ~17 |
| $600 | $401 | 13 | ~13 |
| $799 | $600 | 9 | ~9 |

Pricing your managed service at $450+ per tenant puts break-even at 20 tenants or fewer. Every tenant above that is pure margin.

---

### MSSP Earnings (Direct-Billed, Option B -- Phase 2)

In this model you do not pay the per-tenant fee. Instead, Tiresias bills sub-tenants directly and you earn a rev-share.

| Sub-Tenants | Avg Tier | Sub-Tenant MRR (Total) | Your Rev-Share (25%) | MSSP Base Cost | Net Monthly | Net Annual |
|---|---|---|---|---|---|---|
| 10 | Pro ($199) | $1,990 | $497.50 | $4,999 | -$4,501.50 | -$54,018 |
| 20 | Pro ($199) | $3,980 | $995.00 | $4,999 | -$4,004.00 | -$48,048 |
| 20 | Enterprise ($2,499) | $49,980 | $12,495.00 | $4,999 | $7,496.00 | $89,952 |
| 50 | Mix (avg $400) | $20,000 | $5,000.00 | $4,999 | $1.00 | $12 |
| 50 | Enterprise ($2,499) | $124,950 | $31,237.50 | $4,999 | $26,238.50 | $314,862 |
| 100 | Mix (avg $500) | $50,000 | $12,500.00 | $4,999 | $7,501.00 | $90,012 |

Option B makes sense at scale with higher-tier tenants. For most partners starting out, Option A (partner-billed) delivers better economics because you control the pricing.

---

## Payout Mechanics

| Parameter | Details |
|---|---|
| **Calculation** | Monthly; snapshot taken at reconciliation time |
| **Trigger** | Automated cron on the 1st of each month at 00:00 UTC |
| **Frequency** | Monthly or quarterly (configured at partner approval) |
| **Minimum threshold** | $50 (default; configurable up to $500 for larger partners) |
| **Below threshold** | Balance rolls over to the next period |
| **Phase 1 payout method** | Manual, invoice-based (partner submits invoice, Saluca pays) |
| **Phase 2 payout method** | Automated Stripe Connect transfers |
| **Ledger** | Full line-item detail in the partner portal (`/dashboard/partner/payouts`) |
| **Audit log** | Every calculation, adjustment, and payout recorded with timestamps |

### Monthly Reconciliation Process

1. Cron triggers on the 1st of the month
2. For each active partner, the system queries all referred customers (reseller) or sub-tenants (MSSP)
3. For each customer/tenant, actual paid MRR is fetched from Stripe
4. Rev-share is calculated: `customer_mrr * (revshare_pct / 100)`
5. All rev-share amounts are summed for the partner
6. If the total meets or exceeds the minimum threshold, a payout ledger entry is created
7. Phase 1: flagged for manual payout; Phase 2: Stripe Transfer is initiated automatically
8. If below threshold, the balance carries forward

---

## Important Terms

**What rev-share is calculated on:**
- The customer's actual paid MRR, not list price. If a customer is on annual billing, rev-share is calculated on the monthly equivalent (annual price / 12).

**When rev-share adjusts:**
- If a customer upgrades, your rev-share increases with their new MRR the following month.
- If a customer downgrades, your rev-share adjusts down accordingly.
- If a customer churns, rev-share on that customer stops immediately.

**Duration and limits:**
- Rev-share is ongoing for the lifetime of the customer's subscription. There is no cap and no sunset clause.
- There is no clawback on previously paid rev-share, even if the customer later churns.

**Transparency:**
- Every rev-share calculation is visible in the partner portal with line-item detail per customer.
- Disputes or adjustments are logged in the partner audit log with full attribution.
- Payout history, including pending and completed payouts, is available for download.

**Partner-billed MSSP (Option A) specifics:**
- No rev-share applies; your margin is the difference between what you charge and what Tiresias charges you.
- Tiresias invoices you for the MSSP base fee ($4,999/mo) plus $199 per active sub-tenant.
- Metered usage is reconciled monthly against actual tenant count.

---

## Getting to Your First $5K/Month

Here is a realistic ramp for a committed Reseller partner at 25% rev-share.

| Timeline | Activity | Cumulative Customers | Est. Monthly Earnings |
|---|---|---|---|
| **Month 1** | Tap existing network; 3 trial signups | 0 paid | $0 |
| **Month 2** | 2 more trials from warm introductions | 0 paid | $0 |
| **Month 3** | First 2 paid conversions (1 Starter, 1 Pro) | 2 | $62 |
| **Month 4** | 3 more conversions (2 Pro, 1 Enterprise) | 5 | $511 |
| **Month 5** | Referrals from existing customers; 3 more Pro | 8 | $660 |
| **Month 6** | Pipeline matures; 5 new (3 Pro, 2 Enterprise) | 13 | $1,558 |
| **Month 7** | Word of mouth; 4 new (2 Pro, 2 Enterprise) | 17 | $2,356 |
| **Month 8** | Repeat cycle; 5 new (mix) | 22 | $3,254 |
| **Month 9** | Acceleration; 5 new (mix trending to Enterprise) | 27 | $4,152 |
| **Month 10** | Cross $5K threshold; 6 new | 33 | $5,250 |
| **Month 11** | Compounding; upgrades from Starter to Pro | 36 | $5,850 |
| **Month 12** | Stable pipeline | 40 | $6,500 |

**Year 1 total (cumulative earnings across all months): ~$30,000**
**Run-rate at Month 12: $6,500/mo = $78,000 annualized**

For MSSP partners, the ramp is steeper upfront (covering the $4,999/mo base) but the ceiling is higher. An MSSP partner charging $500/tenant who reaches 50 tenants by month 12 is earning over $10,000/mo net after the base fee.

### The Compounding Effect

Every customer you add increases your monthly earnings permanently (as long as they stay subscribed). Unlike one-time sales commissions, your 25th customer does not just earn you one month of revenue; it adds to every future month. A book of 50 customers at an average MRR of $400 earns you $5,000 every single month, indefinitely.

| Year-End Book Size | Avg Customer MRR | Your Annual Recurring Earnings |
|---|---|---|
| 25 customers | $300 | $22,500/yr |
| 50 customers | $400 | $60,000/yr |
| 75 customers | $500 | $112,500/yr |
| 100 customers | $500 | $150,000/yr |

---

## Quick Reference: Tiresias Pricing Tiers

For partners who need to know what their customers will pay.

| Tier | Monthly | Annual (save 17%) | Agents Included |
|---|---|---|---|
| Open | Free | Free | 25 |
| Starter | $49/mo | $40.67/mo ($488/yr) | 50 |
| Pro | $199/mo | $165.17/mo ($1,982/yr) | 250 |
| Enterprise | $2,499/mo | $2,074.17/mo ($24,890/yr) | Unlimited |
| MSSP | $4,999/mo base + $199/tenant | Contact us | Unlimited |

**Resellers** can refer customers to any tier except MSSP and SaaS.
**MSSP partners** provision sub-tenants at any tier up to Enterprise. Sub-tenants cannot be MSSP or SaaS tier.

---

## Questions?

Contact the Tiresias partner team at **contact@saluca.com** or reach out through your partner portal.

---

*Saluca LLC | Confidential -- For Approved Partners and Sales Engineers Only*
