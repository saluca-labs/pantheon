/**
 * Tool definitions for the Filmmaker OS coach.
 *
 * Each tool wraps an existing filmmaker repo helper with:
 *   - Zod-validated input
 *   - `recordAudit` to the agos_audit table (action prefix `filmmaker.coach.`)
 *   - An `agos_filmmaker_coach_action_log` row capturing input + output
 *
 * Tools are exposed via the Vercel AI SDK `tool()` helper and bound at
 * call time inside the chat route so they can capture the active
 * conversation id, project id, and user.
 */

import 'server-only';
import { tool } from 'ai';
import { z } from 'zod';
import {
  addBreakdownElement,
  getCharacter,
  getProject,
  getScreenplayByProject,
  getStoryDocument,
  listCharacters,
  listScreenplayScenes,
  getProjectBreakdownSummary,
  getProjectScheduleSummary,
  recordAudit,
  updateStoryDocument,
} from '../repo';
import { BREAKDOWN_CATEGORY_VALUES } from '../breakdown';
import type { ProseMirrorJson } from '../story-documents';
import { logCoachAction } from './repo';

export interface CoachToolBindings {
  projectId: string;
  userId: string;
  conversationId: string;
}

function audit(
  bindings: CoachToolBindings,
  toolName: string,
  payload: Record<string, unknown>,
): Promise<void> {
  return recordAudit({
    actorId: bindings.userId,
    action: `filmmaker.coach.${toolName}`,
    payload,
    projectId: bindings.projectId,
  });
}

function logAction(
  bindings: CoachToolBindings,
  toolName: string,
  toolInput: unknown,
  toolOutput: unknown,
): Promise<void> {
  return logCoachAction({
    conversationId: bindings.conversationId,
    projectId: bindings.projectId,
    userId: bindings.userId,
    toolName,
    toolInput,
    toolOutput,
  });
}

