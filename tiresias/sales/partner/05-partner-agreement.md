# PARTNER AGREEMENT

**DRAFT -- FOR REVIEW BY LEGAL COUNSEL BEFORE EXECUTION**

**SALUCA LLC -- TIRESIAS PLATFORM**

---

This Partner Agreement ("Agreement") is entered into as of ______________ ("Effective Date") by and between:

**Saluca LLC**, a Delaware limited liability company, doing business as Tiresias, with its principal place of business at _________________________________ ("Saluca" or "Company");

and

**__________________________**, a ______________ organized under the laws of ______________, with its principal place of business at _________________________________ ("Partner").

Saluca and Partner are each referred to herein as a "Party" and collectively as the "Parties."

---

## RECITALS

WHEREAS, Saluca has developed and operates a proprietary agent security, governance, and trust verification platform known as Tiresias (the "Tiresias Platform");

WHEREAS, Partner desires to participate in the Tiresias Partner Program by referring, reselling, or managing end customer deployments of the Tiresias Platform;

WHEREAS, Saluca desires to appoint Partner on a non-exclusive basis to promote and distribute the Tiresias Platform subject to the terms and conditions set forth herein;

NOW, THEREFORE, in consideration of the mutual covenants and agreements contained herein, and for other good and valuable consideration, the receipt and sufficiency of which are hereby acknowledged, the Parties agree as follows:

---

## 1. DEFINITIONS

**1.1** "Confidential Information" has the meaning set forth in Section 9.

**1.2** "Direct-Billed Model" means a billing arrangement in which End Customers subscribe directly to the Tiresias Platform through Stripe, and Partner receives Rev-Share payments calculated on attributed End Customer MRR.

**1.3** "End Customer" means a third party who subscribes to or uses the Tiresias Platform through Partner, whether by Referral (in the case of a Reseller) or through a Sub-Tenant provisioned by Partner (in the case of an MSSP Partner).

**1.4** "MRR" means Monthly Recurring Revenue, defined as the monthly subscription amount actually paid by or on behalf of an End Customer for access to the Tiresias Platform.

**1.5** "MSSP Partner" means a Partner designated as such in Schedule A, authorized to create, manage, and support Sub-Tenants within the Tiresias Platform.

**1.6** "Partner Portal" means the web-based dashboard provided by Saluca for partner management, reporting, tenant provisioning, and related administrative functions, accessible at the URL designated by Saluca.

**1.7** "Partner-Billed Model" means a billing arrangement in which Partner subscribes as a Stripe customer, is invoiced by Saluca for platform access and sub-tenant usage, and bills End Customers independently.

**1.8** "Referral" means an End Customer attributed to Partner via partner tracking, including but not limited to partner referral links, partner codes, or the partner_id parameter associated with Partner's account.

**1.9** "Reseller" means a Partner designated as such in Schedule A, authorized to refer End Customers to the Tiresias Platform but not to create or manage Sub-Tenants.

**1.10** "Rev-Share" means the percentage of End Customer MRR payable to Partner as compensation, as specified in Schedule A.

**1.11** "Sub-Tenant" means a tenant provisioned by an MSSP Partner within the Tiresias Platform for an End Customer's use.

**1.12** "Tiresias Platform" means the Tiresias agent security and trust verification platform operated by Saluca, including SoulAuth, SoulWatch, SoulGate, and all associated software, APIs, dashboards, documentation, and services.

---

## 2. PARTNER TYPES AND SCOPE

**2.1 Reseller.** A Partner designated as a Reseller in Schedule A receives a non-exclusive right to refer End Customers to the Tiresias Platform. Resellers do not create or manage Sub-Tenants. End Customers referred by a Reseller register independently and are attributed to the Reseller via partner tracking (partner_id, referral link, or partner code). Resellers earn Rev-Share on the MRR of attributed End Customers.

**2.2 MSSP Partner.** A Partner designated as an MSSP Partner in Schedule A receives a non-exclusive right to create, manage, and support Sub-Tenants within the Tiresias Platform on behalf of End Customers. MSSP Partners may apply white-label branding to the Partner Portal and End Customer interfaces, subject to Section 8.3. MSSP Partners earn Rev-Share on Sub-Tenant MRR or, under the Partner-Billed Model, bill End Customers independently.

