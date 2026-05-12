/**
 * Research OS Phase 7 — coach system-prompt builder tests.
 *
 * Covers:
 *   - SYSTEM_PROMPT_VERSION pinned at 'v1'.
 *   - HARD_RULES content present and covers fabrication / citations /
 *     regulated-advice topics.
 *   - Per-mode role framing renders distinct copy.
 *   - Context block renders mode-shaped detail.
 *   - methods_advisor with a regulated user prompt appends the referral
 *     footer; other modes never do.
 *
 * @license MIT — Tiresias Research OS Phase 7 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  HARD_RULES,
  SYSTEM_PROMPT_VERSION,
  buildSystemPrompt,
} from '@/lib/agentic-os/research/coach/system-prompt';
import type { ResearchCoachContext } from '@/lib/agentic-os/research/coach/context';

describe('SYSTEM_PROMPT_VERSION', () => {
  it('is pinned at v1', () => {
    expect(SYSTEM_PROMPT_VERSION).toBe('v1');
  });
});

describe('HARD_RULES', () => {
  it('declares the NO FABRICATION rule', () => {
    expect(HARD_RULES).toMatch(/NO FABRICATION/);
  });

  it('declares the CITE SOURCE IDs rule', () => {
    expect(HARD_RULES).toMatch(/CITE SOURCE IDs/);
  });

  it('mentions paper / hypothesis / prediction / falsifier ID examples', () => {
    expect(HARD_RULES.toLowerCase()).toMatch(/paper/);
    expect(HARD_RULES.toLowerCase()).toMatch(/hypothesis/);
  });

  it('declares the REGULATED PROFESSIONAL ADVICE rule for methods_advisor', () => {
    expect(HARD_RULES).toMatch(/REGULATED PROFESSIONAL ADVICE/);
    expect(HARD_RULES).toMatch(/methods_advisor/);
  });

  it('references all 4 regulated-advice bodies', () => {
    expect(HARD_RULES).toMatch(/IRB/);
    expect(HARD_RULES).toMatch(/IACUC/);
    expect(HARD_RULES).toMatch(/EHS/);
    expect(HARD_RULES).toMatch(/clinician|clinical/);
  });

  it('contains the refusal phrasing template', () => {
    // The template spans a line break in the source string (template
    // literal indent), so we collapse whitespace before matching.
    const collapsed = HARD_RULES.replace(/\s+/g, ' ');
    expect(collapsed).toMatch(/I can't substitute for/);
  });
});

// ─── Helpers to build fake contexts ────────────────────────────────────

function litReviewerCtx(over: Partial<any> = {}): ResearchCoachContext {
  return {
    mode: 'lit_reviewer',
    data: {
      experiment: null,
      recent_papers: [],
      experiment_references: [],
      prior_art_refs: [],
      ...over,
    },
  };
}

function hypothesisCriticCtx(over: Partial<any> = {}): ResearchCoachContext {
  return {
    mode: 'hypothesis_critic',
    data: {
      experiment: null,
      hypotheses: [],
      recent_evidence: [],
      ...over,
    },
  };
}

function methodsAdvisorCtx(over: Partial<any> = {}): ResearchCoachContext {
  return {
    mode: 'methods_advisor',
    data: {
      experiment: {
        id: 'exp-1',
        name: 'Pilot',
        description: 'A pilot experiment',
        status: 'planning',
        tags: ['pilot'],
        target_completion_date: null,
        phase_progress_avg: 0,
      },
      experiment_description: 'A pilot experiment',
      protocols: [],
      datasets: [],
      reproducibility: [],
      ...over,
    },
  };
}

function generalCtx(over: Partial<any> = {}): ResearchCoachContext {
  return {
    mode: 'general',
    data: {
      experiment: null,
      counts: { experiments: 0, hypotheses: 0, papers: 0 },
      ...over,
    },
  };
}

describe('buildSystemPrompt — composition', () => {
  it('always begins with the Pantheon Research Coach banner', () => {
    const p = buildSystemPrompt(generalCtx(), 'general');
    expect(p).toMatch(/Pantheon Research Coach/);
  });

  it('always includes the HARD_RULES block', () => {
    const p = buildSystemPrompt(generalCtx(), 'general');
    expect(p).toContain('Hard rules (every mode):');
  });

  it('always renders the context block', () => {
    const p = buildSystemPrompt(generalCtx(), 'general');
    expect(p).toMatch(/Workshop counts/);
  });
});

describe('buildSystemPrompt — per-mode role framing', () => {
  it('lit_reviewer framing mentions theme / cluster / synthesizer', () => {
    const p = buildSystemPrompt(litReviewerCtx(), 'lit_reviewer');
    expect(p.toLowerCase()).toMatch(/literature synthesizer|theme|cluster/);
  });

  it('hypothesis_critic framing mentions falsifia / confound / skeptic', () => {
    const p = buildSystemPrompt(hypothesisCriticCtx(), 'hypothesis_critic');
    expect(p.toLowerCase()).toMatch(/falsifia|confound|skeptic/);
  });

  it('methods_advisor framing mentions controls / sample size', () => {
    const p = buildSystemPrompt(methodsAdvisorCtx(), 'methods_advisor');
    expect(p.toLowerCase()).toMatch(/control|sample size|reproducibility/);
  });

  it('methods_advisor framing references the regulated-advice rule', () => {
    const p = buildSystemPrompt(methodsAdvisorCtx(), 'methods_advisor');
    expect(p).toMatch(/Rule 3|REGULATED|OFF LIMITS/);
  });

  it('general framing mentions stuck-PhD / conversation partner', () => {
    const p = buildSystemPrompt(generalCtx(), 'general');
    expect(p.toLowerCase()).toMatch(/stuck-phd|conversation partner|stuck/);
  });
});

describe('buildSystemPrompt — context rendering', () => {
  it('lit_reviewer renders paper IDs from the recent_papers list', () => {
    const p = buildSystemPrompt(
      litReviewerCtx({
        recent_papers: [
          {
            id: 'paper-1',
            title: 'Thermal management approaches',
            authors_text: 'Smith et al.',
            year: 2024,
            kind: 'paper',
            tags: ['thermal'],
            abstract_snippet: 'A survey…',
          },
        ],
      }),
      'lit_reviewer',
    );
    expect(p).toContain('paper-1');
    expect(p).toContain('Thermal management approaches');
    expect(p).toContain('Smith et al.');
  });

  it('hypothesis_critic renders hypothesis if/then/because', () => {
    const p = buildSystemPrompt(
      hypothesisCriticCtx({
        hypotheses: [
          {
            id: 'hyp-1',
            title: 'Thermal hypothesis',
            if_clause: 'If we cool below 4K',
            then_clause: 'then coherence improves',
            because_clause: 'because phonon noise drops',
            status: 'active',
            confidence: 'medium',
            tags: [],
            description_snippet: '',
            predictions: [],
            falsifiers: [],
          },
        ],
      }),
      'hypothesis_critic',
    );
    expect(p).toContain('hyp-1');
    expect(p).toContain('If we cool below 4K');
    expect(p).toContain('then coherence improves');
    expect(p).toContain('because phonon noise drops');
  });

  it('methods_advisor renders protocol pin info', () => {
    const p = buildSystemPrompt(
      methodsAdvisorCtx({
        protocols: [
          {
            protocol_id: 'pro-1',
            title: 'Cryostat warmup',
            pinned_version: '1.2',
            kind: 'method',
            body_snippet: 'Start at room temperature…',
          },
        ],
      }),
      'methods_advisor',
    );
    expect(p).toContain('pro-1');
    expect(p).toContain('Cryostat warmup');
    expect(p).toContain('1.2');
  });

  it('methods_advisor renders reproducibility item_key + state', () => {
    const p = buildSystemPrompt(
      methodsAdvisorCtx({
        reproducibility: [
          { item_key: 'data_publicly_available', state: 'pending' },
          { item_key: 'code_in_vcs', state: 'done' },
        ],
      }),
      'methods_advisor',
    );
    expect(p).toContain('data_publicly_available: pending');
    expect(p).toContain('code_in_vcs: done');
  });

  it('general renders workshop counts', () => {
    const p = buildSystemPrompt(
      generalCtx({
        counts: { experiments: 5, hypotheses: 12, papers: 30 },
      }),
      'general',
    );
    expect(p).toContain('Experiments: 5');
    expect(p).toContain('Hypotheses: 12');
    expect(p).toContain('Papers: 30');
  });
});

describe('buildSystemPrompt — regulated-advice footer wiring', () => {
  it('methods_advisor with an IRB-triggering prompt appends the referral footer', () => {
    const p = buildSystemPrompt(
      methodsAdvisorCtx(),
      'methods_advisor',
      'Can you draft me an informed consent form for human subjects?',
    );
    expect(p).toMatch(/Regulated-advice referral/);
    expect(p).toMatch(/IRB/);
  });

  it('methods_advisor with an IACUC-triggering prompt appends the referral footer', () => {
    const p = buildSystemPrompt(
      methodsAdvisorCtx(),
      'methods_advisor',
      'Should we use a mouse model for the assay?',
    );
    expect(p).toMatch(/Regulated-advice referral/);
    expect(p).toMatch(/IACUC/);
  });

  it('methods_advisor with a non-regulated prompt does NOT append the footer', () => {
    const p = buildSystemPrompt(
      methodsAdvisorCtx(),
      'methods_advisor',
      'What additional controls should I add for this protocol?',
    );
    expect(p).not.toMatch(/Regulated-advice referral/);
  });

  it('lit_reviewer NEVER appends the referral footer even with regulated keywords', () => {
    const p = buildSystemPrompt(
      litReviewerCtx(),
      'lit_reviewer',
      'Summarize my papers on IRB human-subjects research',
    );
    expect(p).not.toMatch(/Regulated-advice referral/);
  });

  it('hypothesis_critic NEVER appends the referral footer', () => {
    const p = buildSystemPrompt(
      hypothesisCriticCtx(),
      'hypothesis_critic',
      'Critique my hypothesis about mouse models and BSL-3 containment',
    );
    expect(p).not.toMatch(/Regulated-advice referral/);
  });

  it('general NEVER appends the referral footer', () => {
    const p = buildSystemPrompt(
      generalCtx(),
      'general',
      'How do I handle radioactive isotopes safely?',
    );
    expect(p).not.toMatch(/Regulated-advice referral/);
  });

  it('methods_advisor with no userPrompt does NOT append the footer', () => {
    const p = buildSystemPrompt(methodsAdvisorCtx(), 'methods_advisor');
    expect(p).not.toMatch(/Regulated-advice referral/);
  });

  it('methods_advisor with empty-string userPrompt does NOT append the footer', () => {
    const p = buildSystemPrompt(methodsAdvisorCtx(), 'methods_advisor', '');
    expect(p).not.toMatch(/Regulated-advice referral/);
  });
});

describe('buildSystemPrompt — output stability', () => {
  it('same context + mode produces identical output', () => {
    const ctx = generalCtx({
      counts: { experiments: 3, hypotheses: 7, papers: 9 },
    });
    const a = buildSystemPrompt(ctx, 'general');
    const b = buildSystemPrompt(ctx, 'general');
    expect(a).toBe(b);
  });
});
