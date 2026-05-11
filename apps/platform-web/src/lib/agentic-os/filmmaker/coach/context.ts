/**
 * Filmmaker coach context snapshot.
 *
 * Pulls a compact, current-state view of one filmmaker project for the
 * system prompt: project metadata + phase progress, story-document
 * excerpts (per kind), character roster + relationship summary,
 * screenplay head metadata (scene-heading list, page/word counts),
 * breakdown summary, schedule summary, top storyboards.
 *
 * Composes the existing per-domain repo helpers — no new SQL primitives.
 */

import 'server-only';
import {
  getProject,
  listStoryDocuments,
  listCharacters,
  listCharacterRelationships,
  getScreenplayByProject,
  listScreenplayScenes,
  getProjectBreakdownSummary,
  getProjectScheduleSummary,
  listStoryboards,
} from '../repo';
import type { StoryDocumentKind } from '../story-documents';
import type { BreakdownCategory } from '../breakdown';

export interface CoachContextProject {
  id: string;
  name: string;
  format: string;
  status: string;
  logline: string | null;
  phase_progress: {
    development: number;
    pre_production: number;
    production: number;
    post_production: number;
    distribution: number;
  };
  target_completion_date: string | null;
}

export interface CoachContextStoryDocExcerpt {
  kind: StoryDocumentKind;
  title: string;
  word_count: number;
  excerpt_240chars: string;
}

export interface CoachContextCharacter {
  id: string;
  name: string;
  role: string;
  archetype: string | null;
  logline: string | null;
}

export interface CoachContextRelationship {
  from_name: string;
  to_name: string;
  kind: string;
  tension: number | null;
}

export interface CoachContextScreenplay {
  version_number: number;
  page_count_estimate: number;
  word_count: number;
  scene_count: number;
  headings: string[];
}

export interface CoachContextBreakdownSummary {
  category_counts: Record<string, number>;
  scenes_with_breakdown: number;
  total_eighths: number;
}

export interface CoachContextScheduleSummary {
  total_days: number;
  scheduled_scenes: number;
  unscheduled_scenes: number;
  total_scheduled_eighths: number;
}

export interface CoachContextStoryboard {
  name: string;
  panel_count: number;
  scene_ref: string | null;
}

export interface FilmmakerCoachContext {
  project: CoachContextProject;
  story_documents: CoachContextStoryDocExcerpt[];
  characters: CoachContextCharacter[];
  character_relationships_summary: CoachContextRelationship[];
  screenplay: CoachContextScreenplay | null;
  breakdown_summary: CoachContextBreakdownSummary;
  schedule_summary: CoachContextScheduleSummary | null;
  active_storyboards: CoachContextStoryboard[];
}

const MAX_SCENE_HEADINGS = 50;
const STORY_DOC_EXCERPT_LEN = 240;

function excerpt(text: string, max: number): string {
  const trimmed = (text ?? '').trim().replace(/\s+/g, ' ');
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max - 1) + '…';
}

export interface BuildCoachContextInput {
  projectId: string;
  userId: string;
}

export async function buildCoachContext(
  input: BuildCoachContextInput,
): Promise<FilmmakerCoachContext> {
  const { projectId, userId } = input;

  const project = await getProject(projectId, userId);
  if (!project) {
    throw new Error('Project not found or not owned by user');
  }

  const [
    storyDocs,
    characters,
    relationships,
    screenplay,
    breakdownSummary,
    scheduleSummary,
    storyboards,
  ] = await Promise.all([
    listStoryDocuments(projectId, project.userId, userId),
    listCharacters({ projectId, tenantId: project.userId, userId }),
    listCharacterRelationships({ projectId, tenantId: project.userId, userId }),
    getScreenplayByProject(projectId, userId),
    getProjectBreakdownSummary(projectId, userId),
    getProjectScheduleSummary(projectId, userId),
    listStoryboards({ projectId, userId }),
  ]);

  const characterNameById = new Map<string, string>(
    characters.map((c) => [c.id, c.name]),
  );

  let screenplayBlock: CoachContextScreenplay | null = null;
  if (screenplay && screenplay.headVersionId) {
    const scenes = await listScreenplayScenes(screenplay.headVersionId, userId);
    const headings = scenes
      .slice(0, MAX_SCENE_HEADINGS)
      .map((s) => `${s.sceneNumber}. ${s.heading}`);
    const wordCount = scenes.reduce((acc, s) => {
      const dwc = s.dialogueWordCounts ?? {};
      const dialogueWords = Object.values(dwc).reduce(
        (a, b) => a + (typeof b === 'number' ? b : 0),
        0,
      );
      const actionWords = (s.actionText ?? '').trim().split(/\s+/).filter(Boolean).length;
      return acc + dialogueWords + actionWords;
    }, 0);
    const pageEstimate = scenes.reduce((acc, s) => {
      return Math.max(acc, s.pageStart ?? 0);
    }, 0);
    screenplayBlock = {
      version_number: 0,
      page_count_estimate: pageEstimate,
      word_count: wordCount,
      scene_count: scenes.length,
      headings,
    };
    // Pull the head version row to fill in version_number + authoritative counts.
    // listScreenplayVersions hits the same table; we use a cheap query via repo
    // to avoid a redundant import — fall back to scene-derived counts if missing.
    try {
      const { listScreenplayVersions } = await import('../repo');
      const versions = await listScreenplayVersions(screenplay.id, userId);
      const head = versions.find((v) => v.isHead);
      if (head) {
        screenplayBlock.version_number = head.versionNumber;
        screenplayBlock.page_count_estimate = head.pageCountEstimate;
        screenplayBlock.word_count = head.wordCount;
      }
    } catch {
      // best-effort enrichment
    }
  }

  const categoryCounts: Record<string, number> = {};
  for (const c of breakdownSummary.byCategory) {
    categoryCounts[c.category as BreakdownCategory] = c.count;
  }

  return {
    project: {
      id: project.id,
      name: project.name,
      format: project.format,
      status: project.status,
      logline: project.logline,
      phase_progress: project.phaseProgress,
      target_completion_date: project.targetCompletionDate,
    },
    story_documents: storyDocs.map((d) => ({
      kind: d.kind,
      title: d.title,
      word_count: d.wordCount,
      excerpt_240chars: excerpt(d.contentText, STORY_DOC_EXCERPT_LEN),
    })),
    characters: characters.map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
      archetype: c.archetype ?? null,
      logline: c.logline ?? null,
    })),
    character_relationships_summary: relationships.map((r) => ({
      from_name: characterNameById.get(r.fromId) ?? r.fromId,
      to_name: characterNameById.get(r.toId) ?? r.toId,
      kind: r.kind,
      tension: r.tension,
    })),
    screenplay: screenplayBlock,
    breakdown_summary: {
      category_counts: categoryCounts,
      scenes_with_breakdown: breakdownSummary.scenesWithBreakdown,
      total_eighths: breakdownSummary.totalEighths,
    },
    schedule_summary:
      scheduleSummary.totalDays === 0 && scheduleSummary.totalScenes === 0
        ? null
        : {
            total_days: scheduleSummary.totalDays,
            scheduled_scenes: scheduleSummary.scheduledScenes,
            unscheduled_scenes: scheduleSummary.unscheduledScenes,
            total_scheduled_eighths: scheduleSummary.scheduledEighths,
          },
    active_storyboards: storyboards.slice(0, 5).map((sb) => ({
      name: sb.name,
      panel_count: sb.panelCount,
      scene_ref: sb.sceneId,
    })),
  };
}
