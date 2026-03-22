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
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="max-w-5xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
        {/* Page Heading */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-of-primary mb-4">
            Legal
          </h1>
          <p className="text-of-on-surface-variant max-w-2xl mx-auto">
            Transparency is core to our mission. Review our privacy practices,
            terms of service, and data processing commitments below.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex justify-center gap-2 mb-10 flex-wrap">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                activeSection === section.id
                  ? "bg-of-primary/20 text-of-primary border border-of-primary/40"
                  : "text-of-on-surface-variant hover:text-foreground hover:bg-white/5 border border-transparent"
              }`}
            >
              {section.label}
            </button>
          ))}
        </div>

        {/* ========================= */}
        {/* PRIVACY POLICY            */}
        {/* ========================= */}
        {activeSection === "privacy" && (
          <div className="space-y-8">
            {/* Intro */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <p className="text-of-on-surface-variant leading-relaxed">
                Saluca LLC (&quot;Saluca,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) is committed to protecting the privacy of individuals and organizations that use our products and services. This Privacy Policy explains how we collect, use, store, and share information when you interact with Tiresias, our AI security platform, including our website, dashboard, APIs, documentation, and related services (collectively, the &quot;Service&quot;).
              </p>
              <p className="text-of-on-surface-variant leading-relaxed mt-4">
                This policy applies to all users of the Service, whether you are using our free Community Tier or a paid subscription. By using the Service, you acknowledge that you have read and understood this Privacy Policy.
              </p>
            </div>

            {/* 1. Who We Are */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">1.</span> Who We Are
              </h3>
              <ul className="list-disc pl-6 space-y-2 text-of-on-surface-variant">
                <li>
                  <span className="text-foreground font-medium">Legal Entity:</span> Saluca LLC, a limited liability company organized under the laws of Delaware, United States.
                </li>
                <li>
                  <span className="text-foreground font-medium">Role:</span> We act as the <span className="text-foreground font-medium">data controller</span> for personal data collected through our websites, dashboard, and hosted services. We act as the <span className="text-foreground font-medium">data processor</span> for customer data processed through the Tiresias API on behalf of our customers.
                </li>
                <li>
                  <span className="text-foreground font-medium">Data Protection Officer (DPO):</span>{" "}
                  <a href="mailto:privacy@saluca.com" className="text-of-primary hover:text-of-primary/70 underline">
                    privacy@saluca.com
                  </a>
                </li>
              </ul>
            </div>

            {/* 2. Information We Collect */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">2.</span> Information We Collect
              </h3>

              <h4 className="text-foreground font-medium mt-4 mb-2">2.1 Information You Provide</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-of-outline-variant/15 text-left">
                      <th className="py-2 pr-4 text-foreground font-medium">Category</th>
                      <th className="py-2 pr-4 text-foreground font-medium">Examples</th>
                      <th className="py-2 text-foreground font-medium">Sensitivity Level</th>
                    </tr>
                  </thead>
                  <tbody className="text-of-on-surface-variant">
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Account Information</td>
                      <td className="py-2 pr-4">Name, email address, organization name, role</td>
                      <td className="py-2">L3 &mdash; Confidential</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Authentication Credentials</td>
                      <td className="py-2 pr-4">Hashed passwords, API keys (hashed), OAuth tokens</td>
                      <td className="py-2">L4 &mdash; Restricted</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Billing Information</td>
                      <td className="py-2 pr-4">Payment method (via Stripe), billing address, invoice history</td>
                      <td className="py-2">L3 &mdash; Confidential</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Support Requests</td>
                      <td className="py-2 pr-4">Ticket content, attachments, communication history</td>
                      <td className="py-2">L3 &mdash; Confidential</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Communications</td>
                      <td className="py-2 pr-4">Emails, feedback, survey responses</td>
                      <td className="py-2">L2 &mdash; Internal</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h4 className="text-foreground font-medium mt-6 mb-2">2.2 Information Collected Automatically</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-of-outline-variant/15 text-left">
                      <th className="py-2 pr-4 text-foreground font-medium">Category</th>
                      <th className="py-2 pr-4 text-foreground font-medium">Examples</th>
                      <th className="py-2 text-foreground font-medium">Sensitivity Level</th>
                    </tr>
                  </thead>
                  <tbody className="text-of-on-surface-variant">
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Usage Analytics</td>
                      <td className="py-2 pr-4">API call counts, endpoint usage, error rates, latency metrics</td>
                      <td className="py-2">L2 &mdash; Internal</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Dashboard Session Data</td>
                      <td className="py-2 pr-4">Pages visited, features used, session duration</td>
                      <td className="py-2">L2 &mdash; Internal</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Server Logs</td>
                      <td className="py-2 pr-4">IP addresses, request timestamps, HTTP methods, response codes</td>
                      <td className="py-2">L2 &mdash; Internal</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Cookie Data</td>
                      <td className="py-2 pr-4">Session identifiers, preference settings</td>
                      <td className="py-2">L2 &mdash; Internal</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h4 className="text-foreground font-medium mt-6 mb-2">2.3 What We Do NOT Collect</h4>
              <ul className="list-disc pl-6 space-y-2 text-of-on-surface-variant">
                <li>
                  <span className="text-foreground font-medium">No API request content:</span> We do not inspect, log, or store the content of API requests or responses passing through Tiresias. Your prompts, completions, and model interactions remain yours.
                </li>
                <li>
                  <span className="text-foreground font-medium">No prompts or completions:</span> We never access, read, or retain the actual text of prompts sent to or completions received from AI models.
                </li>
                <li>
                  <span className="text-foreground font-medium">No ML training on customer data:</span> We do not use any customer data, API traffic, or usage patterns to train machine learning models.
                </li>
                <li>
                  <span className="text-foreground font-medium">No selling of data:</span> We do not sell, rent, or trade your personal information or customer data to any third party, under any circumstances.
                </li>
              </ul>
            </div>

            {/* 3. How We Use Your Information */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">3.</span> How We Use Your Information
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-of-outline-variant/15 text-left">
                      <th className="py-2 pr-4 text-foreground font-medium">Purpose</th>
                      <th className="py-2 pr-4 text-foreground font-medium">Legal Basis (GDPR Art. 6)</th>
                      <th className="py-2 text-foreground font-medium">Data Used</th>
                    </tr>
                  </thead>
                  <tbody className="text-of-on-surface-variant">
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Provide the Service</td>
                      <td className="py-2 pr-4">Performance of contract</td>
                      <td className="py-2">Account info, auth credentials, usage analytics</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Process payments</td>
                      <td className="py-2 pr-4">Performance of contract</td>
                      <td className="py-2">Billing information</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Transactional emails</td>
                      <td className="py-2 pr-4">Performance of contract</td>
                      <td className="py-2">Account info</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Support</td>
                      <td className="py-2 pr-4">Performance of contract</td>
                      <td className="py-2">Account info, support requests</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Monitor service health</td>
                      <td className="py-2 pr-4">Legitimate interest</td>
                      <td className="py-2">Usage analytics, server logs</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Improve the Service</td>
                      <td className="py-2 pr-4">Legitimate interest</td>
                      <td className="py-2">Usage analytics, dashboard session data</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Security and fraud prevention</td>
                      <td className="py-2 pr-4">Legitimate interest</td>
                      <td className="py-2">Server logs, usage analytics, auth credentials</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Legal compliance</td>
                      <td className="py-2 pr-4">Legal obligation</td>
                      <td className="py-2">Account info, billing information</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Marketing (opt-in only)</td>
                      <td className="py-2 pr-4">Consent</td>
                      <td className="py-2">Account info, communications</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-of-on-surface-variant mt-4">
                We do not engage in <span className="text-foreground font-medium">profiling</span> or <span className="text-foreground font-medium">behavioral advertising</span>. We do not build user profiles for the purpose of targeted advertising or sell access to behavioral data.
              </p>
            </div>

            {/* 4. Data Residency and Storage */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">4.</span> Data Residency and Storage
              </h3>

              <h4 className="text-foreground font-medium mt-4 mb-2">4.1 Dual-Region Architecture</h4>
              <p className="text-of-on-surface-variant mb-3">
                We operate a dual-region infrastructure to serve customers globally while respecting data sovereignty requirements:
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-of-outline-variant/15 text-left">
                      <th className="py-2 pr-4 text-foreground font-medium">Region</th>
                      <th className="py-2 pr-4 text-foreground font-medium">Location</th>
                      <th className="py-2 text-foreground font-medium">Endpoint</th>
                    </tr>
                  </thead>
                  <tbody className="text-of-on-surface-variant">
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">United States</td>
                      <td className="py-2 pr-4">us-central1</td>
                      <td className="py-2">api.tiresias.network</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">European Union</td>
                      <td className="py-2 pr-4">europe-west1</td>
                      <td className="py-2">api-eu.tiresias.network</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-of-on-surface-variant mt-3">
                Region assignment is determined by country at signup. Users in the EU, EEA, or UK are automatically routed to the EU region. The following countries are routed to the EU region: Austria, Belgium, Bulgaria, Croatia, Cyprus, Czech Republic, Denmark, Estonia, Finland, France, Germany, Greece, Hungary, Iceland, Ireland, Italy, Latvia, Liechtenstein, Lithuania, Luxembourg, Malta, Netherlands, Norway, Poland, Portugal, Romania, Slovakia, Slovenia, Spain, Sweden, Switzerland, and the United Kingdom.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">4.2 Cross-Border Transfers</h4>
              <p className="text-of-on-surface-variant">
                Certain sub-processors may process data outside your designated region. Where data is transferred from the EU/EEA/UK to a country without an adequacy decision, we rely on Standard Contractual Clauses (SCCs) as approved by the European Commission. Current cross-border sub-processors include:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-of-on-surface-variant mt-2">
                <li><span className="text-foreground font-medium">Stripe</span> &mdash; Payment processing (US-based, SCCs in place)</li>
                <li><span className="text-foreground font-medium">Email service provider</span> &mdash; Transactional email delivery (SCCs in place)</li>
              </ul>

              <h4 className="text-foreground font-medium mt-6 mb-2">4.3 Encryption</h4>
              <ul className="list-disc pl-6 space-y-2 text-of-on-surface-variant">
                <li><span className="text-foreground font-medium">In transit:</span> All data transmitted between you and our services is encrypted using TLS 1.2 or higher.</li>
                <li><span className="text-foreground font-medium">At rest:</span> All stored data is encrypted using AES-256-GCM.</li>
                <li><span className="text-foreground font-medium">Bring Your Own Key (BYOK):</span> Enterprise and Platform tier customers may supply their own encryption keys via Google Cloud KMS. When BYOK is enabled, Saluca cannot access the encrypted data without the customer&apos;s key.</li>
              </ul>
            </div>

            {/* 5. Data Retention */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">5.</span> Data Retention
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-of-outline-variant/15 text-left">
                      <th className="py-2 pr-4 text-foreground font-medium">Data Category</th>
                      <th className="py-2 text-foreground font-medium">Retention Period</th>
                    </tr>
                  </thead>
                  <tbody className="text-of-on-surface-variant">
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Account Information</td>
                      <td className="py-2">Duration of account + 30 days after deletion</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Authentication Credentials</td>
                      <td className="py-2">Duration of account (deleted on account closure)</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Billing Information</td>
                      <td className="py-2">7 years (tax and legal compliance)</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Usage Analytics</td>
                      <td className="py-2">Per tier: 30 days (Starter), 90 days (Pro), custom (Enterprise/Platform)</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Dashboard Session Data</td>
                      <td className="py-2">90 days</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Server Logs</td>
                      <td className="py-2">90 days</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Support Requests</td>
                      <td className="py-2">2 years after resolution</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Cookies</td>
                      <td className="py-2">See Section 7</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 6. Data Sharing and Disclosure */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">6.</span> Data Sharing and Disclosure
              </h3>

              <h4 className="text-foreground font-medium mt-4 mb-2">6.1 Sub-Processors</h4>
              <p className="text-of-on-surface-variant mb-3">
                We use a limited number of sub-processors to deliver the Service:
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-of-outline-variant/15 text-left">
                      <th className="py-2 pr-4 text-foreground font-medium">Sub-Processor</th>
                      <th className="py-2 pr-4 text-foreground font-medium">Purpose</th>
                      <th className="py-2 text-foreground font-medium">Data Processed</th>
                    </tr>
                  </thead>
                  <tbody className="text-of-on-surface-variant">
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Google Cloud Platform (GCP)</td>
                      <td className="py-2 pr-4">Infrastructure hosting</td>
                      <td className="py-2">All service data</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Stripe</td>
                      <td className="py-2 pr-4">Payment processing</td>
                      <td className="py-2">Billing information</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Resend</td>
                      <td className="py-2 pr-4">Transactional email</td>
                      <td className="py-2">Email address, name</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-of-on-surface-variant mt-3">
                A complete list of sub-processors is maintained at{" "}
                <a href="https://tiresias.network/legal/sub-processors" className="text-of-primary hover:text-of-primary/70 underline">
                  tiresias.network/legal/sub-processors
                </a>
                . Enterprise customers receive 30 days&apos; notice before any sub-processor changes.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">6.2 Legal and Compliance Disclosures</h4>
              <p className="text-of-on-surface-variant">
                We may disclose information if required by law, regulation, legal process, or governmental request. We will notify you of such requests unless legally prohibited from doing so.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">6.3 Business Transfers</h4>
              <p className="text-of-on-surface-variant">
                In the event of a merger, acquisition, reorganization, or sale of assets, your information may be transferred as part of the transaction. We will notify you via email and/or a prominent notice on our website of any change in ownership or use of your personal information, as well as any choices you may have.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">6.4 No Sale of Data</h4>
              <p className="text-of-on-surface-variant">
                We do not sell personal information as defined under the California Consumer Privacy Act (CCPA), the Virginia Consumer Data Protection Act (VCDPA), or any other applicable privacy law. We do not share personal information for cross-context behavioral advertising.
              </p>
            </div>

            {/* 7. Cookies and Tracking */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">7.</span> Cookies and Tracking
              </h3>

              <h4 className="text-foreground font-medium mt-4 mb-2">7.1 Cookies We Use</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-of-outline-variant/15 text-left">
                      <th className="py-2 pr-4 text-foreground font-medium">Type</th>
                      <th className="py-2 pr-4 text-foreground font-medium">Purpose</th>
                      <th className="py-2 text-foreground font-medium">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="text-of-on-surface-variant">
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Strictly Necessary</td>
                      <td className="py-2 pr-4">Authentication, session management, security</td>
                      <td className="py-2">Session / 30 days</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Functional</td>
                      <td className="py-2 pr-4">User preferences, language, theme</td>
                      <td className="py-2">1 year</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Analytics</td>
                      <td className="py-2 pr-4">Aggregate usage statistics (no personal profiling)</td>
                      <td className="py-2">90 days</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h4 className="text-foreground font-medium mt-6 mb-2">7.2 What We Don&apos;t Use</h4>
              <ul className="list-disc pl-6 space-y-2 text-of-on-surface-variant">
                <li>No advertising cookies or ad network trackers</li>
                <li>No tracking pixels or web beacons</li>
                <li>No social media widgets or embedded trackers</li>
                <li>No browser fingerprinting</li>
              </ul>

              <h4 className="text-foreground font-medium mt-6 mb-2">7.3 Consent</h4>
              <p className="text-of-on-surface-variant">
                Users in the EU, UK, and Canada are presented with a cookie consent banner on first visit. Strictly necessary cookies are set without consent as they are essential for the Service to function. Functional and analytics cookies require affirmative consent.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">7.4 Do Not Track</h4>
              <p className="text-of-on-surface-variant">
                We honor Do Not Track (DNT) signals sent by your browser. When a DNT signal is detected, we disable all non-essential cookies and analytics collection for that session.
              </p>
            </div>

            {/* 8. Your Rights */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">8.</span> Your Rights
              </h3>

              <h4 className="text-foreground font-medium mt-4 mb-2">8.1 GDPR Rights (EU/EEA/UK Residents)</h4>
              <p className="text-of-on-surface-variant mb-3">
                If you are located in the EU, EEA, or UK, you have the following rights under the General Data Protection Regulation:
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-of-outline-variant/15 text-left">
                      <th className="py-2 pr-4 text-foreground font-medium">Right</th>
                      <th className="py-2 text-foreground font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody className="text-of-on-surface-variant">
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Access</td>
                      <td className="py-2">Request a copy of the personal data we hold about you</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Rectification</td>
                      <td className="py-2">Request correction of inaccurate or incomplete personal data</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Erasure</td>
                      <td className="py-2">Request deletion of your personal data (&quot;right to be forgotten&quot;)</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Restriction</td>
                      <td className="py-2">Request restriction of processing of your personal data</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Portability</td>
                      <td className="py-2">Receive your data in a structured, machine-readable format</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Objection</td>
                      <td className="py-2">Object to processing based on legitimate interest or direct marketing</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Withdraw Consent</td>
                      <td className="py-2">Withdraw consent at any time where processing is based on consent</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Lodge Complaint</td>
                      <td className="py-2">File a complaint with your local data protection authority</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-of-on-surface-variant mt-3">
                We will respond to all rights requests within <span className="text-foreground font-medium">30 days</span>. To exercise any of these rights, contact us at{" "}
                <a href="mailto:privacy@saluca.com" className="text-of-primary hover:text-of-primary/70 underline">
                  privacy@saluca.com
                </a>.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">8.2 CCPA/CPRA Rights (California Residents)</h4>
              <p className="text-of-on-surface-variant">
                California residents have the right to know what personal information is collected, disclosed, or sold; the right to delete personal information; the right to opt out of sale or sharing; and the right to non-discrimination for exercising privacy rights. As stated in Section 6.4, we do not sell personal information.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">8.3 Other Jurisdictions</h4>
              <p className="text-of-on-surface-variant">
                We also comply with the Virginia Consumer Data Protection Act (VCDPA), the Colorado Privacy Act (CPA), and the Connecticut Data Privacy Act (CTDPA). Residents of these states have similar rights to access, delete, and correct personal data, and to opt out of targeted advertising and profiling.
              </p>
            </div>

            {/* 9. Security */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">9.</span> Security
              </h3>
              <p className="text-of-on-surface-variant mb-3">
                We implement comprehensive security measures to protect your data:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-of-on-surface-variant">
                <li><span className="text-foreground font-medium">Encryption:</span> TLS 1.2+ in transit, AES-256-GCM at rest, BYOK for Enterprise/Platform tiers.</li>
                <li><span className="text-foreground font-medium">Access Controls:</span> Role-based access control (RBAC) with principle of least privilege across all internal systems.</li>
                <li><span className="text-foreground font-medium">Authentication:</span> Passwords are hashed using bcrypt. API keys are hashed using SHA-512. No plaintext credentials are stored.</li>
                <li><span className="text-foreground font-medium">Per-Tenant Isolation:</span> Customer data is logically isolated at the database level. No cross-tenant data access is possible.</li>
                <li><span className="text-foreground font-medium">Audit Logging:</span> All administrative actions, API key operations, and configuration changes are logged with immutable audit trails.</li>
                <li><span className="text-foreground font-medium">Incident Response:</span> We maintain a documented incident response plan. In the event of a data breach affecting your personal data, we will notify you and the relevant supervisory authority within <span className="text-foreground font-medium">72 hours</span> as required by GDPR Article 33.</li>
                <li><span className="text-foreground font-medium">Vulnerability Disclosure:</span> We maintain a responsible disclosure program. Security researchers can report vulnerabilities to{" "}
                  <a href="mailto:security@saluca.com" className="text-of-primary hover:text-of-primary/70 underline">
                    security@saluca.com
                  </a>.
                </li>
              </ul>
            </div>

            {/* 10. Children's Privacy */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">10.</span> Children&apos;s Privacy
              </h3>
              <p className="text-of-on-surface-variant">
                The Service is not intended for use by individuals under the age of 18. We do not knowingly collect personal information from children under 18. If we become aware that we have collected personal information from a child under 18, we will take steps to delete that information promptly. If you believe that a child under 18 has provided us with personal information, please contact us at{" "}
                <a href="mailto:privacy@saluca.com" className="text-of-primary hover:text-of-primary/70 underline">
                  privacy@saluca.com
                </a>.
              </p>
            </div>

            {/* 11. Third-Party Links */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">11.</span> Third-Party Links
              </h3>
              <p className="text-of-on-surface-variant">
                The Service may contain links to third-party websites or services that are not operated by us. We are not responsible for the privacy practices of these third parties. We encourage you to review the privacy policies of any third-party sites you visit.
              </p>
            </div>

            {/* 12. Changes to This Policy */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">12.</span> Changes to This Policy
              </h3>
              <ul className="list-disc pl-6 space-y-2 text-of-on-surface-variant">
                <li>We will update the &quot;Last Updated&quot; date at the top of this policy when changes are made.</li>
                <li>The current version of this policy is always available at{" "}
                  <a href="https://tiresias.network/privacy" className="text-of-primary hover:text-of-primary/70 underline">
                    tiresias.network/privacy
                  </a>.
                </li>
                <li>For material changes, we will provide at least <span className="text-foreground font-medium">30 days&apos; notice</span> via email to the address associated with your account.</li>
                <li>For customers with a Data Processing Agreement, changes will be handled in accordance with the terms of that agreement.</li>
              </ul>
            </div>

            {/* 13. Contact Us */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">13.</span> Contact Us
              </h3>
              <p className="text-of-on-surface-variant mb-4">
                If you have questions or concerns about this Privacy Policy or our data practices, you can reach us at:
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-of-outline-variant/15 text-left">
                      <th className="py-2 pr-4 text-foreground font-medium">Purpose</th>
                      <th className="py-2 text-foreground font-medium">Contact</th>
                    </tr>
                  </thead>
                  <tbody className="text-of-on-surface-variant">
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Privacy inquiries</td>
                      <td className="py-2">
                        <a href="mailto:privacy@saluca.com" className="text-of-primary hover:text-of-primary/70 underline">privacy@saluca.com</a>
                      </td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Security concerns</td>
                      <td className="py-2">
                        <a href="mailto:security@saluca.com" className="text-of-primary hover:text-of-primary/70 underline">security@saluca.com</a>
                      </td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">General inquiries</td>
                      <td className="py-2">
                        <a href="mailto:info@saluca.com" className="text-of-primary hover:text-of-primary/70 underline">info@saluca.com</a>
                      </td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Data Protection Officer</td>
                      <td className="py-2">
                        <a href="mailto:privacy@saluca.com" className="text-of-primary hover:text-of-primary/70 underline">privacy@saluca.com</a>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-of-on-surface-variant mt-4">
                <span className="text-foreground font-medium">Saluca LLC</span><br />
                A Delaware limited liability company
              </p>
              <p className="text-of-on-surface-variant mt-3">
                EU residents may also lodge a complaint with their local data protection authority. A list of EU DPAs is available at{" "}
                <a href="https://edpb.europa.eu/about-edpb/about-edpb/members_en" className="text-of-primary hover:text-of-primary/70 underline">
                  edpb.europa.eu
                </a>.
              </p>

              <div className="mt-6 pt-4 border-t border-of-outline-variant/15 text-of-outline text-sm">
                <p>Last updated: March 21, 2026</p>
                <p>Version 1.0</p>
              </div>
            </div>
          </div>
        )}

        {/* ========================= */}
        {/* TERMS OF SERVICE           */}
        {/* ========================= */}
        {activeSection === "terms" && (
          <div className="space-y-8">
            {/* Intro */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <p className="text-of-on-surface-variant leading-relaxed">
                These Terms of Service (&quot;Terms&quot;) constitute a legally binding agreement between you (&quot;Customer,&quot; &quot;you,&quot; or &quot;your&quot;) and Saluca LLC, a Delaware limited liability company (&quot;Saluca,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). These Terms govern your access to and use of the Tiresias AI security platform, including our APIs, dashboard, documentation, and related services (collectively, the &quot;Service&quot;).
              </p>
              <p className="text-of-on-surface-variant leading-relaxed mt-4">
                By accessing or using the Service, you agree to be bound by these Terms. If you are using the Service on behalf of an organization, you represent and warrant that you have the authority to bind that organization to these Terms.
              </p>
            </div>

            {/* 1. Definitions */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">1.</span> Definitions
              </h3>
              <ul className="list-disc pl-6 space-y-2 text-of-on-surface-variant">
                <li><span className="text-foreground font-medium">&quot;API Key&quot;</span> means a unique cryptographic token issued to Customer for authentication with the Service.</li>
                <li><span className="text-foreground font-medium">&quot;Authorized Users&quot;</span> means individuals authorized by Customer to access and use the Service under Customer&apos;s account.</li>
                <li><span className="text-foreground font-medium">&quot;Community Tier&quot;</span> means the free, open-source tier of the Service licensed under the Apache License 2.0.</li>
                <li><span className="text-foreground font-medium">&quot;Customer Data&quot;</span> means all data, content, and information submitted to or processed through the Service by Customer or its Authorized Users.</li>
                <li><span className="text-foreground font-medium">&quot;Dashboard&quot;</span> means the web-based management interface for the Service available at tiresias.network.</li>
                <li><span className="text-foreground font-medium">&quot;Documentation&quot;</span> means the technical documentation, user guides, and API references provided by Saluca for the Service.</li>
                <li><span className="text-foreground font-medium">&quot;Paid Tier&quot;</span> means any subscription plan requiring payment, including Starter, Pro, Enterprise, and Platform tiers.</li>
                <li><span className="text-foreground font-medium">&quot;Self-Hosted Instance&quot;</span> means a deployment of the Service operated on Customer&apos;s own infrastructure.</li>
                <li><span className="text-foreground font-medium">&quot;Service&quot;</span> means the Tiresias AI security platform, including all APIs, dashboard, documentation, and related services.</li>
                <li><span className="text-foreground font-medium">&quot;Subscription Period&quot;</span> means the term for which Customer has subscribed to a Paid Tier, whether monthly or annual.</li>
              </ul>
            </div>

            {/* 2. Account Registration and Security */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">2.</span> Account Registration and Security
              </h3>

              <h4 className="text-foreground font-medium mt-4 mb-2">2.1 Registration</h4>
              <p className="text-of-on-surface-variant">
                To access certain features of the Service, you must create an account by providing accurate, current, and complete information. You agree to update your account information promptly if it changes.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">2.2 Account Security</h4>
              <p className="text-of-on-surface-variant">
                You are responsible for maintaining the confidentiality of your account credentials, including your password and API keys. You agree to notify us immediately at{" "}
                <a href="mailto:security@saluca.com" className="text-of-primary hover:text-of-primary/70 underline">security@saluca.com</a>{" "}
                if you become aware of any unauthorized access to or use of your account.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">2.3 API Key Management</h4>
              <p className="text-of-on-surface-variant">
                API keys are issued per account and are subject to the rate limits and permissions of your subscription tier. You must not share API keys across organizations. API keys are hashed using SHA-512 and cannot be recovered once generated; lost keys must be revoked and regenerated.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">2.4 Age Requirement</h4>
              <p className="text-of-on-surface-variant">
                You must be at least 18 years of age to create an account and use the Service. By creating an account, you represent and warrant that you meet this requirement.
              </p>
            </div>

            {/* 3. Service Tiers and Features */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">3.</span> Service Tiers and Features
              </h3>

              <h4 className="text-foreground font-medium mt-4 mb-2">3.1 Community Tier</h4>
              <p className="text-of-on-surface-variant mb-3">
                The Community Tier is available free of charge and is licensed under the Apache License, Version 2.0. The Community Tier includes the core Tiresias engine for self-hosted deployment. Community Tier users are subject to the terms of the Apache 2.0 license in addition to these Terms.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">3.2 Paid Tiers</h4>
              <p className="text-of-on-surface-variant mb-3">
                Paid subscription tiers provide additional features, capacity, and support:
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-of-outline-variant/15 text-left">
                      <th className="py-2 pr-4 text-foreground font-medium">Tier</th>
                      <th className="py-2 pr-4 text-foreground font-medium">Key Features</th>
                      <th className="py-2 text-foreground font-medium">Target</th>
                    </tr>
                  </thead>
                  <tbody className="text-of-on-surface-variant">
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Starter</td>
                      <td className="py-2 pr-4">Hosted API, dashboard, basic analytics, email support</td>
                      <td className="py-2">Individual developers, small teams</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Pro</td>
                      <td className="py-2 pr-4">Advanced analytics, 99.5% SLA, priority support, SSO</td>
                      <td className="py-2">Growing teams, mid-market</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Enterprise</td>
                      <td className="py-2 pr-4">Custom SLA, dedicated support, BYOK, data residency, custom integrations</td>
                      <td className="py-2">Large organizations</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Platform</td>
                      <td className="py-2 pr-4">Multi-tenant management, white-label options, volume pricing, dedicated infrastructure</td>
                      <td className="py-2">Agent platforms, SaaS providers</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h4 className="text-foreground font-medium mt-6 mb-2">3.3 Feature Changes</h4>
              <p className="text-of-on-surface-variant">
                We may modify the features included in each tier from time to time. We will provide at least <span className="text-foreground font-medium">90 days&apos; notice</span> before removing any material feature from a Paid Tier during an active Subscription Period.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">3.4 Fair Use</h4>
              <p className="text-of-on-surface-variant">
                All tiers are subject to fair use limits. We reserve the right to throttle or suspend access if usage significantly exceeds the expected norms for your tier, after providing notice and a reasonable opportunity to upgrade or reduce usage.
              </p>
            </div>

            {/* 4. Fees and Payment */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">4.</span> Fees and Payment
              </h3>

              <h4 className="text-foreground font-medium mt-4 mb-2">4.1 Pricing</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-of-outline-variant/15 text-left">
                      <th className="py-2 pr-4 text-foreground font-medium">Tier</th>
                      <th className="py-2 text-foreground font-medium">Price</th>
                    </tr>
                  </thead>
                  <tbody className="text-of-on-surface-variant">
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Starter</td>
                      <td className="py-2">$49/month</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Pro</td>
                      <td className="py-2">$199/month</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Enterprise</td>
                      <td className="py-2">$999 &ndash; $4,999/month (custom)</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Platform</td>
                      <td className="py-2">$2,499 &ndash; $24,999/month (custom)</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">OEM</td>
                      <td className="py-2">$49,999 &ndash; $199,999/month (custom)</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h4 className="text-foreground font-medium mt-6 mb-2">4.2 No Refunds</h4>
              <p className="text-of-on-surface-variant">
                All fees are non-refundable except as expressly set forth in these Terms or as required by applicable law. Partial-month usage is not prorated.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">4.3 Cancellation</h4>
              <ul className="list-disc pl-6 space-y-2 text-of-on-surface-variant">
                <li><span className="text-foreground font-medium">Monthly subscriptions:</span> You may cancel at any time. Access continues through the end of the current billing period.</li>
                <li><span className="text-foreground font-medium">Annual subscriptions:</span> You may cancel at any time. Access continues through the end of the current annual term. No prorated refunds are provided for the remaining term.</li>
                <li><span className="text-foreground font-medium">Enterprise agreements:</span> Cancellation is governed by the terms of your Enterprise agreement.</li>
              </ul>

              <h4 className="text-foreground font-medium mt-6 mb-2">4.4 Payment Processing</h4>
              <p className="text-of-on-surface-variant">
                All payments are processed through Stripe. By providing payment information, you authorize Saluca to charge your payment method for the applicable fees. Stripe&apos;s terms of service and privacy policy apply to payment processing.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">4.5 Price Changes</h4>
              <p className="text-of-on-surface-variant">
                We may change our pricing at any time. We will provide at least <span className="text-foreground font-medium">30 days&apos; notice</span> before any price increase takes effect. Price changes will not apply to the current Subscription Period.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">4.6 Taxes</h4>
              <p className="text-of-on-surface-variant">
                All fees are exclusive of applicable taxes, levies, or duties. You are responsible for paying all such taxes, except for taxes based on Saluca&apos;s net income.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">4.7 Late Payment</h4>
              <p className="text-of-on-surface-variant">
                If payment is not received within <span className="text-foreground font-medium">14 days</span> of the due date, we may suspend access to the Service and charge interest at a rate of <span className="text-foreground font-medium">1.5% per month</span> (or the maximum rate permitted by law, whichever is lower) on the outstanding balance.
              </p>
            </div>

            {/* 5. Customer Data and Privacy */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">5.</span> Customer Data and Privacy
              </h3>

              <h4 className="text-foreground font-medium mt-4 mb-2">5.1 Data Ownership</h4>
              <p className="text-of-on-surface-variant">
                You retain all rights, title, and interest in and to your Customer Data. Saluca does not claim ownership of any Customer Data.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">5.2 Self-Hosted Data</h4>
              <p className="text-of-on-surface-variant">
                If you deploy a Self-Hosted Instance, your Customer Data remains entirely on your infrastructure. Saluca has no access to data processed by Self-Hosted Instances unless you explicitly grant access for support purposes.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">5.3 Hosted Services Data</h4>
              <p className="text-of-on-surface-variant">
                For hosted (cloud) deployments, Saluca processes Customer Data solely to provide the Service. We do not access the content of API requests or responses. Our data handling practices are described in our{" "}
                <button onClick={() => setActiveSection("privacy")} className="text-of-primary hover:text-of-primary/70 underline">
                  Privacy Policy
                </button>.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">5.4 Data Residency</h4>
              <p className="text-of-on-surface-variant">
                Customer Data is stored in the region selected at account creation: United States (us-central1) or European Union (europe-west1). Enterprise and Platform customers may request specific data residency arrangements.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">5.5 Encryption</h4>
              <ul className="list-disc pl-6 space-y-2 text-of-on-surface-variant">
                <li><span className="text-foreground font-medium">In transit:</span> TLS 1.2 or higher for all communications.</li>
                <li><span className="text-foreground font-medium">At rest:</span> AES-256-GCM encryption for all stored data.</li>
                <li><span className="text-foreground font-medium">BYOK:</span> Enterprise and Platform customers may supply their own encryption keys via Google Cloud KMS.</li>
              </ul>

              <h4 className="text-foreground font-medium mt-6 mb-2">5.6 No Data Mining</h4>
              <p className="text-of-on-surface-variant">
                Saluca does not mine, analyze, or use Customer Data for any purpose other than providing the Service. We do not use Customer Data to train machine learning models or for advertising.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">5.7 Data Processing Agreement</h4>
              <p className="text-of-on-surface-variant">
                For customers requiring a formal data processing agreement, our{" "}
                <button onClick={() => setActiveSection("dpa")} className="text-of-primary hover:text-of-primary/70 underline">
                  Data Processing Agreement
                </button>{" "}
                is available and incorporated into these Terms by reference when executed.
              </p>
            </div>

            {/* 6. Intellectual Property */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">6.</span> Intellectual Property
              </h3>

              <h4 className="text-foreground font-medium mt-4 mb-2">6.1 Saluca IP</h4>
              <p className="text-of-on-surface-variant">
                The Service, including all software, algorithms, designs, documentation, trademarks, and related intellectual property, is owned by Saluca LLC. Saluca&apos;s intellectual property portfolio includes 29 provisional patent applications covering AI security, agent authentication, model routing, and related technologies.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">6.2 License Grant</h4>
              <p className="text-of-on-surface-variant">
                Subject to your compliance with these Terms and payment of applicable fees, Saluca grants you a limited, non-exclusive, non-transferable, revocable license to access and use the Service during the Subscription Period for your internal business purposes.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">6.3 Community License</h4>
              <p className="text-of-on-surface-variant">
                The Community Tier of Tiresias is licensed under the Apache License, Version 2.0. You may use, modify, and distribute the Community Tier in accordance with the Apache 2.0 license terms. The Apache 2.0 license does not extend to proprietary features, hosted services, or Paid Tier components.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">6.4 Feedback</h4>
              <p className="text-of-on-surface-variant">
                If you provide feedback, suggestions, or ideas about the Service (&quot;Feedback&quot;), you grant Saluca a perpetual, irrevocable, worldwide, royalty-free license to use, modify, and incorporate such Feedback into the Service without obligation to you.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">6.5 Restrictions</h4>
              <p className="text-of-on-surface-variant">
                Except as expressly permitted by these Terms or applicable law, you may not: (a) reverse engineer, decompile, or disassemble the Service; (b) modify, adapt, or create derivative works of the Service (except as permitted under the Apache 2.0 license for the Community Tier); (c) sublicense, resell, or redistribute the Service; (d) remove or alter any proprietary notices or labels; or (e) use the Service to develop a competing product.
              </p>
            </div>

            {/* 7. Service Level and Support */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">7.</span> Service Level and Support
              </h3>

              <h4 className="text-foreground font-medium mt-4 mb-2">7.1 Availability</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-of-outline-variant/15 text-left">
                      <th className="py-2 pr-4 text-foreground font-medium">Tier</th>
                      <th className="py-2 text-foreground font-medium">Uptime Commitment</th>
                    </tr>
                  </thead>
                  <tbody className="text-of-on-surface-variant">
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Community</td>
                      <td className="py-2">Best effort (self-hosted)</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Starter</td>
                      <td className="py-2">Best effort</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Pro</td>
                      <td className="py-2">99.5% monthly uptime</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Enterprise</td>
                      <td className="py-2">Per agreement (up to 99.99%)</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Platform</td>
                      <td className="py-2">Per agreement (up to 99.99%)</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h4 className="text-foreground font-medium mt-6 mb-2">7.2 Support</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-of-outline-variant/15 text-left">
                      <th className="py-2 pr-4 text-foreground font-medium">Tier</th>
                      <th className="py-2 text-foreground font-medium">Support Channel</th>
                    </tr>
                  </thead>
                  <tbody className="text-of-on-surface-variant">
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Community</td>
                      <td className="py-2">GitHub Issues, community forum</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Starter</td>
                      <td className="py-2">Email support (business hours)</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Pro</td>
                      <td className="py-2">Priority email support (24-hour response)</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Enterprise</td>
                      <td className="py-2">Dedicated support engineer, Slack channel, phone</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Platform</td>
                      <td className="py-2">Dedicated support team, Slack, phone, on-call</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h4 className="text-foreground font-medium mt-6 mb-2">7.3 Maintenance</h4>
              <p className="text-of-on-surface-variant">
                We will provide at least <span className="text-foreground font-medium">24 hours&apos; notice</span> for scheduled maintenance that may affect Service availability. Emergency maintenance may be performed without prior notice when necessary to protect the Service or its users.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">7.4 SLA Credits</h4>
              <p className="text-of-on-surface-variant">
                If we fail to meet the uptime commitment for your tier, you may request service credits. Credits are calculated based on the duration of the outage and are capped at a maximum of <span className="text-foreground font-medium">30% of your monthly fee</span>. Credits must be requested within 30 days of the incident and are applied to future invoices.
              </p>
            </div>

            {/* 8. Acceptable Use */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">8.</span> Acceptable Use
              </h3>

              <h4 className="text-foreground font-medium mt-4 mb-2">8.1 Compliance</h4>
              <p className="text-of-on-surface-variant">
                You agree to use the Service in compliance with all applicable laws, regulations, and these Terms.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">8.2 Prohibited Uses</h4>
              <p className="text-of-on-surface-variant mb-2">
                You may not use the Service to:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-of-on-surface-variant">
                <li>Violate any applicable law, regulation, or third-party rights</li>
                <li>Transmit malware, viruses, or other harmful code</li>
                <li>Attempt to gain unauthorized access to the Service, other accounts, or related systems</li>
                <li>Interfere with or disrupt the Service or its infrastructure</li>
                <li>Circumvent rate limits, authentication controls, or security measures</li>
                <li>Scrape, crawl, or harvest data from the Service without authorization</li>
                <li>Use the Service for competitive analysis or to build a competing product</li>
                <li>Resell or redistribute access to the Service without a Platform or OEM agreement</li>
              </ul>

              <h4 className="text-foreground font-medium mt-6 mb-2">8.3 Enforcement</h4>
              <p className="text-of-on-surface-variant">
                We reserve the right to investigate and take appropriate action against any violation of this section, including suspending or terminating your access to the Service, removing content, and reporting to law enforcement.
              </p>
            </div>

            {/* 9. Confidentiality */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">9.</span> Confidentiality
              </h3>

              <h4 className="text-foreground font-medium mt-4 mb-2">9.1 Definition</h4>
              <p className="text-of-on-surface-variant">
                &quot;Confidential Information&quot; means any non-public information disclosed by one party to the other that is designated as confidential or that a reasonable person would understand to be confidential given the nature of the information and the circumstances of disclosure. Confidential Information includes, but is not limited to, Customer Data, API keys, pricing terms, technical specifications, and business plans.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">9.2 Obligations</h4>
              <p className="text-of-on-surface-variant">
                Each party agrees to: (a) protect the other party&apos;s Confidential Information using at least the same degree of care it uses to protect its own confidential information, but no less than reasonable care; (b) use the other party&apos;s Confidential Information only for purposes of fulfilling its obligations under these Terms; and (c) not disclose the other party&apos;s Confidential Information to any third party except as necessary to perform under these Terms, provided that such third party is bound by confidentiality obligations at least as protective as those herein.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">9.3 Compelled Disclosure</h4>
              <p className="text-of-on-surface-variant">
                A party may disclose Confidential Information if required by law, regulation, or court order, provided that the disclosing party gives the other party prompt written notice (to the extent legally permissible) and cooperates with any effort to obtain protective treatment of the information.
              </p>
            </div>

            {/* 10. Warranties and Disclaimers */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">10.</span> Warranties and Disclaimers
              </h3>

              <h4 className="text-foreground font-medium mt-4 mb-2">10.1 Mutual Warranties</h4>
              <p className="text-of-on-surface-variant">
                Each party represents and warrants that: (a) it has the legal power and authority to enter into these Terms; (b) these Terms are duly authorized and binding; and (c) its performance under these Terms will not conflict with any other agreement to which it is a party.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">10.2 Service Warranty</h4>
              <p className="text-of-on-surface-variant">
                Saluca warrants that the Paid Tier Service will perform materially in accordance with the applicable Documentation during the Subscription Period. If the Service fails to conform to this warranty, Saluca will, at its option, correct the non-conformity or provide a pro-rata refund of prepaid fees for the affected period.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">10.3 DISCLAIMER</h4>
              <p className="text-of-on-surface-variant uppercase">
                EXCEPT AS EXPRESSLY SET FORTH IN THIS SECTION 10, THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE, INCLUDING WITHOUT LIMITATION WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. SALUCA DOES NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR COMPLETELY SECURE.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">10.4 Community Tier</h4>
              <p className="text-of-on-surface-variant">
                THE COMMUNITY TIER IS PROVIDED &quot;AS IS&quot; WITHOUT ANY WARRANTY WHATSOEVER. THE COMMUNITY TIER IS LICENSED UNDER THE APACHE LICENSE 2.0 AND IS SUBJECT TO THE DISCLAIMERS AND LIMITATIONS SET FORTH IN THAT LICENSE.
              </p>
            </div>

            {/* 11. Limitation of Liability */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">11.</span> Limitation of Liability
              </h3>

              <h4 className="text-foreground font-medium mt-4 mb-2">11.1 LIABILITY CAP</h4>
              <p className="text-of-on-surface-variant uppercase">
                TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE TOTAL AGGREGATE LIABILITY OF EITHER PARTY ARISING OUT OF OR RELATED TO THESE TERMS SHALL NOT EXCEED THE AMOUNTS PAID OR PAYABLE BY CUSTOMER TO SALUCA DURING THE TWELVE (12) MONTHS IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO LIABILITY, OR ONE HUNDRED U.S. DOLLARS ($100), WHICHEVER IS GREATER.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">11.2 EXCLUSION OF DAMAGES</h4>
              <p className="text-of-on-surface-variant uppercase">
                IN NO EVENT SHALL EITHER PARTY BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES, INCLUDING WITHOUT LIMITATION DAMAGES FOR LOSS OF PROFITS, GOODWILL, USE, DATA, OR OTHER INTANGIBLE LOSSES, EVEN IF THE PARTY HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">11.3 Exceptions</h4>
              <p className="text-of-on-surface-variant">
                The limitations in Sections 11.1 and 11.2 do not apply to: (a) liability arising from a party&apos;s breach of its data protection or confidentiality obligations; (b) liability arising from a party&apos;s indemnification obligations under Section 12; or (c) liability that cannot be limited under applicable law.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">11.4 Basis of Bargain</h4>
              <p className="text-of-on-surface-variant">
                The limitations of liability in this section reflect a reasonable allocation of risk between the parties and form an essential basis of the bargain between the parties. The Service would not be provided without these limitations.
              </p>
            </div>

            {/* 12. Indemnification */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">12.</span> Indemnification
              </h3>

              <h4 className="text-foreground font-medium mt-4 mb-2">12.1 Indemnification by Saluca</h4>
              <p className="text-of-on-surface-variant">
                Saluca shall defend, indemnify, and hold harmless Customer from and against any third-party claims, damages, losses, and expenses (including reasonable attorneys&apos; fees) arising from allegations that the Service infringes a third party&apos;s intellectual property rights, provided that: (a) Customer promptly notifies Saluca of the claim; (b) Saluca has sole control of the defense and settlement; and (c) Customer provides reasonable cooperation.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">12.2 Indemnification by Customer</h4>
              <p className="text-of-on-surface-variant">
                Customer shall defend, indemnify, and hold harmless Saluca from and against any third-party claims, damages, losses, and expenses (including reasonable attorneys&apos; fees) arising from: (a) Customer&apos;s use of the Service in violation of these Terms or applicable law; (b) Customer Data that infringes a third party&apos;s rights; or (c) Customer&apos;s breach of Section 8 (Acceptable Use).
              </p>
            </div>

            {/* 13. Term and Termination */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">13.</span> Term and Termination
              </h3>

              <h4 className="text-foreground font-medium mt-4 mb-2">13.1 Term</h4>
              <p className="text-of-on-surface-variant">
                These Terms are effective as of the date you first access or use the Service and continue until terminated in accordance with this section.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">13.2 Termination by Customer</h4>
              <p className="text-of-on-surface-variant">
                You may terminate these Terms at any time by closing your account through the Dashboard or by contacting{" "}
                <a href="mailto:support@saluca.com" className="text-of-primary hover:text-of-primary/70 underline">support@saluca.com</a>.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">13.3 Termination by Saluca</h4>
              <p className="text-of-on-surface-variant">
                Saluca may terminate these Terms: (a) immediately upon written notice if you breach Section 8 (Acceptable Use); (b) upon 30 days&apos; written notice if you breach any other provision of these Terms and fail to cure such breach within the notice period; or (c) immediately if you become insolvent or file for bankruptcy.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">13.4 Effect of Termination</h4>
              <p className="text-of-on-surface-variant">
                Upon termination: (a) your right to access and use the Service immediately ceases; (b) all outstanding fees become immediately due and payable; and (c) each party shall return or destroy the other party&apos;s Confidential Information.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">13.5 Data Export</h4>
              <p className="text-of-on-surface-variant">
                Following termination or expiration, you will have <span className="text-foreground font-medium">30 days</span> to export your Customer Data. After the 30-day period, Saluca may delete all Customer Data in accordance with our data retention policies.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">13.6 Survival</h4>
              <p className="text-of-on-surface-variant">
                Sections 1, 5, 6, 9, 10, 11, 12, 14, and 15 shall survive any termination or expiration of these Terms.
              </p>
            </div>

            {/* 14. Dispute Resolution */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">14.</span> Dispute Resolution
              </h3>

              <h4 className="text-foreground font-medium mt-4 mb-2">14.1 Governing Law</h4>
              <p className="text-of-on-surface-variant">
                These Terms shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflict of laws principles.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">14.2 Informal Resolution</h4>
              <p className="text-of-on-surface-variant">
                Before initiating any formal dispute resolution, the parties agree to attempt to resolve any dispute informally by contacting each other in writing and negotiating in good faith for a period of at least <span className="text-foreground font-medium">30 days</span>.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">14.3 Arbitration</h4>
              <p className="text-of-on-surface-variant">
                If the parties are unable to resolve a dispute informally, the dispute shall be resolved by binding arbitration administered by the American Arbitration Association (AAA) under its Commercial Arbitration Rules. The arbitration shall be conducted by a single arbitrator and shall take place in Delaware or, at the election of either party, remotely via videoconference.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">14.4 Class Action Waiver</h4>
              <p className="text-of-on-surface-variant uppercase">
                YOU AND SALUCA AGREE THAT EACH PARTY MAY BRING CLAIMS AGAINST THE OTHER ONLY IN YOUR OR ITS INDIVIDUAL CAPACITY, AND NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY PURPORTED CLASS OR REPRESENTATIVE PROCEEDING.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">14.5 Injunctive Relief</h4>
              <p className="text-of-on-surface-variant">
                Notwithstanding the foregoing, either party may seek injunctive or other equitable relief in any court of competent jurisdiction to prevent the actual or threatened infringement, misappropriation, or violation of a party&apos;s intellectual property rights or Confidential Information.
              </p>
            </div>

            {/* 15. General Provisions */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">15.</span> General Provisions
              </h3>

              <h4 className="text-foreground font-medium mt-4 mb-2">15.1 Entire Agreement</h4>
              <p className="text-of-on-surface-variant">
                These Terms, together with any applicable Order Form, Data Processing Agreement, and Service Level Agreement, constitute the entire agreement between the parties and supersede all prior and contemporaneous agreements, proposals, and representations.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">15.2 Amendments</h4>
              <p className="text-of-on-surface-variant">
                Saluca may amend these Terms from time to time. We will provide at least <span className="text-foreground font-medium">30 days&apos; notice</span> of material changes via email or through the Dashboard. Continued use of the Service after the effective date of any amendment constitutes acceptance of the amended Terms.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">15.3 Assignment</h4>
              <p className="text-of-on-surface-variant">
                Neither party may assign these Terms without the other party&apos;s prior written consent, except that either party may assign these Terms in connection with a merger, acquisition, or sale of all or substantially all of its assets.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">15.4 Severability</h4>
              <p className="text-of-on-surface-variant">
                If any provision of these Terms is held to be invalid or unenforceable, the remaining provisions shall continue in full force and effect. The invalid or unenforceable provision shall be modified to the minimum extent necessary to make it valid and enforceable.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">15.5 Waiver</h4>
              <p className="text-of-on-surface-variant">
                The failure of either party to enforce any right or provision of these Terms shall not constitute a waiver of such right or provision.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">15.6 Notices</h4>
              <p className="text-of-on-surface-variant">
                All legal notices under these Terms must be in writing and sent to{" "}
                <a href="mailto:legal@saluca.com" className="text-of-primary hover:text-of-primary/70 underline">legal@saluca.com</a>{" "}
                or to the email address associated with your account. Notices are deemed received upon delivery for email.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">15.7 Force Majeure</h4>
              <p className="text-of-on-surface-variant">
                Neither party shall be liable for any delay or failure to perform its obligations (other than payment obligations) due to causes beyond its reasonable control, including but not limited to acts of God, war, terrorism, natural disasters, pandemics, government actions, labor disputes, or internet or utility failures.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">15.8 Independent Contractors</h4>
              <p className="text-of-on-surface-variant">
                The parties are independent contractors. Nothing in these Terms shall be construed to create a partnership, joint venture, agency, or employment relationship between the parties.
              </p>

              <h4 className="text-foreground font-medium mt-6 mb-2">15.9 Export Compliance</h4>
              <p className="text-of-on-surface-variant">
                You agree to comply with all applicable export and import control laws and regulations, including U.S. Export Administration Regulations (EAR) and sanctions programs administered by the Office of Foreign Assets Control (OFAC).
              </p>
            </div>

            {/* 16. Contact Information */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">16.</span> Contact Information
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-of-outline-variant/15 text-left">
                      <th className="py-2 pr-4 text-foreground font-medium">Purpose</th>
                      <th className="py-2 text-foreground font-medium">Contact</th>
                    </tr>
                  </thead>
                  <tbody className="text-of-on-surface-variant">
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">General inquiries</td>
                      <td className="py-2">
                        <a href="mailto:info@saluca.com" className="text-of-primary hover:text-of-primary/70 underline">info@saluca.com</a>
                      </td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Technical support</td>
                      <td className="py-2">
                        <a href="mailto:support@saluca.com" className="text-of-primary hover:text-of-primary/70 underline">support@saluca.com</a>
                      </td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Security</td>
                      <td className="py-2">
                        <a href="mailto:security@saluca.com" className="text-of-primary hover:text-of-primary/70 underline">security@saluca.com</a>
                      </td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Privacy</td>
                      <td className="py-2">
                        <a href="mailto:privacy@saluca.com" className="text-of-primary hover:text-of-primary/70 underline">privacy@saluca.com</a>
                      </td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Legal</td>
                      <td className="py-2">
                        <a href="mailto:legal@saluca.com" className="text-of-primary hover:text-of-primary/70 underline">legal@saluca.com</a>
                      </td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Enterprise sales</td>
                      <td className="py-2">
                        <a href="mailto:enterprise@saluca.com" className="text-of-primary hover:text-of-primary/70 underline">enterprise@saluca.com</a>
                      </td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Billing</td>
                      <td className="py-2">
                        <a href="mailto:billing@saluca.com" className="text-of-primary hover:text-of-primary/70 underline">billing@saluca.com</a>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-of-on-surface-variant mt-4">
                <span className="text-foreground font-medium">Saluca LLC</span><br />
                A Delaware limited liability company
              </p>

              <div className="mt-6 pt-4 border-t border-of-outline-variant/15 text-of-outline text-sm">
                <p>Effective date: March 21, 2026</p>
                <p>Last updated: March 21, 2026</p>
                <p>Version 1.0</p>
              </div>
            </div>
          </div>
        )}

        {/* ========================= */}
        {/* DATA PROCESSING AGREEMENT  */}
        {/* ========================= */}
        {activeSection === "dpa" && (
          <div className="space-y-8">
            {/* Intro */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <p className="text-of-on-surface-variant leading-relaxed">
                This Data Processing Agreement (&quot;DPA&quot;) forms part of the Terms of Service (&quot;Agreement&quot;) between Saluca LLC (&quot;Processor&quot;) and the customer entity identified in the applicable Order Form (&quot;Controller&quot;). This DPA applies to the extent that Saluca processes Personal Data on behalf of the Controller in connection with the Tiresias platform.
              </p>
            </div>

            {/* 1. Definitions */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">1.</span> Definitions
              </h3>
              <ul className="list-disc pl-6 space-y-2 text-of-on-surface-variant">
                <li><span className="text-foreground font-medium">&quot;Personal Data&quot;</span> means any information relating to an identified or identifiable natural person, as defined under applicable Data Protection Laws.</li>
                <li><span className="text-foreground font-medium">&quot;Data Protection Laws&quot;</span> means all applicable laws relating to data protection and privacy, including GDPR (EU 2016/679), UK GDPR, CCPA/CPRA, and any other applicable jurisdiction-specific data protection legislation.</li>
                <li><span className="text-foreground font-medium">&quot;Sub-Processor&quot;</span> means any third party engaged by the Processor to process Personal Data on behalf of the Controller.</li>
                <li><span className="text-foreground font-medium">&quot;Data Subject&quot;</span> means the identified or identifiable natural person to whom Personal Data relates.</li>
                <li><span className="text-foreground font-medium">&quot;Processing&quot;</span> means any operation performed on Personal Data, including collection, recording, organization, structuring, storage, adaptation, retrieval, consultation, use, disclosure, erasure, or destruction.</li>
                <li><span className="text-foreground font-medium">&quot;Security Incident&quot;</span> means any accidental or unlawful destruction, loss, alteration, unauthorized disclosure of, or access to Personal Data.</li>
              </ul>
            </div>

            {/* 2. Scope and Roles */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">2.</span> Scope and Roles
              </h3>
              <ul className="list-disc pl-6 space-y-2 text-of-on-surface-variant">
                <li><span className="text-foreground font-medium">Controller:</span> The Customer determines the purposes and means of Processing Personal Data.</li>
                <li><span className="text-foreground font-medium">Processor:</span> Saluca processes Personal Data only on documented instructions from the Controller, except where required by applicable law.</li>
                <li><span className="text-foreground font-medium">Scope:</span> This DPA applies to all Personal Data processed by Saluca in connection with the Tiresias platform, including account data, authentication metadata, and usage analytics.</li>
              </ul>
            </div>

            {/* 3. Processing Instructions */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">3.</span> Processing Instructions
              </h3>
              <ul className="list-disc pl-6 space-y-2 text-of-on-surface-variant">
                <li>Saluca shall process Personal Data only in accordance with the Controller&apos;s documented instructions, as described in the Agreement and this DPA.</li>
                <li>If Saluca believes an instruction infringes Data Protection Laws, it shall promptly notify the Controller.</li>
                <li>Saluca shall not process Personal Data for any purpose other than as necessary to provide the Service, unless required by applicable law (in which case, Saluca shall inform the Controller prior to processing, unless legally prohibited).</li>
              </ul>
            </div>

            {/* 4. Confidentiality */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">4.</span> Confidentiality
              </h3>
              <p className="text-of-on-surface-variant">
                Saluca shall ensure that all personnel authorized to process Personal Data are bound by appropriate confidentiality obligations (whether contractual or statutory). Access to Personal Data is restricted to personnel who require such access to perform their duties in connection with the Service.
              </p>
            </div>

            {/* 5. Security Measures */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">5.</span> Security Measures
              </h3>
              <p className="text-of-on-surface-variant mb-3">
                Saluca implements and maintains appropriate technical and organizational security measures, including:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-of-on-surface-variant">
                <li><span className="text-foreground font-medium">Encryption in transit:</span> TLS 1.2+ for all data transmissions</li>
                <li><span className="text-foreground font-medium">Encryption at rest:</span> AES-256-GCM for all stored data</li>
                <li><span className="text-foreground font-medium">Access controls:</span> Role-based access control (RBAC) with principle of least privilege</li>
                <li><span className="text-foreground font-medium">Authentication:</span> Passwords hashed with bcrypt, API keys hashed with SHA-512</li>
                <li><span className="text-foreground font-medium">Per-tenant isolation:</span> Logical data separation at the database level</li>
                <li><span className="text-foreground font-medium">Audit logging:</span> Immutable logs of all administrative actions</li>
                <li><span className="text-foreground font-medium">BYOK:</span> Customer-managed encryption keys via Google Cloud KMS (Enterprise/Platform tiers)</li>
                <li><span className="text-foreground font-medium">Vulnerability management:</span> Regular security assessments and patching</li>
              </ul>
            </div>

            {/* 6. Sub-Processing */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">6.</span> Sub-Processing
              </h3>
              <ul className="list-disc pl-6 space-y-2 text-of-on-surface-variant">
                <li>The Controller provides general authorization for Saluca to engage Sub-Processors as listed at{" "}
                  <a href="https://tiresias.network/legal/sub-processors" className="text-of-primary hover:text-of-primary/70 underline">
                    tiresias.network/legal/sub-processors
                  </a>.
                </li>
                <li>Saluca shall notify the Controller at least <span className="text-foreground font-medium">30 days</span> before engaging a new Sub-Processor or replacing an existing one.</li>
                <li>The Controller may object to a new Sub-Processor within 14 days of notification. If the objection cannot be reasonably resolved, the Controller may terminate the affected Service.</li>
                <li>Saluca shall impose data protection obligations on Sub-Processors that are no less protective than those in this DPA.</li>
                <li>Saluca remains fully liable for the acts and omissions of its Sub-Processors.</li>
              </ul>

              <h4 className="text-foreground font-medium mt-4 mb-2">Current Sub-Processors</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-of-outline-variant/15 text-left">
                      <th className="py-2 pr-4 text-foreground font-medium">Sub-Processor</th>
                      <th className="py-2 pr-4 text-foreground font-medium">Purpose</th>
                      <th className="py-2 text-foreground font-medium">Location</th>
                    </tr>
                  </thead>
                  <tbody className="text-of-on-surface-variant">
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Google Cloud Platform</td>
                      <td className="py-2 pr-4">Infrastructure hosting</td>
                      <td className="py-2">US (us-central1) / EU (europe-west1)</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Stripe</td>
                      <td className="py-2 pr-4">Payment processing</td>
                      <td className="py-2">United States</td>
                    </tr>
                    <tr className="border-b border-of-outline-variant/15">
                      <td className="py-2 pr-4">Resend</td>
                      <td className="py-2 pr-4">Transactional email</td>
                      <td className="py-2">United States</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 7. Data Subject Rights */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">7.</span> Data Subject Rights
              </h3>
              <ul className="list-disc pl-6 space-y-2 text-of-on-surface-variant">
                <li>Saluca shall assist the Controller in responding to Data Subject requests to exercise their rights under Data Protection Laws (access, rectification, erasure, restriction, portability, objection).</li>
                <li>If Saluca receives a Data Subject request directly, it shall promptly redirect the request to the Controller, unless legally required to respond directly.</li>
                <li>Saluca shall provide commercially reasonable assistance and information necessary for the Controller to fulfill its obligations under Data Protection Laws.</li>
              </ul>
            </div>

            {/* 8. Security Incident Response */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">8.</span> Security Incident Response
              </h3>
              <ul className="list-disc pl-6 space-y-2 text-of-on-surface-variant">
                <li>Saluca shall notify the Controller of any Security Incident without undue delay, and in any event within <span className="text-foreground font-medium">72 hours</span> of becoming aware of the incident.</li>
                <li>
                  The notification shall include, to the extent available:
                  <ul className="list-disc pl-6 space-y-1 mt-2">
                    <li>The nature of the Security Incident, including categories and approximate number of Data Subjects affected</li>
                    <li>The likely consequences of the incident</li>
                    <li>The measures taken or proposed to address the incident</li>
                    <li>The name and contact details of Saluca&apos;s data protection contact</li>
                  </ul>
                </li>
                <li>Saluca shall cooperate with the Controller and take reasonable steps to mitigate the effects of the Security Incident.</li>
                <li>Notification of a Security Incident shall not be construed as an admission of fault or liability.</li>
              </ul>
            </div>

            {/* 9. Data Transfers */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">9.</span> Data Transfers
              </h3>
              <ul className="list-disc pl-6 space-y-2 text-of-on-surface-variant">
                <li>Saluca shall not transfer Personal Data outside the Controller&apos;s designated region without appropriate safeguards.</li>
                <li>For transfers from the EU/EEA/UK to countries without an adequacy decision, Saluca relies on Standard Contractual Clauses (SCCs) as approved by the European Commission (Decision 2021/914).</li>
                <li>For UK transfers, the UK International Data Transfer Addendum applies.</li>
                <li>The Controller may request copies of the applicable transfer mechanisms upon written request.</li>
              </ul>
            </div>

            {/* 10. Data Protection Impact Assessments */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">10.</span> Data Protection Impact Assessments
              </h3>
              <p className="text-of-on-surface-variant">
                Saluca shall provide reasonable assistance to the Controller in conducting Data Protection Impact Assessments (DPIAs) and prior consultations with supervisory authorities, where required under Data Protection Laws, taking into account the nature of the Processing and the information available to Saluca.
              </p>
            </div>

            {/* 11. Audit Rights */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">11.</span> Audit Rights
              </h3>
              <ul className="list-disc pl-6 space-y-2 text-of-on-surface-variant">
                <li>Saluca shall make available to the Controller all information necessary to demonstrate compliance with this DPA and applicable Data Protection Laws.</li>
                <li>The Controller (or its designated auditor) may conduct audits of Saluca&apos;s data processing activities, subject to reasonable advance notice (at least 30 days) and during normal business hours.</li>
                <li>Audits shall not unreasonably interfere with Saluca&apos;s business operations. The Controller shall bear the costs of any audit.</li>
                <li>Saluca may satisfy audit requirements by providing relevant certifications, audit reports (e.g., SOC 2 Type II), or other evidence of compliance.</li>
              </ul>
            </div>

            {/* 12. Data Retention and Deletion */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">12.</span> Data Retention and Deletion
              </h3>
              <ul className="list-disc pl-6 space-y-2 text-of-on-surface-variant">
                <li>Upon termination of the Agreement, Saluca shall, at the Controller&apos;s election, return or delete all Personal Data within <span className="text-foreground font-medium">30 days</span>, unless retention is required by applicable law.</li>
                <li>The Controller may request data export in standard formats (JSON, CSV) prior to deletion.</li>
                <li>Saluca shall certify the deletion of Personal Data upon the Controller&apos;s written request.</li>
                <li>Backup copies shall be deleted in accordance with Saluca&apos;s standard backup rotation schedule, not to exceed 90 days.</li>
              </ul>
            </div>

            {/* 13. Liability */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">13.</span> Liability
              </h3>
              <p className="text-of-on-surface-variant">
                Each party&apos;s liability under this DPA is subject to the limitations of liability set forth in the Agreement, except that such limitations shall not apply to the extent prohibited by applicable Data Protection Laws.
              </p>
            </div>

            {/* 14. Term */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">14.</span> Term
              </h3>
              <p className="text-of-on-surface-variant">
                This DPA shall remain in effect for the duration of the Agreement and shall automatically terminate upon termination of the Agreement, subject to the data deletion obligations in Section 12.
              </p>
            </div>

            {/* 15. Conflict */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">15.</span> Conflict
              </h3>
              <p className="text-of-on-surface-variant">
                In the event of any conflict between this DPA and the Agreement, this DPA shall prevail with respect to the Processing of Personal Data. In the event of any conflict between this DPA and applicable Data Protection Laws, the Data Protection Laws shall prevail.
              </p>
            </div>

            {/* 16. Contact */}
            <div className="bg-of-surface-container border border-of-outline-variant/15 rounded-xl rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-3">
                <span className="text-of-primary">16.</span> Contact
              </h3>
              <p className="text-of-on-surface-variant mb-4">
                For questions about this DPA or data processing practices:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-of-on-surface-variant">
                <li>
                  <span className="text-foreground font-medium">Privacy and DPA inquiries:</span>{" "}
                  <a href="mailto:privacy@saluca.com" className="text-of-primary hover:text-of-primary/70 underline">privacy@saluca.com</a>
                </li>
                <li>
                  <span className="text-foreground font-medium">Security incidents:</span>{" "}
                  <a href="mailto:security@saluca.com" className="text-of-primary hover:text-of-primary/70 underline">security@saluca.com</a>
                </li>
                <li>
                  <span className="text-foreground font-medium">Legal:</span>{" "}
                  <a href="mailto:legal@saluca.com" className="text-of-primary hover:text-of-primary/70 underline">legal@saluca.com</a>
                </li>
              </ul>
              <p className="text-of-on-surface-variant mt-4">
                <span className="text-foreground font-medium">Saluca LLC</span><br />
                A Delaware limited liability company
              </p>

              <div className="mt-6 pt-4 border-t border-of-outline-variant/15 text-of-outline text-sm">
                <p>Effective date: March 21, 2026</p>
                <p>Last updated: March 21, 2026</p>
                <p>Version 1.0</p>
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}