**2.3 Non-Exclusivity.** The rights granted under this Agreement are non-exclusive. Partner may sell, distribute, or promote products and services that compete with the Tiresias Platform. Saluca retains the unrestricted right to sell the Tiresias Platform directly and through other partners, resellers, distributors, and channels.

**2.4 Partner Type.** Partner's designated type (Reseller or MSSP Partner) is specified in Schedule A and may not be changed without Saluca's prior written consent.

---

## 3. APPOINTMENT AND TERRITORY

**3.1 Non-Exclusive Appointment.** Saluca hereby appoints Partner on a non-exclusive basis to promote and distribute the Tiresias Platform in accordance with the terms of this Agreement. No territorial restrictions apply unless expressly stated in Schedule A.

**3.2 Saluca Direct Sales.** Saluca reserves the right to sell the Tiresias Platform directly to any customer in any territory, including to customers who may also be prospects of Partner. Nothing in this Agreement restricts Saluca's ability to appoint additional partners or distributors in any territory.

**3.3 No Agency.** Partner is an independent contractor and shall not represent itself as an agent, employee, joint venturer, or legal representative of Saluca. Partner has no authority to bind Saluca to any obligation, contract, or commitment. Partner shall not use Saluca's name in any manner that implies an employment, agency, or partnership relationship.

---

## 4. PARTNER OBLIGATIONS

**4.1 Accurate Information.** Partner shall maintain accurate and current company information, including legal entity name, contact details, and billing information, in the Partner Portal and in all communications with Saluca.

**4.2 End Customer Support.**

- (a) **MSSP Partners** shall provide first-line technical support to their End Customers, including initial troubleshooting, configuration assistance, and incident triage. MSSP Partners shall escalate issues to Saluca only after reasonable first-line efforts have been exhausted.
- (b) **Resellers** shall facilitate support handoff between End Customers and Saluca's support channels. Resellers are not required to provide direct technical support but shall cooperate in timely communication to ensure End Customer satisfaction.

**4.3 Accurate Representation.** Partner shall not misrepresent the capabilities, features, pricing, or availability of the Tiresias Platform. Partner shall present the Tiresias Platform in a manner consistent with Saluca's published documentation and marketing materials.

**4.4 Legal Compliance.** Partner shall comply with all applicable laws, regulations, and industry standards in connection with its performance under this Agreement, including without limitation data protection regulations (GDPR, CCPA, and equivalent), export control laws, anti-bribery and anti-corruption laws, and consumer protection statutes.

**4.5 Tier Constraints.** Partner acknowledges and agrees that the following tier constraints are enforced server-side and constitute material terms of this Agreement:

- (a) MSSP Partners may only create Sub-Tenants at the Open, Starter, Pro, or Enterprise tiers.
- (b) Sub-Tenants may not be created at the MSSP or SaaS tier. This is a hard constraint enforced at the platform level.
- (c) Sub-Tenants may not create their own child tenants. The maximum hierarchy depth is one level below the MSSP Partner tenant.
- (d) Sub-Tenants may not be upgraded to the MSSP or SaaS tier, whether via the Partner Portal, API, or Stripe subscription change.
- (e) Any attempt to circumvent these constraints, whether through API manipulation, Stripe metadata alteration, or any other method, constitutes a material breach of this Agreement.

**4.6 Minimum Sales Activity.** Partner shall maintain the minimum sales activity thresholds specified in Schedule A. Saluca reserves the right to reclassify, suspend, or terminate Partner's participation if minimum activity thresholds are not met for two consecutive quarters, following written notice and a thirty (30) day cure period.

**4.7 Security Incident Reporting.** Partner shall promptly report to Saluca any security incidents, data breaches, or vulnerabilities that affect or may affect End Customers, Sub-Tenants, or the Tiresias Platform. Reports shall be made to security@saluca.com within twenty-four (24) hours of discovery.

**4.8 Branding Guidelines.** Partner shall use Saluca trademarks and the Tiresias brand in accordance with Saluca's published brand guidelines. Partner shall not alter, distort, or modify Saluca's trademarks except as expressly permitted under white-label provisions in Section 8.3.

---

## 5. SALUCA OBLIGATIONS

**5.1 Platform Availability.** Saluca shall maintain the Tiresias Platform in accordance with published SLA commitments applicable to Partner's subscription tier and End Customer tiers.

