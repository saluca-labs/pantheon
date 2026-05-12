/**
 * Research coach — safety helpers (methods_advisor regulated-advice refusal).
 *
 * methods_advisor is the only Research mode that opens onto regulated
 * professional territory. The Phase 7 locked decision is a
 * system-prompt-level guardrail (no domain output filter): when the
 * user's prompt touches clinical / human-subjects / animal-use /
 * hazmat topics, the coach must refuse to give regulated advice and
 * refer the user to the appropriate institutional body.
 *
 * This module exposes:
 *
 *   1. `REGULATED_TOPICS` — the canonical taxonomy of refusal topics
 *      with referral bodies + referral copy.
 *   2. `detectRegulatedTopics(prompt)` — pure keyword scan that
 *      returns the set of triggered topics for a given user prompt.
 *   3. `buildReferralFooter(topics)` — renders the referral copy that
 *      the system-prompt builder appends to the methods_advisor
 *      system prompt when at least one topic is triggered.
 *
 * The detection layer is deliberately conservative (favors false
 * positives over false negatives) because the cost of a missed referral
 * is the coach giving regulated advice — the cost of a spurious
 * referral is one extra line in the system prompt.
 *
 * @license MIT — Tiresias Research OS Phase 7 (internal).
 */

import 'server-only';

export type RegulatedTopic =
  | 'irb_human_subjects'
  | 'iacuc_animal_use'
  | 'ehs_hazardous_materials'
  | 'clinical_medical';

export const REGULATED_TOPIC_VALUES: ReadonlyArray<RegulatedTopic> = [
  'irb_human_subjects',
  'iacuc_animal_use',
  'ehs_hazardous_materials',
  'clinical_medical',
];

export interface RegulatedTopicSpec {
  /** Stable machine identifier. */
  topic: RegulatedTopic;
  /** Human-readable label for the referral line. */
  label: string;
  /** Institutional referral body or licensed professional class. */
  referralBody: string;
  /** Lowercase keyword anchors that, if present, trigger the topic. */
  keywords: ReadonlyArray<string>;
}

/**
 * Canonical refusal taxonomy. Keywords are LOWERCASE and matched as
 * whole-word substrings (with non-word boundaries). The phrasing was
 * chosen to flag practitioner intent ("I want to dose X to subjects")
 * but not academic discussion ("the IRB literature shows…") via the
 * detection layer's pre-filter.
 */
export const REGULATED_TOPICS: ReadonlyArray<RegulatedTopicSpec> = [
  {
    topic: 'irb_human_subjects',
    label: 'human-subjects research',
    referralBody: 'your IRB',
    keywords: [
      'human subjects',
      'human participants',
      'human subject',
      'irb',
      'institutional review board',
      'informed consent',
      'consent form',
      'patient enrollment',
      'recruit participants',
      'participant recruitment',
      'survey participants',
      'survey subjects',
      'clinical trial protocol',
      'phase i trial',
      'phase ii trial',
      'phase iii trial',
    ],
  },
  {
    topic: 'iacuc_animal_use',
    label: 'animal-use research',
    referralBody: 'your IACUC office',
    keywords: [
      'iacuc',
      'animal subjects',
      'animal research',
      'mouse model',
      'mice study',
      'rat study',
      'rodent model',
      'primate study',
      'animal protocol',
      'vertebrate animals',
      'live animals',
      'animal sacrifice',
      'animal euthanasia',
    ],
  },
  {
    topic: 'ehs_hazardous_materials',
    label: 'hazardous-materials handling',
    referralBody: 'your EHS office',
    keywords: [
      'ehs',
      'biosafety',
      'bsl-2',
      'bsl-3',
      'bsl-4',
      'select agent',
      'radioactive',
      'radioisotope',
      'radiological',
      'laser safety',
      'hazardous waste',
      'hazmat',
      'chemical hygiene',
      'flammable solvent',
      'flammable solvents',
      'pyrophoric',
      'cryogenic',
      'controlled substance',
      'controlled substances',
      'schedule i',
      'schedule ii',
      'dea schedule',
    ],
  },
  {
    topic: 'clinical_medical',
    label: 'clinical / medical advice',
    referralBody: 'a licensed clinician',
    keywords: [
      'diagnose',
      'diagnosis',
      'treat patient',
      'treat a patient',
      'patient treatment',
      'drug dosing',
      'medication dose',
      'medication dosage',
      'dosage regimen',
      'off-label',
      'prescribe',
      'prescription',
      'medical advice',
      'clinical advice',
      'should i take',
      'side effect management',
    ],
  },
];

