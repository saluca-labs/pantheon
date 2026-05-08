import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { findAgenticOsModule } from './registry';

const CONTENT_DIR = path.join(process.cwd(), 'content', 'agentic-os');

/**
 * Load the markdown execution plan for an Agentic OS module.
 *
 * Slug must resolve to a registry entry; file name comes from the registry
 * (not from user input) so this is safe against path traversal.
 *
 * Returns null when the slug is unknown or the file is missing.
 */
export async function loadAgenticOsPlan(slug: string): Promise<string | null> {
  const mod = findAgenticOsModule(slug);
  if (!mod) return null;

  // Defense in depth: ensure the registry-provided file name has no
  // separators and is a plain markdown file.
  const safeName = mod.planFile;
  if (
    safeName.includes('/') ||
    safeName.includes('\\') ||
    safeName.includes('..') ||
    !safeName.endsWith('.md')
  ) {
    return null;
  }

  const filePath = path.join(CONTENT_DIR, safeName);
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}