**5.2 Partner Portal.** Saluca shall provide Partner with access to the Partner Portal, including tenant management tools (MSSP Partners), referral tracking (Resellers), revenue reporting, and billing management.

**5.3 Sales and Marketing Support.** Saluca shall provide Partner with reasonable sales collateral, technical documentation, and marketing materials for use in promoting the Tiresias Platform. Saluca shall maintain current documentation at docs.tiresias.network or such other location as Saluca may designate.

**5.4 Rev-Share Payments.** Saluca shall calculate and process Rev-Share payments in accordance with Section 7 and the schedule specified in Schedule A.

**5.5 Partner Support.** Saluca shall provide Partner with reasonable technical and commercial support, including escalation paths for End Customer issues that exceed Partner's first-line support capabilities. Support channels and response times shall be consistent with the support tier applicable to Partner's own subscription.

**5.6 Onboarding.** Saluca shall provide reasonable onboarding assistance to newly approved Partners, including Partner Portal setup, API key provisioning, license JWT issuance, and introductory training materials.

---

## 6. PRICING AND BILLING

**6.1 End Customer Pricing.** Pricing for End Customers shall follow the published Tiresias pricing schedule unless otherwise agreed in writing between Saluca and Partner. Current published pricing is as follows:

| Tier | Monthly | Annual |
|------|---------|--------|
| Open | Free | Free |
| Starter | $49/mo | $488/yr ($40.67/mo effective, billed annually) |
| Pro | $199/mo | $1,982/yr ($165.17/mo effective, billed annually) |
| Enterprise | $2,499/mo | $24,890/yr ($2,074.17/mo effective, billed annually) |

MSSP base pricing is $4,999/month plus $199 per Sub-Tenant per month.

**6.2 Partner-Billed Model.** Under the Partner-Billed Model, Partner subscribes as a Stripe customer and is invoiced directly by Saluca for platform access and metered Sub-Tenant usage. Partner is solely responsible for billing End Customers, setting End Customer pricing (subject to any minimum pricing requirements in Schedule A), and collecting payment from End Customers. Saluca has no billing relationship with End Customers under this model.

**6.3 Direct-Billed Model.** When the Direct-Billed Model is available, End Customers shall subscribe directly to the Tiresias Platform through Stripe. Rev-Share shall be calculated on actual paid MRR and paid to Partner in accordance with Section 7. Saluca shall maintain the direct billing relationship with End Customers under this model.

**6.4 Billing Model Selection.** The billing model applicable to Partner is specified in Schedule A. Saluca may make additional billing models available at its discretion. Changes to the billing model require mutual written agreement.

**6.5 Price Modifications.** Saluca reserves the right to modify published pricing with no less than sixty (60) days' prior written notice to Partner. Annual pricing adjustments shall be capped at ten percent (10%) of the then-current price, unless extraordinary market conditions, regulatory changes, or material increases in Saluca's cost structure require otherwise, in which case Saluca shall provide a written explanation.

**6.6 Taxes.** All fees and pricing referenced in this Agreement are exclusive of taxes, duties, and similar governmental assessments. Partner is responsible for all applicable taxes arising from its use of the Tiresias Platform and its transactions with End Customers, excluding taxes based on Saluca's net income.

---

## 7. REVENUE SHARE AND COMPENSATION

**7.1 Rev-Share Percentage.** Partner's Rev-Share percentage is set at the time of Partner approval and specified in Schedule A. The default Rev-Share is twenty-five percent (25%) of attributed End Customer MRR. Rev-Share may range from ten percent (10%) to forty percent (40%) based on partner type, expected volume, and strategic considerations, as determined by Saluca at approval.

**7.2 Calculation.** Rev-Share is calculated monthly based on actual paid MRR of End Customers attributed to Partner. For the Partner-Billed Model, Rev-Share calculations apply only if the Partner-Billed arrangement includes a Rev-Share component as specified in Schedule A. Attribution is determined by the partner_id associated with the End Customer's tenant record or Stripe subscription metadata.

**7.3 Payout Frequency.** Rev-Share payments shall be made monthly or quarterly, as configured in Schedule A. Monthly payouts are calculated on or before the fifteenth (15th) day of the following month. Quarterly payouts are calculated on or before the fifteenth (15th) day of the month following the end of the applicable quarter.