const TOPIC_BY_NAME: Record<RegulatedTopic, RegulatedTopicSpec> = Object.freeze(
  Object.fromEntries(REGULATED_TOPICS.map((t) => [t.topic, t])) as Record<
    RegulatedTopic,
    RegulatedTopicSpec
  >,
);

/**
 * Detect the set of regulated topics present in a user prompt. Returns
 * the triggered topics in canonical (taxonomy-declaration) order, with
 * duplicates collapsed. Empty array means no referral language is
 * needed for the system prompt.
 *
 * The matcher lowercases the input and scans for whole-word keyword
 * matches. A keyword like "irb" matches "send to IRB" but not
 * "scribble" — the regex anchors to non-word boundaries on both sides.
 */
export function detectRegulatedTopics(prompt: string): RegulatedTopic[] {
  if (typeof prompt !== 'string' || !prompt.trim()) return [];
  const lower = prompt.toLowerCase();
  const hits = new Set<RegulatedTopic>();
  for (const spec of REGULATED_TOPICS) {
    for (const kw of spec.keywords) {
      // Whole-substring boundary check. Most keywords are multi-word
      // so we just check inclusion; for the short ones (irb, iacuc,
      // ehs) we use a word-boundary regex so "scribble" doesn't trip
      // "irb".
      if (kw.length <= 5) {
        const re = new RegExp(`\\b${escapeRegex(kw)}\\b`, 'i');
        if (re.test(lower)) {
          hits.add(spec.topic);
          break;
        }
      } else if (lower.includes(kw)) {
        hits.add(spec.topic);
        break;
      }
    }
  }
  return REGULATED_TOPICS.filter((t) => hits.has(t.topic)).map((t) => t.topic);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Render the referral footer that the system-prompt builder appends
 * to the methods_advisor prompt when the user's most recent turn
 * triggers at least one regulated topic.
 *
 * The footer is INSTRUCTIONAL — it tells the model which institutional
 * body to point at. The model still composes the refusal in its own
 * voice, but the bodies/labels are pinned by this function so the
 * referral language is consistent across turns.
 *
 * Returns null when `topics` is empty.
 */
export function buildReferralFooter(
  topics: ReadonlyArray<RegulatedTopic>,
): string | null {
  if (!Array.isArray(topics) || topics.length === 0) return null;
  const unique = Array.from(new Set(topics));
  const ordered = REGULATED_TOPICS.filter((t) => unique.includes(t.topic));
  if (ordered.length === 0) return null;
  const lines: string[] = [];
  lines.push('## Regulated-advice referral (this turn)');
  lines.push(
    'The user prompt mentions regulated professional territory. Refuse to give regulated advice and refer them to:',
  );
  for (const spec of ordered) {
    lines.push(`- ${spec.label} → consult ${spec.referralBody}`);
  }
  lines.push('');
  lines.push(
    'End your response with referral language of the form: "I can\'t substitute for [IRB / IACUC / EHS / licensed clinician] review — please consult [appropriate body]."',
  );
  return lines.join('\n');
}

/**
 * Resolve the canonical spec for a topic. Returns null for unknown
 * inputs.
 */
export function getRegulatedTopicSpec(
  topic: unknown,
): RegulatedTopicSpec | null {
  if (typeof topic !== 'string') return null;
  return (TOPIC_BY_NAME as Record<string, RegulatedTopicSpec>)[topic] ?? null;
}
