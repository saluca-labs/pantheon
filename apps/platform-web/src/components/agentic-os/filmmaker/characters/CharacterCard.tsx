'use client';

/**
 * Filmmaker OS — CharacterCard.
 *
 * Visual card used in the character grid. Shows portrait (or initials
 * placeholder), name, role chip, archetype, and logline.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import Link from 'next/link';
import {
  CHARACTER_ROLE_LABEL,
  type Character,
  type CharacterRole,
} from '@/lib/agentic-os/filmmaker/characters';

const ROLE_COLOR: Record<CharacterRole, string> = {
  protagonist: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  antagonist: 'text-red-300 bg-red-500/10 border-red-500/30',
  deuteragonist: 'text-violet-300 bg-violet-500/10 border-violet-500/30',
  supporting: 'text-sky-300 bg-sky-500/10 border-sky-500/30',
  minor: 'text-text-secondary bg-surface-2 border-border-subtle',
  ensemble: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

interface Props {
  character: Character;
  projectId: string;
}

export function CharacterCard({ character, projectId }: Props) {
  return (
    <Link
      href={`/dashboard/os/filmmaker/projects/${projectId}/characters/${character.id}`}
      className="block rounded-xl border border-border-subtle bg-surface-2 overflow-hidden hover:border-accent/60 transition group"
    >
      <div className="h-32 bg-gradient-to-br from-accent/20 to-surface-2 border-b border-border-subtle flex items-center justify-center relative">
        {character.portraitUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={character.portraitUrl}
            alt={character.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-3xl font-semibold text-white/80">
            {initials(character.name)}
          </span>
        )}
      </div>
      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-white truncate group-hover:text-accent transition">
            {character.name}
          </h3>
          <span
            className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border whitespace-nowrap ${ROLE_COLOR[character.role]}`}
          >
            {CHARACTER_ROLE_LABEL[character.role]}
          </span>
        </div>
        {character.archetype && (
          <p className="text-xs text-text-secondary">{character.archetype}</p>
        )}
        {character.logline && (
          <p className="text-sm text-white/80 line-clamp-2 italic">
            {character.logline}
          </p>
        )}
        {character.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {character.tags.slice(0, 4).map((t) => (
              <span
                key={t}
                className="text-[10px] px-1.5 py-0.5 rounded bg-surface-0 border border-border-subtle text-text-secondary"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