export function buildCoachTools(bindings: CoachToolBindings) {
  const { projectId, userId } = bindings;

  return {
    get_project: tool({
      description:
        'Return the current project metadata: name, format, status, logline, phase progress, target completion date.',
      inputSchema: z.object({}),
      execute: async (input) => {
        const project = await getProject(projectId, userId);
        const result = project
          ? {
              id: project.id,
              name: project.name,
              format: project.format,
              status: project.status,
              logline: project.logline,
              phase_progress: project.phaseProgress,
              target_completion_date: project.targetCompletionDate,
            }
          : { error: 'Project not found' };
        await audit(bindings, 'get_project', {});
        await logAction(bindings, 'get_project', input, result);
        return result;
      },
    }),

    list_characters: tool({
      description:
        'List the project characters. Optional `q` filters by name substring (case-insensitive).',
      inputSchema: z.object({
        q: z.string().max(120).optional(),
      }),
      execute: async (input) => {
        const characters = await listCharacters({
          projectId,
          tenantId: userId,
          userId,
          q: input.q,
        });
        const result = {
          characters: characters.map((c) => ({
            id: c.id,
            name: c.name,
            role: c.role,
            archetype: c.archetype ?? null,
            logline: c.logline ?? null,
          })),
        };
        await audit(bindings, 'list_characters', { count: result.characters.length });
        await logAction(bindings, 'list_characters', input, result);
        return result;
      },
    }),

    get_character: tool({
      description:
        'Fetch one character sheet — identity, psychology, voice, arc. Use when a question is about a specific character.',
      inputSchema: z.object({
        characterId: z.string().uuid(),
      }),
      execute: async (input) => {
        const character = await getCharacter(input.characterId, userId);
        const result = character
          ? {
              id: character.id,
              name: character.name,
              role: character.role,
              archetype: character.archetype,
              logline: character.logline,
              age: character.age,
              pronouns: character.pronouns,
              gender: character.gender,
              occupation: character.occupation,
              backstory: character.backstory,
              goals: character.goals,
              needs: character.needs,
              fears: character.fears,
              wounds: character.wounds,
              arc: character.arc,
              voice_notes: character.voiceNotes,
              physical_description: character.physicalDescription,
              tags: character.tags,
            }
          : { error: 'Character not found' };
        await audit(bindings, 'get_character', { characterId: input.characterId });
        await logAction(bindings, 'get_character', input, result);
        return result;
      },
    }),

    get_screenplay_head: tool({
      description:
        'Return scene headings + per-character dialogue word counts for the current head version of the screenplay. Does NOT return full Fountain text; use get_screenplay_scene for individual scenes.',
      inputSchema: z.object({}),
      execute: async (input) => {
        const screenplay = await getScreenplayByProject(projectId, userId);
        if (!screenplay || !screenplay.headVersionId) {
          const result = { error: 'No screenplay or head version yet.' };
          await audit(bindings, 'get_screenplay_head', { found: false });
          await logAction(bindings, 'get_screenplay_head', input, result);
          return result;
        }
        const scenes = await listScreenplayScenes(screenplay.headVersionId, userId);
        const characterWordCounts: Record<string, number> = {};
        for (const s of scenes) {
          for (const [name, count] of Object.entries(s.dialogueWordCounts ?? {})) {
            characterWordCounts[name] = (characterWordCounts[name] ?? 0) + (count ?? 0);
          }
        }
        const result = {
          screenplay_id: screenplay.id,
          scene_count: scenes.length,
          headings: scenes.map((s) => ({
            sceneNumber: s.sceneNumber,
            heading: s.heading,
            location: s.location,
            time_of_day: s.timeOfDay,
            page_start: s.pageStart,
          })),
          character_dialogue_word_counts: characterWordCounts,
        };
        await audit(bindings, 'get_screenplay_head', { scene_count: scenes.length });
        await logAction(bindings, 'get_screenplay_head', input, result);
        return result;
      },
    }),

    get_screenplay_scene: tool({
      description:
        'Return one screenplay scene by its 1-indexed scene number (action + dialogue + heading).',
      inputSchema: z.object({
        sceneNumber: z.number().int().positive(),
      }),
      execute: async (input) => {
        const screenplay = await getScreenplayByProject(projectId, userId);
        if (!screenplay || !screenplay.headVersionId) {
          const result = { error: 'No screenplay or head version yet.' };
          await audit(bindings, 'get_screenplay_scene', { found: false });
          await logAction(bindings, 'get_screenplay_scene', input, result);
          return result;
        }
        const scenes = await listScreenplayScenes(screenplay.headVersionId, userId);
        const scene = scenes.find((s) => s.sceneNumber === input.sceneNumber);
        const result = scene
          ? {
              sceneId: scene.id,
              sceneNumber: scene.sceneNumber,
              heading: scene.heading,
              interior: scene.interior,
              location: scene.location,
              time_of_day: scene.timeOfDay,
              page_start: scene.pageStart,
              action_text: scene.actionText,
              dialogue_text: scene.dialogueText,
            }
          : { error: `Scene ${input.sceneNumber} not found.` };
        await audit(bindings, 'get_screenplay_scene', {
          sceneNumber: input.sceneNumber,
          found: !!scene,
        });
        await logAction(bindings, 'get_screenplay_scene', input, result);
        return result;
      },
    }),

    get_breakdown_summary: tool({
      description:
        'Return the project breakdown summary: per-category element counts, scenes with breakdown, total eighths.',
      inputSchema: z.object({}),
      execute: async (input) => {
        const summary = await getProjectBreakdownSummary(projectId, userId);
        const categoryCounts: Record<string, number> = {};
        for (const c of summary.byCategory) categoryCounts[c.category] = c.count;
        const result = {
          total_scenes: summary.totalScenes,
          scenes_with_breakdown: summary.scenesWithBreakdown,
          total_elements: summary.totalElements,
          total_eighths: summary.totalEighths,
          total_pages: summary.totalPages,
          category_counts: categoryCounts,
        };
        await audit(bindings, 'get_breakdown_summary', {});
        await logAction(bindings, 'get_breakdown_summary', input, result);
        return result;
      },
    }),

    get_schedule_summary: tool({
      description:
        'Return the project schedule summary: shooting day count, scheduled vs unscheduled scenes, scheduled eighths and minutes.',
      inputSchema: z.object({}),
      execute: async (input) => {
        const summary = await getProjectScheduleSummary(projectId, userId);
        const result = {
          total_days: summary.totalDays,
          scheduled_scenes: summary.scheduledScenes,
          unscheduled_scenes: summary.unscheduledScenes,
          total_scenes: summary.totalScenes,
          total_eighths: summary.totalEighths,
          scheduled_eighths: summary.scheduledEighths,
          total_scheduled_minutes: summary.totalScheduledMinutes,
        };
        await audit(bindings, 'get_schedule_summary', {});
        await logAction(bindings, 'get_schedule_summary', input, result);
        return result;
      },
    }),

    add_breakdown_element: tool({
      description:
        'Tag a breakdown element (cast/extras/props/vehicles/costume/fx/etc.) onto a screenplay scene. Use when the coach has identified a missing tag in the breakdown.',
      inputSchema: z.object({
        sceneId: z.string().uuid(),
        category: z.enum(BREAKDOWN_CATEGORY_VALUES as unknown as [string, ...string[]]),
        name: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        quantity: z.number().int().positive().max(10_000).optional(),
        isPrincipal: z.boolean().optional(),
      }),
      execute: async (input) => {
        const element = await addBreakdownElement({
          sceneId: input.sceneId,
          userId,
          data: {
            category: input.category as (typeof BREAKDOWN_CATEGORY_VALUES)[number],
            name: input.name,
            description: input.description,
            quantity: input.quantity,
            isPrincipal: input.isPrincipal,
          },
        });
        const result = {
          id: element.id,
          sceneId: element.sceneId,
          category: element.category,
          name: element.name,
          quantity: element.quantity,
          isPrincipal: element.isPrincipal,
        };
        await audit(bindings, 'add_breakdown_element', {
          element_id: element.id,
          sceneId: element.sceneId,
          category: element.category,
        });
        await logAction(bindings, 'add_breakdown_element', input, result);
        return result;
      },
    }),

    add_story_beat: tool({
      description:
        'Append a single paragraph to the end of an existing story document (bible / treatment / logline / outline / pitch_deck). Conservative — append only, never replaces the document.',
      inputSchema: z.object({
        documentId: z.string().uuid(),
        beat_text: z.string().min(1).max(4000),
      }),
      execute: async (input) => {
        const existing = await getStoryDocument(input.documentId, userId, userId);
        if (!existing) {
          const result = { error: 'Story document not found.' };
          await audit(bindings, 'add_story_beat', {
            documentId: input.documentId,
            found: false,
          });
          await logAction(bindings, 'add_story_beat', input, result);
          return result;
        }
        const nextContent = appendParagraph(existing.contentJson, input.beat_text);
        const updated = await updateStoryDocument({
          id: input.documentId,
          tenantId: userId,
          userId,
          contentJson: nextContent,
        });
        const result = updated
          ? {
              id: updated.id,
              version: updated.version,
              word_count: updated.wordCount,
            }
          : { error: 'Failed to update story document.' };
        await audit(bindings, 'add_story_beat', {
          documentId: input.documentId,
          appended_chars: input.beat_text.length,
        });
        await logAction(bindings, 'add_story_beat', input, result);
        return result;
      },
    }),

    get_story_document: tool({
      description:
        'Return the full plain text of a story document (bible / treatment / logline / outline / pitch_deck). Use when notes need to ground in the actual prose.',
      inputSchema: z.object({
        documentId: z.string().uuid(),
      }),
      execute: async (input) => {
        const doc = await getStoryDocument(input.documentId, userId, userId);
        const result = doc
          ? {
              id: doc.id,
              kind: doc.kind,
              title: doc.title,
              version: doc.version,
              word_count: doc.wordCount,
              content_text: doc.contentText,
            }
          : { error: 'Story document not found.' };
        await audit(bindings, 'get_story_document', {
          documentId: input.documentId,
          found: !!doc,
        });
        await logAction(bindings, 'get_story_document', input, result);
        return result;
      },
    }),
  };
}

export type CoachTools = ReturnType<typeof buildCoachTools>;

/**
 * Append a single paragraph to the end of a ProseMirror doc. If the doc
 * is empty / invalid, return a minimal doc with the new paragraph as its
 * only content. We never delete existing content.
 */
function appendParagraph(
  contentJson: ProseMirrorJson,
  text: string,
): ProseMirrorJson {
  const newParagraph: ProseMirrorJson = {
    type: 'paragraph',
    content: [{ type: 'text', text }],
  };
  if (
    !contentJson ||
    typeof contentJson !== 'object' ||
    !Array.isArray(contentJson.content)
  ) {
    return {
      type: 'doc',
      content: [newParagraph],
    };
  }
  return {
    ...contentJson,
    content: [...contentJson.content, newParagraph],
  };
}
