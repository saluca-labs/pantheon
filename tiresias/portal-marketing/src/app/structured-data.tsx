export function StructuredData() {
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Saluca LLC",
    url: "https://www.saluca.com",
    logo: "https://tiresias.network/tiresias-icon.png",
    sameAs: [
      "https://github.com/cristianxruvalcaba-coder/tiresias-core",
    ],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "sales",
      url: "https://tiresias.network/company#contact",
    },
  };

  const softwareSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Tiresias",
    applicationCategory: "SecurityApplication",
    operatingSystem: "Cloud, Linux, Kubernetes",
    description:
      "Zero-knowledge AI agent security platform. Runtime behavioral anomaly detection, cryptographic agent identity, zero-trust policy enforcement, and automated quarantine for enterprise AI agent fleets.",
    url: "https://tiresias.network",
    author: {
      "@type": "Organization",
      name: "Saluca LLC",
    },
    offers: [
      {
        "@type": "Offer",
        name: "Open Tier",
        price: "0",
        priceCurrency: "USD",
        description: "25 managed agents, 7-day retention — free for individuals, students, and startups under $1M ARR",
      },
      {
        "@type": "Offer",
        name: "Enterprise",
        price: "",
        priceCurrency: "USD",
        description: "Custom enterprise plans with dedicated support",
        url: "https://tiresias.network/pricing",
      },
    ],
    featureList: [
      "Cryptographic agent identity (SoulAuth)",
      "Zero-trust policy enforcement",
      "18 behavioral anomaly types with per-agent baselines",
      "60 threat patterns scored in 0.39ms",
      "Sigma-compatible detection rules",
      "SIEM integration (Splunk, Elastic, Microsoft Sentinel)",
      "Prompt injection detection",
      "Context window exfiltration detection",
      "Privilege escalation detection via tool calls",
      "Seven graduated automated response actions",
      "Multi-tenancy with row-level security",
      "Policy-as-code with YAML declarations",
      "GDPR Article 25 compliance by design",
      "Zero-knowledge architecture",
    ],
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "What is Tiresias?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Tiresias is a runtime security platform for AI agents. It provides cryptographic agent identity, zero-trust authorization, behavioral anomaly detection, and automated quarantine — all using a zero-knowledge architecture that never accesses your agent payloads.",
        },
      },
      {
        "@type": "Question",
        name: "How does Tiresias detect threats without seeing data?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Tiresias uses a zero-knowledge architecture. It evaluates policies and detects anomalies using only metadata — request patterns, timing, tool call sequences, and behavioral baselines. Agent payloads never leave your infrastructure. Cryptographic proofs replace data inspection.",
        },
      },
      {
        "@type": "Question",
        name: "What types of threats does Tiresias detect?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Tiresias detects 18 behavioral anomaly types including prompt injection, context window exfiltration, privilege escalation via tool calls, unusual agent-to-agent communication patterns, and policy violations. It scores 60 threat patterns in an average of 0.39 milliseconds.",
        },
      },
      {
        "@type": "Question",
        name: "Does Tiresias integrate with existing SIEM platforms?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. Tiresias provides native connectors for Splunk, Elastic, and Microsoft Sentinel. It outputs Sigma-compatible detection rules so you can use your existing SOC workflow and detection engineering pipeline.",
        },
      },
      {
        "@type": "Question",
        name: "What is SoulAuth?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "SoulAuth is the cryptographic agent identity system in Tiresias. Every AI agent gets a hardware-bound, non-extractable soulkey identity with zero-trust policy evaluation on every request. No standing permissions — all authorization is just-in-time.",
        },
      },
    ],
  };

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Tiresias",
    url: "https://tiresias.network",
    description: "AI Agent Security Platform. Zero-knowledge runtime protection for enterprise AI agent fleets.",
    publisher: {
      "@type": "Organization",
      name: "Saluca LLC",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />
    </>
  );
}