**7.4 Minimum Payout Threshold.** Rev-Share payments below the minimum payout threshold specified in Schedule A (default: fifty dollars ($50)) shall be carried forward to the next payout period. If the accumulated balance does not meet the minimum threshold within twelve (12) months, Saluca shall remit the balance regardless of the threshold.

**7.5 Lifetime Attribution.** Rev-Share continues for the lifetime of the End Customer's subscription, so long as this Agreement remains in effect or during the runoff period specified in Section 11.5.

**7.6 Exclusions.** No Rev-Share is payable on:

- (a) End Customers on the free Open tier;
- (b) End Customers whose subscriptions are in a free trial period;
- (c) End Customers whose payments are overdue by more than sixty (60) days;
- (d) Chargebacks, refunds, or credits applied to End Customer accounts.

**7.7 Reporting.** Saluca shall provide Partner with monthly Rev-Share reports via the Partner Portal, itemizing attributed End Customers, their subscription tiers, MRR, and calculated Rev-Share amounts.

**7.8 Disputes.** Partner must raise any disputes regarding Rev-Share calculations within thirty (30) days of the issuance of the applicable monthly report. Disputes raised after thirty (30) days are deemed waived. Saluca shall investigate disputed amounts in good faith and provide a written response within fifteen (15) business days.

**7.9 Payment Method.** Rev-Share payments shall be made via the payment method configured in the Partner Portal or via Stripe Connect when available. Saluca is not responsible for payment delays caused by Partner's failure to maintain accurate payment information.

---

## 8. INTELLECTUAL PROPERTY

**8.1 Saluca IP.** Saluca retains all right, title, and interest in and to the Tiresias Platform, including all software, APIs, dashboards, documentation, trademarks, trade secrets, patents, copyrights, and other intellectual property. Nothing in this Agreement transfers ownership of any Saluca intellectual property to Partner.

**8.2 Trademark License.** Subject to the terms of this Agreement, Saluca grants Partner a limited, non-exclusive, non-transferable, revocable license to use the Tiresias and Saluca trademarks, logos, and brand assets solely for the purpose of marketing, promoting, and selling the Tiresias Platform in accordance with Saluca's published brand guidelines. This license terminates automatically upon termination of this Agreement.

**8.3 White-Label Rights (MSSP Partners Only).** MSSP Partners may apply custom branding to the Partner Portal and End Customer interfaces, including custom CSS, logo, favicon, and display name, as supported by the Tiresias Platform's white-label branding engine. Notwithstanding any white-label customization, the underlying Tiresias attribution (including "Powered by Tiresias" or equivalent) must remain visible in the "About," footer, or equivalent section of the interface. Saluca may update the minimum attribution requirements with reasonable notice to Partner.

**8.4 Restrictions.** Partner shall not: (a) reverse engineer, decompile, disassemble, or otherwise attempt to derive the source code of the Tiresias Platform; (b) modify, adapt, translate, or create derivative works based on the Tiresias Platform; (c) sublicense, lease, rent, or otherwise transfer rights to the Tiresias Platform except as expressly authorized by this Agreement; (d) remove or alter any proprietary notices on the Tiresias Platform; or (e) use the Tiresias Platform to develop a competing product or service.

**8.5 Feedback.** If Partner provides suggestions, ideas, or feedback regarding the Tiresias Platform ("Feedback"), Partner hereby grants Saluca a perpetual, irrevocable, royalty-free, worldwide license to use, modify, and incorporate such Feedback into the Tiresias Platform without obligation to Partner.

---

## 9. CONFIDENTIALITY

**9.1 Definition.** "Confidential Information" means all non-public information disclosed by one Party ("Discloser") to the other Party ("Recipient") in connection with this Agreement that is designated as confidential or that reasonably should be understood to be confidential given the nature of the information and the circumstances of disclosure.

**9.2 Saluca Confidential Information.** Without limiting the generality of Section 9.1, the following constitute Saluca Confidential Information: sales playbooks, competitive battlecards, internal pricing models, Rev-Share terms and percentages, partner program strategy, roadmap materials, and technical architecture details not included in published documentation.

