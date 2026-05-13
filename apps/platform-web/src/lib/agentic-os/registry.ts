/**
 * Agentic OS module registry.
 *
 * Each entry declares one Agentic OS product. The sidebar, the
 * /dashboard/os/[slug]/* route shell, and the per-OS plan viewer all read
 * from this list, so adding a new OS is a single-file change here plus
 * the slug-specific feature code.
 *
 * `status` values:
 *  - 'live'     — fully shipped, has its own pages
 *  - 'preview'  — schema + plan viewer only, feature pages stubbed
 *  - 'planned'  — plan viewer only
 */

import type { LucideIcon } from 'lucide-react';
import {
  HeartPulse,
  Wrench,
  FlaskConical,
  ShieldCheck,
  Clapperboard,
  ShieldAlert,
  BookOpenText,
  Briefcase,
  Sparkles,
} from 'lucide-react';

export type AgenticOsStatus = 'live' | 'preview' | 'planned';

/**
 * A single shipped feature/sub-page inside an Agentic OS module. The OS shell
 * renders these as the primary feature grid; an empty list falls back to a
 * "coming soon" placeholder.
 */
export interface AgenticOsFeature {
  /** Absolute dashboard route (e.g. `/dashboard/os/health/intake`). */
  href: string;
  /** Short display label for the card. */
  label: string;
  /** One-line copy under the label. Keep <80 chars. */
  description: string;
}

export interface AgenticOsModule {
  slug: string;
  label: string;
  shortName: string;
  tagline: string;
  description: string;
  icon: LucideIcon;
  status: AgenticOsStatus;
  /** Path relative to apps/platform-web/content/agentic-os/ */
  planFile: string;
  /** Marketing color used for hero/badges; tailwind class name. */
  accent: string;
  /**
   * Currently shipped feature pages for this OS. Surfaced as the front-of-page
   * grid in the OS shell. Empty array = no features shipped yet (the shell
   * renders a "coming soon" card).
   */
  features: AgenticOsFeature[];
}

