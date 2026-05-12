/**
 * Research OS Phase 4 — paper-author join types.
 *
 * The join carries an ordered `position` (1-indexed for natural
 * display). Two UNIQUE constraints back the integrity: one author per
 * position on a paper, and no duplicate (paper, author) links. Both
 * sides FK CASCADE — deleting either drops the link.
 *
 * @license MIT — Tiresias Research OS Phase 4 (internal).
 */

import type { Author } from './authors';

export interface PaperAuthorLink {
  id: string;
  paperId: string;
  authorId: string;
  position: number;
  createdAt: string;
}

export interface OrderedAuthor {
  link: PaperAuthorLink;
  author: Author;
}

/**
 * Input for linking an existing author to a paper. Either supply
 * `authorId` (link existing), or omit and supply the author fields
 * (auto-create + link).
 */
export interface LinkAuthorInput {
  authorId?: string;
  /**
   * Used when `authorId` is omitted. Validated by the route layer; the
   * repo trusts these to be present.
   */
  displayName?: string;
  givenName?: string | null;
  familyName?: string | null;
  orcid?: string | null;
  affiliation?: string | null;
  /**
   * Position to insert at. When omitted, the repo auto-assigns the
   * next position (max + 1, or 1 if empty).
   */
  position?: number;
}

export interface UpdatePaperAuthorInput {
  position?: number;
}