**9.3 End Customer Data.** End Customer data processed by or stored within the Tiresias Platform is confidential to the End Customer. The Tiresias Platform employs a zero-knowledge architecture: Saluca processes metadata only and does not access End Customer payload data. Partner acknowledges this architecture and shall not represent to End Customers that Saluca has access to their data beyond metadata.

**9.4 Obligations.** The Recipient shall: (a) hold Confidential Information in strict confidence using the same degree of care it uses to protect its own confidential information, but no less than reasonable care; (b) not disclose Confidential Information to any third party except as permitted herein; and (c) use Confidential Information solely for the purposes of performing its obligations or exercising its rights under this Agreement.

**9.5 Permitted Disclosures.** Recipient may disclose Confidential Information to its employees, contractors, and advisors who have a need to know and are bound by confidentiality obligations no less restrictive than those set forth herein.

**9.6 Exclusions.** Confidential Information does not include information that: (a) is or becomes publicly available through no fault of the Recipient; (b) was rightfully in the Recipient's possession prior to disclosure; (c) is independently developed by the Recipient without use of Confidential Information; or (d) is rightfully obtained from a third party without restriction on disclosure.

**9.7 Compelled Disclosure.** If compelled by law, regulation, or legal process to disclose Confidential Information, the Recipient shall provide the Discloser with prompt written notice (to the extent legally permitted) and reasonable assistance to contest or limit the disclosure.

**9.8 Survival.** The obligations set forth in this Section 9 shall survive termination or expiration of this Agreement for a period of two (2) years.

---

## 10. DATA PROTECTION AND SECURITY

**10.1 Applicable Laws.** Partner shall comply with all applicable data protection and privacy laws in connection with its performance under this Agreement, including without limitation the General Data Protection Regulation (GDPR), the California Consumer Privacy Act (CCPA), and any equivalent laws in the jurisdictions in which Partner operates or in which End Customers are located.

**10.2 Partner Responsibility.** Partner is responsible for all End Customer data handling that occurs outside the Tiresias Platform, including data collected by Partner during sales, onboarding, support, and billing processes.

**10.3 Saluca Responsibility.** Saluca is responsible for the security of the Tiresias Platform in accordance with its published security practices and applicable SLA commitments. Saluca shall maintain commercially reasonable administrative, technical, and physical safeguards to protect data processed by the Platform.

**10.4 Data Breach Notification.** In the event of a data breach affecting End Customer data, both Parties shall cooperate in good faith to comply with applicable breach notification requirements. Each Party shall notify the other within twenty-four (24) hours of confirming a breach that affects the other Party's data or End Customers.

**10.5 Data Processing.** To the extent Partner processes personal data of End Customers on behalf of Saluca, or Saluca processes personal data on behalf of Partner, the Parties shall enter into a Data Processing Agreement consistent with applicable law. Saluca's standard DPA is available at tiresias.network/legal/dpa.

---

## 11. TERM AND TERMINATION

**11.1 Initial Term.** This Agreement shall commence on the Effective Date and continue for an initial term of twelve (12) months ("Initial Term").

**11.2 Renewal.** This Agreement shall automatically renew for successive twelve (12) month periods ("Renewal Terms") unless either Party provides written notice of non-renewal at least thirty (30) days prior to the end of the then-current term.

**11.3 Termination for Cause.** Either Party may terminate this Agreement upon written notice if the other Party commits a material breach of this Agreement and fails to cure such breach within thirty (30) days of receiving written notice specifying the breach.

**11.4 Immediate Termination.** Saluca may terminate this Agreement immediately upon written notice, without a cure period, if Partner:

- (a) Violates or attempts to circumvent the tier constraints specified in Section 4.5;
- (b) Materially misrepresents the capabilities, features, or pricing of the Tiresias Platform;
- (c) Engages in fraud, bribery, corruption, or other illegal conduct in connection with this Agreement;
- (d) Causes material reputational harm to Saluca or the Tiresias brand;
- (e) Becomes insolvent, files for bankruptcy, or ceases to operate in the ordinary course of business.

**11.5 Effect of Termination.** Upon termination or expiration of this Agreement:

