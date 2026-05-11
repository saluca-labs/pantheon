/**
 * Filmmaker OS — Fountain parser.
 *
 * Thin wrapper around `fountain-js` that:
 *   - tokenises the raw screenplay text;
 *   - groups tokens by scene heading;
 *   - extracts interior/location/time-of-day from headings;
 *   - counts words per character (dialogue only) per scene;
 *   - estimates page numbers via the 250-word-per-page heuristic.
 *
 * Pure helpers only — no DB access. The repo calls `parseFountain` inside
 * the version-save transaction.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */
import { Fountain, type Token } from 'fountain-js';
import { countWords } from './story-documents';

export interface ParsedScene {
  sceneNumber: number;
  heading: string;
  interior?: boolean;
  location?: string;
  timeOfDay?: string;
  actionText: string;
  dialogueText: string;
  dialogueWordCounts: Record<string, number>;
  pageStart: number;
}

export interface ParsedCharacterStat {
  name: string;
  dialogueWordCount: number;
  sceneCount: number;
}

export interface ParseResult {
  title?: string;
  author?: string;
  scenes: ParsedScene[];
  characters: ParsedCharacterStat[];
  totalWordCount: number;
  pageCountEstimate: number;
}

const WORDS_PER_PAGE = 250;

/**
 * Split a scene heading into interior/location/time-of-day.
 *
 * Accepts the leading prefix variants from the Fountain spec:
 *   INT. / EXT. / I/E. / INT./EXT. / INT/EXT. / EXT./INT. / EXT/INT. / EST.
 *
 * Splits on " - " (with optional surrounding whitespace) for the time
 * suffix. Falls through gracefully — returns `{}` for nonsense input.
 */
export function extractHeading(heading: string): {
  interior?: boolean;
  location?: string;
  timeOfDay?: string;
} {
  if (typeof heading !== 'string') return {};
  const trimmed = heading.trim();
  if (trimmed.length === 0) return {};

  const match = trimmed.match(
    /^(INT\.?\/EXT\.?|EXT\.?\/INT\.?|INT\/EXT|EXT\/INT|I\/E\.?|INT\.?|EXT\.?|EST\.?)\s+(.*)$/i,
  );
  if (!match) {
    // No standard prefix — still try to recover a "LOCATION - DAY" split.
    const [loc, ...timeParts] = trimmed.split(/\s+-\s+/);
    return {
      location: loc.trim() || undefined,
      timeOfDay: timeParts.length > 0 ? timeParts.join(' - ').trim() : undefined,
    };
  }

  const prefix = match[1].toUpperCase().replace(/\./g, '');
  const rest = match[2] ?? '';

  let interior: boolean | undefined;
  if (prefix === 'INT') interior = true;
  else if (prefix === 'EXT') interior = false;
  else if (prefix === 'EST') interior = undefined;
  else interior = undefined; // INT/EXT or I/E — both, leave null

  const [locRaw, ...timeParts] = rest.split(/\s+-\s+/);
  const location = (locRaw ?? '').trim() || undefined;
  const timeOfDay =
    timeParts.length > 0 ? timeParts.join(' - ').trim() || undefined : undefined;

  return { interior, location, timeOfDay };
}

/** Re-export the shared word counter so callers don't import two helpers. */
export { countWords };

interface SceneAccumulator {
  heading: string;
  actionParts: string[];
  dialogueParts: string[];
  dialogueByCharacter: Map<string, string[]>;
  currentCharacter: string | null;
  wordsBeforeScene: number;
}

function freshScene(heading: string, wordsBeforeScene: number): SceneAccumulator {
  return {
    heading,
    actionParts: [],
    dialogueParts: [],
    dialogueByCharacter: new Map(),
    currentCharacter: null,
    wordsBeforeScene,
  };
}

/** Strip the `(parenthetical)` suffix and `(CONT'D)`/`(V.O.)` style cues. */
function normaliseCharacterName(raw: string): string {
  return raw
    .replace(/\([^)]*\)/g, '')
    .trim()
    .toUpperCase();
}

/**
 * Parse the Fountain source into structured scenes + character stats.
 *
 * Empty or whitespace-only input returns an empty result rather than
 * throwing. The parser is permissive — malformed Fountain falls through
 * to the action bucket of whichever scene is current.
 */