export const AGENTIC_OS_MODULES: AgenticOsModule[] = [
  {
    slug: 'health',
    label: 'Health OS',
    shortName: 'Health',
    tagline: 'Physical + mental wellness, evidence-based.',
    description:
      'Plan, track, and reflect on physical and mental wellness with citation-backed guidance — never medical advice, always with a crisis-safety wall.',
    icon: HeartPulse,
    status: 'live',
    planFile: 'health.md',
    accent: 'emerald',
    features: [
      {
        href: '/dashboard/os/health/intake',
        label: 'Intake & profile',
        description: 'Capture history, vitals, and goals to ground every plan.',
      },
      {
        href: '/dashboard/os/health/screeners',
        label: 'Screeners (PHQ-9 / GAD-7)',
        description: 'Self-track mood and anxiety with clinical instruments.',
      },
      {
        href: '/dashboard/os/health/mood',
        label: 'Mood check-in',
        description: 'Track mood, energy, and anxiety with optional journal.',
      },
      {
        href: '/dashboard/os/health/journal',
        label: 'Journal',
        description: 'Reflective entries with CBT-derived prompts.',
      },
      {
        href: '/dashboard/os/health/cbt',
        label: 'CBT exercises',
        description:
          'Thought records, behavioral activation, grounding, and more.',
      },
      {
        href: '/dashboard/os/health/meditate',
        label: 'Meditation',
        description: 'Track sessions and follow a weekly plan.',
      },
      {
        href: '/dashboard/os/health/nutrition',
        label: 'Nutrition log',
        description: 'Log meals manually or from your custom food catalog.',
      },
      {
        href: '/dashboard/os/health/recipes',
        label: 'Recipes',
        description: 'Build reusable recipes with per-serving nutrition rollup.',
      },
      {
        href: '/dashboard/os/health/meal-plan',
        label: 'Meal plan',
        description: 'Plan the week — recipes, foods, and freeform meals.',
      },
      {
        href: '/dashboard/os/health/activity',
        label: 'Activity log',
        description: 'Track exercise with MET-based kcal estimation.',
      },
      {
        href: '/dashboard/os/health/workouts',
        label: 'Workouts',
        description:
          'Built-in + custom workout templates with editable block lists.',
      },
      {
        href: '/dashboard/os/health/activity-plan',
        label: 'Activity plan',
        description:
          'Plan the week with workout templates + smart intensity suggestions.',
      },
      {
        href: '/dashboard/os/health/plan',
        label: 'Plan generator',
        description: 'Draft citation-backed nutrition, activity, and sleep plans.',
      },
      {
        href: '/dashboard/os/health/trends',
        label: 'Trends & analytics',
        description:
          'Multi-series mood, screener, and tag trends over 7/30/90 days.',
      },
      {
        href: '/dashboard/os/health/coach',
        label: 'AI coach',
        description:
          'Streaming chat grounded in your recent state. Never diagnoses; defers crises to 988.',
      },
      {
        href: '/dashboard/os/health/holistic-plan',
        label: 'Holistic plan',
        description:
          '1-week recommendations across activity, nutrition, sleep, and mental health.',
      },
    ],
  },
  {
    slug: 'maker',
    label: 'Maker OS',
    shortName: 'Maker',
    tagline: 'Workshop, parts, and project lifecycle.',
    description:
      'Track projects, parts, tools, and builds across hardware, electronics, and fabrication workflows.',
    icon: Wrench,
    status: 'live',
    planFile: 'maker.md',
    accent: 'amber',
    features: [
      {
        href: '/dashboard/os/maker/projects',
        label: 'Projects hub',
        description:
          'Per-project cover, status, target date, and 7-phase progress tracker.',
      },
      {
        href: '/dashboard/os/maker/catalog',
        label: 'Parts catalog',
        description:
          'Workshop-global SKUs with variants, tags, and on-hand counts.',
      },
      {
        href: '/dashboard/os/maker/suppliers',
        label: 'Suppliers',
        description:
          'Vendor directory — link suppliers to catalog rows for unit prices and lead times.',
      },
      {
        href: '/dashboard/os/maker/tools',
        label: 'Tools & maintenance',
        description:
          'Workshop-global tools with consumable wear tracking, maintenance log, and project links.',
      },
      {
        href: '/dashboard/os/maker/spec-sheets',
        label: 'Spec sheets',
        description:
          'Datasheets, drawings, manuals, and certificates attached to parts, tools, or projects.',
      },
      {
        href: '/dashboard/os/maker/references',
        label: 'References',
        description:
          'Workshop-global library of papers, tutorials, standards, articles, and other links.',
      },
      {
        href: '/dashboard/os/maker/blockers',
        label: 'Top blockers',
        description:
          'Cross-project deadline + dependency feed — missed, blocked, overdue, and at-risk milestones plus open block edges.',
      },
      {
        href: '/dashboard/os/maker/coach',
        label: 'AI coach',
        description:
          'Workshop copilot — procurement / build-planner / shop-safety / general. Streaming Anthropic with mode-scoped context.',
      },
    ],
  },
  {
    slug: 'research',
    label: 'Research OS',
    shortName: 'Research',
    tagline: 'ELN + literature + experiments.',
    description:
      'Electronic lab notebook, literature mapping, hypothesis ledger, and experiment design for solo PhDs and small labs.',
    icon: FlaskConical,
    status: 'live',
    planFile: 'research.md',
    accent: 'sky',
    features: [
      {
        href: '/dashboard/os/research/experiments',
        label: 'Experiments hub',
        description:
          'Per-experiment cover, status, target date, and 5-phase progress tracker.',
      },
      {
        href: '/dashboard/os/research/experiments',
        label: 'Lab notebook',
        description:
          'Per-experiment timeline of notes, observations, results, decisions, questions, and to-dos.',
      },
      {
        href: '/dashboard/os/research/hypotheses',
        label: 'Hypothesis ledger',
        description: 'Track research questions, predictions, and falsifiers.',
      },
      {
        href: '/dashboard/os/research/library',
        label: 'Literature library',
        description:
          'Workshop-global papers + structured authors + per-experiment references.',
      },
      {
        href: '/dashboard/os/research/protocols',
        label: 'Protocols',
        description:
          'Workshop-global methods, SOPs, analysis plans, and code pipelines with version-history pinning.',
      },
      {
        href: '/dashboard/os/research/exports',
        label: 'Reproducibility export',
        description:
          'Recent experiment PDF exports — open an experiment and click Export PDF to add a new one.',
      },
      {
        href: '/dashboard/os/research/blockers',
        label: 'Top blockers',
        description:
          'Workshop-wide milestones at risk + open blocks dependency edges across all experiments.',
      },
      {
        href: '/dashboard/os/research/coach',
        label: 'AI coach',
        description:
          'Research-aware AI coach across lit reviewer, hypothesis critic, methods advisor (with IRB / IACUC / EHS referral), and general modes. Streaming Anthropic with mode-scoped context.',
      },
    ],
  },
  {
    slug: 'secure-dev',
    label: 'Secure Dev OS',
    shortName: 'Secure Dev',
    tagline: 'Threat-modeled DevSecOps from day one.',
    description:
      'Conversational requirements gathering, threat modeling, secure architecture, and DevSecOps pipeline scaffolding.',
    icon: ShieldCheck,
    status: 'live',
    planFile: 'secure-dev.md',
    accent: 'violet',
    features: [
      {
        href: '/dashboard/os/secure-dev/threat-model',
        label: 'STRIDE threat model',
        description: 'Walk a system through STRIDE and capture mitigations.',
      },
    ],
  },
  {
    slug: 'filmmaker',
    label: 'Filmmaker OS',
    shortName: 'Filmmaker',
    tagline: 'Script to screen, end-to-end.',
    description:
      'Script breakdown, schedule, shot lists, dailies, edit notes, and post-production task tracking.',
    icon: Clapperboard,
    status: 'live',
    planFile: 'filmmaker.md',
    accent: 'rose',
    features: [
      {
        href: '/dashboard/os/filmmaker/projects',
        label: 'Project hub',
        description: 'Per-project cover, logline, phase tracker, and shot list.',
      },
      {
        href: '/dashboard/os/filmmaker/shots',
        label: 'Shot list builder',
        description: 'Plan scenes, framing, and coverage for each shoot day.',
      },
      {
        href: '/dashboard/os/filmmaker/projects',
        label: 'Story documents',
        description: 'Bible, treatment, logline, outline, and pitch-deck text per project.',
      },
      {
        href: '/dashboard/os/filmmaker/projects',
        label: 'Characters',
        description: 'Character sheets — identity, psychology, voice, and relationships.',
      },
      {
        href: '/dashboard/os/filmmaker/projects',
        label: 'Screenplay',
        description: 'Fountain-format screenplay editor with scenes, characters, and versions.',
      },
      {
        href: '/dashboard/os/filmmaker/projects',
        label: 'Breakdown',
        description: 'Tag scenes with cast, props, vehicles, costume, makeup, fx, sound, music.',
      },
      {
        href: '/dashboard/os/filmmaker/projects',
        label: 'Schedule',
        description: 'Stripboard scheduling — drop scenes onto shooting days, per-unit ordering.',
      },
      {
        href: '/dashboard/os/filmmaker/projects',
        label: 'Storyboards',
        description: 'Panel-grid visual boards with shot/angle/move metadata and PDF export.',
      },
      {
        href: '/dashboard/os/filmmaker/projects',
        label: 'AI coach',
        description:
          'Streaming dev-exec / script-reader / dialogue-doctor / scheduler conversations per project.',
      },
    ],
  },
  {
    slug: 'cyber',
    label: 'CyberSec OS',
    shortName: 'CyberSec',
    tagline: 'SecOps copilots + open-source SIEM.',
    description:
      'Aggregates SIEM/IDS/EDR telemetry, agentic copilots for triage, hunting, and response drafting.',
    icon: ShieldAlert,
    status: 'live',
    planFile: 'cyber.md',
    accent: 'red',
    features: [
      {
        href: '/dashboard/os/cyber/alerts',
        label: 'Alert triage queue',
        description: 'Work the live alert backlog with copilot-assisted triage.',
      },
      {
        href: '/dashboard/os/cyber/cases',
        label: 'Cases',
        description:
          'Investigation cases linking alerts, evidence, tasks, and a full timeline.',
      },
      {
        href: '/dashboard/os/cyber/assets',
        label: 'Assets',
        description:
          'Hosts, containers, accounts, repos — every entity worth protecting and linking to alerts.',
      },
      {
        href: '/dashboard/os/cyber/asset-groups',
        label: 'Asset groups',
        description:
          'Bundle related assets so future case management can scope actions to many at once.',
      },
      {
        href: '/dashboard/os/cyber/log-sources',
        label: 'Log sources',
        description:
          'SIEM, EDR, IDS, cloud audit, firewall — catalogue every alert-producing system.',
      },
      {
        href: '/dashboard/os/cyber/detections',
        label: 'Detection rules',
        description:
          'Sigma-style detection registry — author, test, and lifecycle rules feeding the alert pipeline.',
      },
      {
        href: '/dashboard/os/cyber/playbooks',
        label: 'Playbooks',
        description:
          'Response playbooks — orderable steps, executable runs, full audit of each step.',
      },
      {
        href: '/dashboard/os/cyber/playbook-runs',
        label: 'Active runs',
        description:
          'Track in-progress and recent playbook executions across cases.',
      },
      {
        href: '/dashboard/os/cyber/vulnerabilities',
        label: 'Vulnerabilities',
        description:
          'CVE/CVSS registry — manual entry plus Trivy / OpenVAS JSON importers.',
      },
      {
        href: '/dashboard/os/cyber/exposures',
        label: 'Exposures',
        description:
          'Vulnerability × asset workflow — track remediation across six statuses with MTTR.',
      },
      {
        href: '/dashboard/os/cyber/iocs',
        label: 'IOCs',
        description:
          'Indicator catalogue (12 kinds, 8 threat types) with per-kind value validation.',
      },
      {
        href: '/dashboard/os/cyber/trends',
        label: 'Trends',
        description:
          'Rolling alert volume, open vulns by severity, exposure MTTR, IOC hit rate + PDF export.',
      },
      {
        href: '/dashboard/os/cyber/coach',
        label: 'AI coach',
        description:
          'SOC copilot — triage / hunt / respond / detection-engineer. Streaming Anthropic with secret-redaction output filter.',
      },
    ],
  },
  {
    slug: 'autobiographer',
    label: 'Autobiographer OS',
    shortName: 'Autobiographer',
    tagline: 'Capture, learn voice, ghostwrite.',
    description:
      'Capture life events, learn the user’s voice, and produce ghostwritten chapters with full provenance.',
    icon: BookOpenText,
    status: 'live',
    planFile: 'autobiographer.md',
    accent: 'indigo',
    features: [
      {
        href: '/dashboard/os/autobiographer',
        label: 'Books',
        description:
          'Per-book cover, status, target date, audience, and 4-phase progress tracker.',
      },
      {
        href: '/dashboard/os/autobiographer/memories',
        label: 'Memory captures',
        description:
          'Workshop-global memory atoms with era, location, emotion + content tags, and photo/audio refs.',
      },
      {
        href: '/dashboard/os/autobiographer/people',
        label: 'People',
        description:
          'Workshop-global people directory with consent state, aliases, and Phase 6 redaction inputs.',
      },
      {
        href: '/dashboard/os/autobiographer/voice',
        label: 'Voice studio',
        description:
          'Curate voice samples and build a versioned voice profile the Phase 7 chapter drafter consumes.',
      },
      {
        href: '/dashboard/os/autobiographer/chapters',
        label: 'Chapters',
        description:
          'Workshop-wide chapter index across every book — versioned revisions, provenance back to source memories, PDF export.',
      },
      {
        href: '/dashboard/os/autobiographer/timeline',
        label: 'Timeline',
        description:
          'Cross-book timeline of every memory, ordered by year-of-life. Filter by theme, kind, decade, person, or scope to a single book.',
      },
      {
        href: '/dashboard/os/autobiographer/privacy',
        label: 'Privacy review',
        description:
          'Per-book consent audit, pseudonym map, and pre-publication review checklist that gates chapter lock + final PDF export.',
      },
      {
        href: '/dashboard/os/autobiographer/coach',
        label: 'AI coach',
        description:
          'Memoir-aware AI coach across interviewer, chapter drafter (citation-emitting ghostwriter), narrative critic, and general modes. Never invents content.',
      },
    ],
  },
  {
    slug: 'business',
    label: 'Business OS',
    shortName: 'Business',
    tagline: 'Solo to enterprise without re-architecting.',
    description:
      'Org profile, contacts, invoicing, finances, and ops modules that unlock as your team grows.',
    icon: Briefcase,
    status: 'live',
    planFile: 'business.md',
    accent: 'teal',
    features: [
      {
        href: '/dashboard/os/business/deals',
        label: 'Deals',
        description:
          'Pipeline kanban with stages, value tracking, and a per-deal activity timeline.',
      },
      {
        href: '/dashboard/os/business/people',
        label: 'People',
        description:
          'Contacts directory with tags, organizations, and a per-person interaction timeline.',
      },
      {
        href: '/dashboard/os/business/organizations',
        label: 'Organizations',
        description:
          'Companies, non-profits, and partners — tagged, searchable, with a people roster.',
      },
      {
        href: '/dashboard/os/business',
        label: 'Recent activity',
        description: 'Last touchpoints across every contact and organization.',
      },
      {
        href: '/dashboard/os/business/projects',
        label: 'Projects',
        description:
          'Client engagements with task boards, time tracking, and budget gauges.',
      },
      {
        href: '/dashboard/os/business/time',
        label: 'Time tracking',
        description:
          'Running timer, manual time entries, and unbilled-hour rollups by project.',
      },
      {
        href: '/dashboard/os/business/settings',
        label: 'Settings',
        description:
          'Business name, logo, address, tax ID, currency, prefixes, and accent color.',
      },
      {
        href: '/dashboard/os/business/quotes',
        label: 'Quotes',
        description:
          'Pre-sale estimates with line items, send, and convert to invoice.',
      },
      {
        href: '/dashboard/os/business/invoices',
        label: 'Invoices',
        description:
          'Billing with line items, payment tracking, PDF export, and time-entry rollup.',
      },
      {
        href: '/dashboard/os/business/expenses',
        label: 'Expenses',
        description: 'Expense ledger with category tracking, receipt attachments, and reimbursable flags.',
      },
      {
        href: '/dashboard/os/business/pnl',
        label: 'P&L',
        description: 'Live profit-and-loss summary, monthly snapshots, and PDF financial export.',
      },
      {
        href: '/dashboard/os/business/templates',
        label: 'Templates',
        description: 'Document template library with NDA, SOW, MSA, proposal, and custom templates.',
      },
      {
        href: '/dashboard/os/business/documents',
        label: 'Documents',
        description: 'Per-engagement documents with lifecycle tracking and in-app e-signature.',
      },
      {
        href: '/dashboard/os/business/coach',
        label: 'AI Coach',
        description: 'Five-mode advisory coach: pricing, sales, marketing, strategy, and general business guidance.',
      },
    ],
  },
  {
    slug: 'creator',
    label: 'Creator OS',
    shortName: 'Creator',
    tagline: 'Write, record, publish, distribute.',
    description:
      'Editorial calendar, multi-format content, audio/video publishing, and distribution.',
    icon: Sparkles,
    status: 'live',
    planFile: 'creator.md',
    accent: 'fuchsia',
    features: [
      {
        href: '/dashboard/os/creator',
        label: 'Hub',
        description: 'Pinned notes, recent work, and quick-create actions.',
      },
      {
        href: '/dashboard/os/creator/notes',
        label: 'Notes',
        description: 'Nested workspace with TipTap rich-text editor, tags, and drag-and-drop tree.',
      },
      {
        href: '/dashboard/os/creator/calendar',
        label: 'Calendar',
        description: 'Plan, draft, and ship content across every channel.',
      },
      {
        href: '/dashboard/os/creator/posts',
        label: 'Publishing',
        description: 'Blog/newsletter posts with scheduling, RSS feed, and subscriber management.',
      },
      {
        href: '/dashboard/os/creator/subscribers',
        label: 'Subscribers',
        description: 'Email subscriber list with status tracking, import, and unsubscribe management.',
      },
      {
        href: '/dashboard/os/creator/books',
        label: 'Books',
        description: 'Long-form writing with chapters, word-count tracking, drag-to-reorder, and Pandoc export.',
      },
      {
        href: '/dashboard/os/creator/videos',
        label: 'Videos',
        description: 'Video library with HLS streaming playback via Video.js player.',
      },
      {
        href: '/dashboard/os/creator/podcast',
        label: 'Podcast',
        description: 'Episode management with Podcasting 2.0 RSS feed, Plyr audio player, and show configuration.',
      },
      {
        href: '/dashboard/os/creator/chat',
        label: 'AI Chat',
        description: 'Multi-model chat with streaming, conversation history, and system prompts.',
      },
      {
        href: '/dashboard/os/creator/coach',
        label: 'AI Coach',
        description: 'Five-mode content coach: strategy, writing, audience, monetization, and general.',
      },
    ],
  },
];

export function findAgenticOsModule(slug: string): AgenticOsModule | undefined {
  return AGENTIC_OS_MODULES.find((m) => m.slug === slug);
}