- (a) Partner's access to the Partner Portal shall be revoked within five (5) business days.
- (b) Rev-Share on existing attributed End Customers shall continue for a ninety (90) day runoff period following the effective date of termination, after which Rev-Share payments shall cease.
- (c) Sub-Tenants provisioned by an MSSP Partner may, at Saluca's discretion, be migrated to direct Saluca management or to another partner. Saluca shall use commercially reasonable efforts to minimize disruption to End Customers during any such migration.
- (d) Partner shall cease all use of Tiresias and Saluca trademarks, logos, and brand assets within thirty (30) days of the effective date of termination.
- (e) Each Party shall return or destroy the other Party's Confidential Information, subject to Section 9.8.
- (f) Any accrued and unpaid Rev-Share owed to Partner as of the effective date of termination shall be paid within thirty (30) days, subject to the minimum payout threshold.

**11.6 Survival.** Sections 1, 7.6, 8.1, 8.4, 8.5, 9, 10, 12, 13, and 14 shall survive termination or expiration of this Agreement.

---

## 12. LIMITATION OF LIABILITY

**12.1 Exclusion of Consequential Damages.** TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, NEITHER PARTY SHALL BE LIABLE TO THE OTHER FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOST PROFITS, LOST REVENUE, LOST DATA, OR BUSINESS INTERRUPTION, ARISING OUT OF OR RELATED TO THIS AGREEMENT, REGARDLESS OF THE THEORY OF LIABILITY AND EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

**12.2 Cap on Saluca Liability.** EXCEPT FOR OBLIGATIONS UNDER SECTION 9 (CONFIDENTIALITY) AND SECTION 13 (INDEMNIFICATION), SALUCA'S TOTAL AGGREGATE LIABILITY ARISING OUT OF OR RELATED TO THIS AGREEMENT SHALL NOT EXCEED THE TOTAL REV-SHARE PAYMENTS PAID TO PARTNER DURING THE TWELVE (12) MONTH PERIOD IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO THE CLAIM.

**12.3 Cap on Partner Liability.** EXCEPT FOR OBLIGATIONS UNDER SECTION 9 (CONFIDENTIALITY) AND SECTION 13 (INDEMNIFICATION), PARTNER'S TOTAL AGGREGATE LIABILITY ARISING OUT OF OR RELATED TO THIS AGREEMENT SHALL NOT EXCEED THE TOTAL FEES PAID BY PARTNER TO SALUCA DURING THE TWELVE (12) MONTH PERIOD IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO THE CLAIM.

**12.4 Essential Basis.** The limitations set forth in this Section 12 reflect the allocation of risk between the Parties and form an essential basis of the bargain between them. The Parties acknowledge that the fees and Rev-Share percentages have been set in reliance upon these limitations.

---

## 13. INDEMNIFICATION

