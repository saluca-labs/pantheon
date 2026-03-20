"use client";

import { useState } from "react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

const sections = [
  { id: "privacy", label: "Privacy Policy" },
  { id: "terms", label: "Terms of Service" },
  { id: "dpa", label: "Data Processing Agreement" },
];

export default function LegalPage() {
  const [activeSection, setActiveSection] = useState("privacy");

  return (
    <>
      <Navbar />
      <main className="min-h-screen pt-24 pb-20">
        {/* Header */}
        <div className="mx-auto max-w-4xl px-6 lg:px-8">
          <h1 className="text-4xl font-bold tracking-tight mb-4">
            <span className="text-gradient-gold">Legal</span>
          </h1>
          <p className="text-foreground-muted text-lg mb-10">
            Transparency is foundational to trust. Read our policies governing the Tiresias platform.
          </p>

          {/* Tab navigation */}
          <div className="flex gap-1 border-b border-border mb-12">
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                onClick={() => setActiveSection(section.id)}
                className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeSection === section.id
                    ? "border-gold-500 text-foreground"
                    : "border-transparent text-foreground-muted hover:text-foreground hover:border-foreground-subtle"
                }`}
              >
                {section.label}
              </a>
            ))}
          </div>

          {/* ============================
              PRIVACY POLICY
             ============================ */}
          <section id="privacy" className="mb-20 scroll-mt-32">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-600/15">
                <svg className="h-5 w-5 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold">Privacy Policy</h2>
            </div>
            <p className="text-foreground-subtle text-sm mb-8">Effective: March 2026 &middot; Saluca LLC</p>

            <div className="space-y-8 text-foreground-muted leading-relaxed">
              <div className="glass-card rounded-xl p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">1. Information We Collect</h3>
                <p className="mb-3">
                  We collect the minimum information necessary to provide, secure, and improve the Tiresias platform:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li><span className="text-foreground font-medium">Account information</span> &mdash; Name, email address, company name, and billing details provided during registration.</li>
                  <li><span className="text-foreground font-medium">Usage metrics</span> &mdash; Aggregated platform usage data such as API call counts, feature adoption, and performance metrics.</li>
                  <li><span className="text-foreground font-medium">Agent metadata</span> &mdash; Agent identifiers, capability tokens issued, and policy evaluation logs (no payload content).</li>
                </ul>
              </div>

              <div className="glass-card rounded-xl p-6 border-l-2 border-l-teal-500">
                <h3 className="text-lg font-semibold text-foreground mb-3">2. Information We Do NOT Collect</h3>
                <p className="mb-3">
                  Our zero-knowledge architecture is not a marketing claim &mdash; it is an engineering guarantee:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li><span className="text-foreground font-medium">Agent payloads</span> &mdash; We never inspect, store, or log the content of messages between your agents.</li>
                  <li><span className="text-foreground font-medium">Customer data processed by agents</span> &mdash; Your agents&apos; operational data never touches our infrastructure.</li>
                  <li><span className="text-foreground font-medium">Private keys</span> &mdash; Cryptographic keys are generated and stored client-side. We have no access to them.</li>
                </ul>
              </div>

              <div className="glass-card rounded-xl p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">3. How We Use Your Data</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li><span className="text-foreground font-medium">Service operation</span> &mdash; Authentication, authorization, account management, and support.</li>
                  <li><span className="text-foreground font-medium">Security monitoring</span> &mdash; Detecting anomalous access patterns, preventing abuse, and protecting infrastructure.</li>
                  <li><span className="text-foreground font-medium">Product improvement</span> &mdash; Aggregated, anonymized analytics to improve platform reliability and features.</li>
                </ul>
              </div>

              <div className="glass-card rounded-xl p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">4. Data Retention</h3>
                <p>
                  Retention periods are configurable per tenant. By default, audit logs are retained for <span className="text-foreground font-medium">90 days</span>. Account information is retained for the duration of your subscription and for 30 days following termination, unless a longer retention is required by law.
                </p>
              </div>

              <div className="glass-card rounded-xl p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">5. Third Parties</h3>
                <p className="mb-3">
                  We use the following infrastructure providers to deliver the Tiresias platform:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Google Cloud Platform (compute, storage, networking)</li>
                  <li>Supabase (managed PostgreSQL and authentication)</li>
                  <li>Cloudflare (CDN, DDoS protection)</li>
                  <li>Stripe (payment processing)</li>
                </ul>
                <p className="mt-4 font-medium text-foreground">
                  We do not sell, rent, or share your personal data with third parties for their marketing purposes. Ever.
                </p>
              </div>

              <div className="glass-card rounded-xl p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">6. GDPR Compliance</h3>
                <p className="mb-3">
                  For users in the European Economic Area, we comply with the General Data Protection Regulation:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li><span className="text-foreground font-medium">Data Protection by Design (Article 25)</span> &mdash; Privacy is embedded into the architecture of the platform, not bolted on as an afterthought.</li>
                  <li><span className="text-foreground font-medium">Right to Erasure</span> &mdash; Request deletion of your personal data at any time.</li>
                  <li><span className="text-foreground font-medium">Data Portability</span> &mdash; Export your data in machine-readable formats upon request.</li>
                </ul>
              </div>

              <div className="glass-card rounded-xl p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">7. CCPA Compliance</h3>
                <p className="mb-3">
                  For California residents:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li><span className="text-foreground font-medium">Do Not Sell</span> &mdash; We do not sell personal information.</li>
                  <li><span className="text-foreground font-medium">Right to Know</span> &mdash; Request disclosure of the categories and specific pieces of personal data we hold.</li>
                  <li><span className="text-foreground font-medium">Right to Delete</span> &mdash; Request deletion of your personal information.</li>
                </ul>
              </div>

              <div className="glass-card rounded-xl p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">8. Contact</h3>
                <p>
                  For privacy-related inquiries, contact us at{" "}
                  <a href="mailto:privacy@saluca.com" className="text-teal-400 hover:text-teal-300 transition-colors underline">
                    privacy@saluca.com
                  </a>.
                </p>
              </div>
            </div>
          </section>

          {/* ============================
              TERMS OF SERVICE
             ============================ */}
          <section id="terms" className="mb-20 scroll-mt-32">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold-500/15">
                <svg className="h-5 w-5 text-gold-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold">Terms of Service</h2>
            </div>
            <p className="text-foreground-subtle text-sm mb-8">Effective: March 2026 &middot; Saluca LLC</p>

            <div className="space-y-8 text-foreground-muted leading-relaxed">
              <div className="glass-card rounded-xl p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">1. Service Description</h3>
                <p>
                  Tiresias is an AI agent security platform providing identity management, authorization, runtime protection, and compliance tooling for autonomous AI agents (&ldquo;the Service&rdquo;). The Service is offered by Saluca LLC (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;the Company&rdquo;) to registered users (&ldquo;you&rdquo; or &ldquo;Customer&rdquo;).
                </p>
              </div>

              <div className="glass-card rounded-xl p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">2. Account Responsibilities</h3>
                <p>
                  You are responsible for maintaining the confidentiality of your account credentials, managing access for users within your organization, and all activities that occur under your account. You agree to notify us immediately of any unauthorized use.
                </p>
              </div>

              <div className="glass-card rounded-xl p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">3. Acceptable Use</h3>
                <p className="mb-3">You agree not to:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Reverse-engineer, decompile, or disassemble any part of the Service.</li>
                  <li>Use the Service to facilitate illegal activities or violate the rights of third parties.</li>
                  <li>Attempt to circumvent security controls, rate limits, or access restrictions.</li>
                  <li>Interfere with or disrupt the integrity or performance of the Service.</li>
                  <li>Share account credentials or capability tokens with unauthorized parties.</li>
                </ul>
              </div>

              <div className="glass-card rounded-xl p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">4. Intellectual Property</h3>
                <p>
                  The Service, including all software, algorithms, designs, and documentation, is the exclusive intellectual property of Saluca LLC. The Company holds <span className="text-foreground font-medium">29 USPTO provisional patents</span> covering core aspects of the platform&apos;s architecture. Nothing in these Terms grants you any rights to our intellectual property beyond the limited license to use the Service.
                </p>
              </div>

              <div className="glass-card rounded-xl p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">5. Limitation of Liability</h3>
                <p>
                  TO THE MAXIMUM EXTENT PERMITTED BY LAW, SALUCA LLC SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUE, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES RESULTING FROM YOUR USE OF THE SERVICE. OUR AGGREGATE LIABILITY SHALL NOT EXCEED THE AMOUNTS PAID BY YOU IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.
                </p>
              </div>

              <div className="glass-card rounded-xl p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">6. Termination</h3>
                <p>
                  Either party may terminate the agreement with 30 days&apos; written notice. We reserve the right to suspend or terminate your access immediately if you violate these Terms. Upon termination, your right to use the Service ceases, and data handling follows the procedures described in our <a href="#privacy" className="text-teal-400 hover:text-teal-300 underline">Privacy Policy</a> and <a href="#dpa" className="text-teal-400 hover:text-teal-300 underline">DPA</a>.
                </p>
              </div>

              <div className="glass-card rounded-xl p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">7. Data Handling</h3>
                <p>
                  Our data handling practices are governed by our <a href="#privacy" className="text-teal-400 hover:text-teal-300 underline">Privacy Policy</a>. For customers requiring a formal data processing agreement, please refer to our <a href="#dpa" className="text-teal-400 hover:text-teal-300 underline">Data Processing Agreement</a> section below.
                </p>
              </div>

              <div className="glass-card rounded-xl p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">8. Governing Law</h3>
                <p>
                  These Terms shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflict of law principles. Any disputes arising under these Terms shall be resolved exclusively in the courts located in Delaware.
                </p>
              </div>
            </div>
          </section>

          {/* ============================
              DATA PROCESSING AGREEMENT
             ============================ */}
          <section id="dpa" className="mb-20 scroll-mt-32">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold-500/15">
                <svg className="h-5 w-5 text-gold-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold">Data Processing Agreement</h2>
            </div>
            <p className="text-foreground-subtle text-sm mb-8">Effective: March 2026 &middot; Saluca LLC</p>

            <div className="space-y-8 text-foreground-muted leading-relaxed">
              <div className="glass-card rounded-xl p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">1. Definitions</h3>
                <ul className="space-y-3">
                  <li><span className="text-foreground font-medium">&ldquo;Controller&rdquo;</span> means the entity that determines the purposes and means of the processing of personal data (the Customer).</li>
                  <li><span className="text-foreground font-medium">&ldquo;Processor&rdquo;</span> means the entity that processes personal data on behalf of the Controller (Saluca LLC / Tiresias).</li>
                  <li><span className="text-foreground font-medium">&ldquo;Sub-processor&rdquo;</span> means any third party engaged by the Processor to assist in processing personal data.</li>
                </ul>
              </div>

              <div className="glass-card rounded-xl p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">2. Scope of Processing</h3>
                <p>
                  The Processor shall process personal data only as necessary to provide the Service as described in the agreement, and only in accordance with the Controller&apos;s documented instructions. Processing activities include identity verification, access control evaluation, audit log generation, and security monitoring.
                </p>
              </div>

              <div className="glass-card rounded-xl p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">3. Sub-processors</h3>
                <p className="mb-3">
                  The following sub-processors are currently engaged:
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 pr-4 text-foreground font-medium">Provider</th>
                        <th className="text-left py-2 pr-4 text-foreground font-medium">Purpose</th>
                        <th className="text-left py-2 text-foreground font-medium">Location</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      <tr><td className="py-2 pr-4">Google Cloud Platform</td><td className="py-2 pr-4">Infrastructure &amp; compute</td><td className="py-2">US / EU</td></tr>
                      <tr><td className="py-2 pr-4">Supabase</td><td className="py-2 pr-4">Database &amp; authentication</td><td className="py-2">US</td></tr>
                      <tr><td className="py-2 pr-4">Cloudflare</td><td className="py-2 pr-4">CDN &amp; DDoS protection</td><td className="py-2">Global</td></tr>
                      <tr><td className="py-2 pr-4">Stripe</td><td className="py-2 pr-4">Payment processing</td><td className="py-2">US</td></tr>
                    </tbody>
                  </table>
                </div>
                <p className="mt-4">
                  The Processor shall notify the Controller at least <span className="text-foreground font-medium">30 days</span> prior to adding or replacing a sub-processor.
                </p>
              </div>

              <div className="glass-card rounded-xl p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">4. Data Location</h3>
                <p>
                  By default, data is processed and stored in the <span className="text-foreground font-medium">United States</span>. Enterprise plan customers may elect EU-based data residency upon request.
                </p>
              </div>

              <div className="glass-card rounded-xl p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">5. Security Measures</h3>
                <p className="mb-3">The Processor implements the following technical and organizational measures:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li><span className="text-foreground font-medium">Encryption</span> &mdash; Data encrypted at rest (AES-256) and in transit (TLS 1.3).</li>
                  <li><span className="text-foreground font-medium">Access controls</span> &mdash; Role-based access, multi-factor authentication, principle of least privilege.</li>
                  <li><span className="text-foreground font-medium">Audit logging</span> &mdash; Immutable, tamper-evident audit trails for all administrative and agent operations.</li>
                  <li><span className="text-foreground font-medium">Incident response</span> &mdash; Documented procedures for security incident detection, containment, and resolution.</li>
                </ul>
              </div>

              <div className="glass-card rounded-xl p-6 border-l-2 border-l-gold-500">
                <h3 className="text-lg font-semibold text-foreground mb-3">6. Breach Notification</h3>
                <p>
                  In the event of a personal data breach, the Processor shall notify the Controller without undue delay and in any case within <span className="text-foreground font-medium">72 hours</span> of becoming aware of the breach. The notification shall include the nature of the breach, categories of data affected, approximate number of records, and measures taken to mitigate.
                </p>
              </div>

              <div className="glass-card rounded-xl p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">7. Data Deletion</h3>
                <p>
                  Upon termination of the service agreement, the Processor shall delete all personal data within <span className="text-foreground font-medium">30 days</span>, unless retention is required by applicable law. The Controller may request a certificate of deletion.
                </p>
              </div>

              <div className="glass-card rounded-xl p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">8. Contact</h3>
                <p>
                  For DPA-related inquiries or to request an executed copy, contact us at{" "}
                  <a href="mailto:legal@saluca.com" className="text-teal-400 hover:text-teal-300 transition-colors underline">
                    legal@saluca.com
                  </a>.
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
