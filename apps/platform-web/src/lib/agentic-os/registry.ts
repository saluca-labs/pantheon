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
        href: '/dashboard/os/maker/builds',
        label: 'Builds & parts inventory',
        description: 'Manage active builds and the parts bin behind them.',
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
        href: '/dashboard/os/research/hypotheses',
        label: 'Hypothesis ledger',
        description: 'Track research questions, predictions, and falsifiers.',
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
        label: 'My projects',
        description: 'Active films, scripts, and their production status.',
      },
      {
        href: '/dashboard/os/filmmaker/shots',
        label: 'Shot list builder',
        description: 'Plan scenes, framing, and coverage for each shoot day.',
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
        href: '/dashboard/os/autobiographer/chapters',
        label: 'Chapter capture',
        description: 'Record memories and turn them into ghostwritten chapters.',
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
        href: '/dashboard/os/business/contacts',
        label: 'Contacts CRM',
        description: 'Organize customers, partners, and the deals between them.',
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
        href: '/dashboard/os/creator/calendar',
        label: 'Editorial calendar',
        description: 'Plan, draft, and ship content across every channel.',
      },
    ],
  },
];

export function findAgenticOsModule(slug: string): AgenticOsModule | undefined {
  return AGENTIC_OS_MODULES.find((m) => m.slug === slug);
}