export function parseFountain(fountainText: string): ParseResult {
  if (typeof fountainText !== 'string' || fountainText.trim().length === 0) {
    return {
      scenes: [],
      characters: [],
      totalWordCount: 0,
      pageCountEstimate: 0,
    };
  }

  const fountain = new Fountain();
  const script = fountain.parse(fountainText, true);
  const tokens: Token[] = script.tokens ?? [];

  let title: string | undefined;
  let author: string | undefined;
  let totalWordCount = 0;

  const scenes: SceneAccumulator[] = [];
  let current: SceneAccumulator | null = null;

  for (const token of tokens) {
    const type = token.type;
    const text = typeof token.text === 'string' ? token.text : '';

    // Title-page metadata. fountain-js emits these as `title`, `author`,
    // `credit`, etc. We only persist title + author server-side.
    if (token.is_title) {
      if (type === 'title' && !title) title = text.trim() || undefined;
      else if (type === 'author' && !author) author = text.trim() || undefined;
      else if (type === 'authors' && !author) author = text.trim() || undefined;
      continue;
    }

    if (type === 'scene_heading') {
      current = freshScene(text.trim(), totalWordCount);
      scenes.push(current);
      continue;
    }

    // Outside any scene yet — accumulate into a synthetic "scene 0" only
    // if non-whitespace content shows up. Most scripts open with a
    // heading; we just count words.
    if (!current) {
      if (type === 'action' || type === 'dialogue') {
        totalWordCount += countWords(text);
      }
      continue;
    }

    switch (type) {
      case 'action': {
        current.actionParts.push(text);
        current.currentCharacter = null;
        totalWordCount += countWords(text);
        break;
      }
      case 'character': {
        current.currentCharacter = normaliseCharacterName(text);
        break;
      }
      case 'dialogue': {
        if (current.currentCharacter) {
          const bucket = current.dialogueByCharacter.get(current.currentCharacter) ?? [];
          bucket.push(text);
          current.dialogueByCharacter.set(current.currentCharacter, bucket);
        }
        current.dialogueParts.push(text);
        totalWordCount += countWords(text);
        break;
      }
      case 'parenthetical': {
        // Parentheticals don't count toward dialogue word count but they
        // still belong to the dialogue bucket for full-text storage.
        current.dialogueParts.push(text);
        break;
      }
      case 'transition':
      case 'centered':
      case 'section':
      case 'synopsis':
      case 'note':
      case 'lyrics': {
        // Treat as action text for storage; not character dialogue.
        current.actionParts.push(text);
        totalWordCount += countWords(text);
        current.currentCharacter = null;
        break;
      }
      case 'dialogue_begin':
      case 'dialogue_end':
      case 'dual_dialogue_begin':
      case 'dual_dialogue_end':
      case 'page_break':
      case 'spaces': {
        // Structural — ignore.
        break;
      }
      default:
        // Unknown token — append text to action if present.
        if (text) {
          current.actionParts.push(text);
          totalWordCount += countWords(text);
        }
    }
  }

  const characterTotals = new Map<string, { words: number; scenes: number }>();
  const parsed: ParsedScene[] = scenes.map((s, index) => {
    const dialogueWordCounts: Record<string, number> = {};
    for (const [name, lines] of s.dialogueByCharacter) {
      const n = lines.reduce((sum, line) => sum + countWords(line), 0);
      if (n > 0) dialogueWordCounts[name] = n;
      const prev = characterTotals.get(name) ?? { words: 0, scenes: 0 };
      characterTotals.set(name, {
        words: prev.words + n,
        scenes: prev.scenes + 1,
      });
    }
    return {
      sceneNumber: index + 1,
      heading: s.heading,
      ...extractHeading(s.heading),
      actionText: s.actionParts.join('\n\n').trim(),
      dialogueText: s.dialogueParts.join('\n\n').trim(),
      dialogueWordCounts,
      pageStart: Number((s.wordsBeforeScene / WORDS_PER_PAGE).toFixed(2)),
    };
  });

  const characters: ParsedCharacterStat[] = [...characterTotals.entries()]
    .map(([name, stats]) => ({
      name,
      dialogueWordCount: stats.words,
      sceneCount: stats.scenes,
    }))
    .sort((a, b) => b.dialogueWordCount - a.dialogueWordCount);

  const pageCountEstimate = Number(
    (totalWordCount / WORDS_PER_PAGE).toFixed(2),
  );

  return {
    title,
    author,
    scenes: parsed,
    characters,
    totalWordCount,
    pageCountEstimate,
  };
}