**13.1 By Partner.** Partner shall defend, indemnify, and hold harmless Saluca and its officers, directors, employees, and agents from and against any third-party claim, demand, loss, damage, or expense (including reasonable attorneys' fees) arising from: (a) Partner's marketing, sales practices, or representations regarding the Tiresias Platform; (b) Partner's End Customer relationships, including disputes over billing, support, or service delivery; (c) Partner's violation of applicable law; or (d) Partner's breach of this Agreement.

**13.2 By Saluca.** Saluca shall defend, indemnify, and hold harmless Partner and its officers, directors, employees, and agents from and against any third-party claim, demand, loss, damage, or expense (including reasonable attorneys' fees) arising from: (a) defects in the Tiresias Platform that cause direct harm to End Customers when the Platform is used in accordance with published documentation; or (b) any claim that the Tiresias Platform, as provided by Saluca and used in accordance with this Agreement, infringes any United States patent, copyright, or trade secret of a third party.

**13.3 Conditions.** The indemnification obligations in Sections 13.1 and 13.2 are conditioned on: (a) the indemnified Party providing prompt written notice of the claim; (b) the indemnified Party granting the indemnifying Party sole control of the defense and settlement; and (c) the indemnified Party providing reasonable cooperation at the indemnifying Party's expense.

---

## 14. GENERAL PROVISIONS

**14.1 Governing Law.** This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflict of laws principles.

**14.2 Dispute Resolution.** Any dispute, claim, or controversy arising out of or relating to this Agreement that cannot be resolved through good-faith negotiation within thirty (30) days shall be resolved by binding arbitration administered by the American Arbitration Association ("AAA") in accordance with its Commercial Arbitration Rules. The arbitration shall be conducted by a single arbitrator and shall take place in Wilmington, Delaware, or such other location as the Parties may agree. The arbitrator's decision shall be final and binding, and judgment upon the award may be entered in any court of competent jurisdiction.

**14.3 Injunctive Relief.** Nothing in Section 14.2 prevents either Party from seeking injunctive or equitable relief in a court of competent jurisdiction to protect its intellectual property rights or Confidential Information.

**14.4 Entire Agreement.** This Agreement, together with Schedule A and any amendments executed by both Parties, constitutes the entire agreement between the Parties with respect to the subject matter hereof and supersedes all prior and contemporaneous agreements, understandings, and communications, whether oral or written.

**14.5 Amendment.** This Agreement may be amended only by a written instrument signed by authorized representatives of both Parties.

**14.6 Severability.** If any provision of this Agreement is held to be invalid or unenforceable by a court of competent jurisdiction, the remaining provisions shall continue in full force and effect. The Parties shall negotiate in good faith to replace any invalid provision with a valid provision that achieves, to the extent possible, the original intent.

**14.7 Waiver.** The failure of either Party to enforce any right or provision of this Agreement shall not constitute a waiver of such right or provision. A waiver of any provision shall be effective only if made in writing and signed by the waiving Party.

**14.8 Force Majeure.** Neither Party shall be liable for any failure or delay in performance due to causes beyond its reasonable control, including acts of God, war, terrorism, epidemics, government actions, natural disasters, power failures, internet disruptions, or failures of third-party infrastructure. The affected Party shall provide prompt notice and use commercially reasonable efforts to resume performance.

**14.9 Independent Contractor.** The relationship between the Parties is that of independent contractors. Nothing in this Agreement creates an employment, agency, partnership, joint venture, or franchise relationship between the Parties. Neither Party has the authority to bind the other or incur obligations on the other's behalf.

**14.10 Assignment.** Partner may not assign or transfer this Agreement, or any rights or obligations hereunder, without Saluca's prior written consent. Any purported assignment without such consent shall be void. Saluca may assign this Agreement freely, including in connection with a merger, acquisition, reorganization, or sale of all or substantially all of its assets, upon written notice to Partner.

**14.11 Notices.** All notices under this Agreement shall be in writing and shall be deemed given when: (a) delivered personally; (b) sent by confirmed email; or (c) sent by nationally recognized overnight courier. Notices to Saluca shall be sent to legal@saluca.com. Notices to Partner shall be sent to the email address associated with Partner's account in the Partner Portal, or such other address as Partner may designate in writing.

**14.12 Counterparts.** This Agreement may be executed in counterparts, each of which shall be deemed an original, and all of which together shall constitute one and the same instrument. Electronic signatures shall be deemed valid and binding.

---

## SCHEDULE A -- PARTNER-SPECIFIC TERMS

| Field | Value |
|-------|-------|
| Partner Name | _________________________________ |
| Partner Legal Entity | _________________________________ |
| Partner Type | [ ] Reseller / [ ] MSSP Partner |
| Partner Contact Name | _________________________________ |
| Partner Contact Email | _________________________________ |
| Rev-Share Percentage | ______________% (default: 25%) |
| Rev-Share Model | [ ] Partner-Billed / [ ] Direct-Billed |
| Payout Frequency | [ ] Monthly / [ ] Quarterly |
| Minimum Payout Threshold | $______________ (default: $50) |
| Minimum Sales Activity | ______________ End Customers per quarter |
| Approved Territory | [ ] Worldwide / [ ] _________________________________ |
| Initial Term Start Date | ______________ |
| Initial Term End Date | ______________ |
| White-Label Authorized | [ ] Yes (MSSP only) / [ ] No |
| Special Terms | _________________________________ |

---

## SIGNATURES

IN WITNESS WHEREOF, the Parties have executed this Partner Agreement as of the Effective Date.

**SALUCA LLC**

| | |
|---|---|
| Signature: | _________________________________ |
| Name: | _________________________________ |
| Title: | _________________________________ |
| Date: | _________________________________ |

**PARTNER: __________________________**

| | |
|---|---|
| Signature: | _________________________________ |
| Name: | _________________________________ |
| Title: | _________________________________ |
| Date: | _________________________________ |

---

*Version 1.0 -- Draft -- April 2026*
