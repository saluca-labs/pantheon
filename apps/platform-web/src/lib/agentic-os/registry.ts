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
  },
  {
    slug: 'maker',
    label: 'Maker OS',
    shortName: 'Maker',
    tagline: 'Workshop, parts, and project lifecycle.',
    description:
      'Track projects, parts, tools, and builds across hardware, electronics, and fabrication workflows.',
    icon: Wrench,
    status: 'preview',
    planFile: 'maker.md',
    accent: 'amber',
  },
  {
    slug: 'research',
    label: 'Research OS',
    shortName: 'Research',
    tagline: 'ELN + literature + experiments.',
    description:
      'Electronic lab notebook, literature mapping, hypothesis ledger, and experiment design for solo PhDs and small labs.',
    icon: FlaskConical,
    status: 'preview',
    planFile: 'research.md',
    accent: 'sky',
  },
  {
    slug: 'secure-dev',
    label: 'Secure Dev OS',
    shortName: 'Secure Dev',
    tagline: 'Threat-modeled DevSecOps from day one.',
    description:
      'Conversational requirements gathering, threat modeling, secure architecture, and DevSecOps pipeline scaffolding.',
    icon: ShieldCheck,
    status: 'preview',
    planFile: 'secure-dev.md',
    accent: 'violet',
  },
  {
    slug: 'filmmaker',
    label: 'Filmmaker OS',
    shortName: 'Filmmaker',
    tagline: 'Script to screen, end-to-end.',
    description:
      'Script breakdown, schedule, shot lists, dailies, edit notes, and post-production task tracking.',
    icon: Clapperboard,
    status: 'preview',
    planFile: 'filmmaker.md',
    accent: 'rose',
  },
  {
    slug: 'cyber',
    label: 'CyberSec OS',
    shortName: 'CyberSec',
    tagline: 'SecOps copilots + open-source SIEM.',
    description:
      'Aggregates SIEM/IDS/EDR telemetry, agentic copilots for triage, hunting, and response drafting.',
    icon: ShieldAlert,
    status: 'preview',
    planFile: 'cyber.md',
    accent: 'red',
  },
  {
    slug: 'autobiographer',
    label: 'Autobiographer OS',
    shortName: 'Autobiographer',
    tagline: 'Capture, learn voice, ghostwrite.',
    description:
      'Capture life events, learn the user’s voice, and produce ghostwritten chapters with full provenance.',
    icon: BookOpenText,
    status: 'preview',
    planFile: 'autobiographer.md',
    accent: 'indigo',
  },
  {
    slug: 'business',
    label: 'Business OS',
    shortName: 'Business',
    tagline: 'Solo to enterprise without re-architecting.',
    description:
      'Org profile, contacts, invoicing, finances, and ops modules that unlock as your team grows.',
    icon: Briefcase,
    status: 'preview',
    planFile: 'business.md',
    accent: 'teal',
  },
  {
    slug: 'creator',
    label: 'Creator OS',
    shortName: 'Creator',
    tagline: 'Write, record, publish, distribute.',
    description:
      'Editorial calendar, multi-format content, audio/video publishing, and distribution.',
    icon: Sparkles,
    status: 'preview',
    planFile: 'creator.md',
    accent: 'fuchsia',
  },
];

export function findAgenticOsModule(slug: string): AgenticOsModule | undefined {
  return AGENTIC_OS_MODULES.find((m) => m.slug === slug);
}
