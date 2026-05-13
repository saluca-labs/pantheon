/**
 * Creator OS Phase 1 — Notes workspace domain types.
 *
 * @license MIT — Tiresias Creator OS Phase 1 (internal).
 */

export interface CreatorNote {
  id: string;
  userId: string;
  title: string;
  content: Record<string, unknown>; // TipTap JSON
  icon: string | null;
  coverImageUrl: string | null;
  parentId: string | null;
  position: number;
  tags: string[];
  isPinned: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCreatorNoteInput {
  title?: string;
  content?: Record<string, unknown>;
  icon?: string;
  coverImageUrl?: string;
  parentId?: string | null;
  tags?: string[];
  isPinned?: boolean;
}

export interface UpdateCreatorNoteInput {
  title?: string;
  content?: Record<string, unknown>;
  icon?: string | null;
  coverImageUrl?: string | null;
  parentId?: string | null;
  position?: number;
  tags?: string[];
  isPinned?: boolean;
}

export interface ListCreatorNotesOpts {
  parentId?: string | null;
  isPinned?: boolean;
  includeArchived?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}
