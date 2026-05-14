'use client';

/**
 * Business OS — people list with search + saved views.
 *
 * Wave C (UI Depth Wave) adoption:
 *  - The ad-hoc search `<input>` is replaced with the shared `EntitySearch`
 *    primitive (debounced; wired to the same `q` filter state).
 *  - `SavedViews` is added — the filter combination (search / tag / org /
 *    archived) can be saved + restored, persisted to `localStorage` (Wave E
 *    schema-backs it).
 *  - The empty-list state uses the shared `EmptyState` primitive.
 *  - The tag / organization / archived controls are kept as ad-hoc inputs:
 *    `EntitySearch` only models the free-text query, so dropping them would
 *    drop functionality. They feed the same `personMatchesFilter` call.
 *
 * @license MIT — Tiresias Business OS (internal).
 */

import { useEffect, useMemo, useState } from 'react';
import type { Organization, Person } from '@/lib/agentic-os/business/crm';
import { personMatchesFilter } from '@/lib/agentic-os/business/people';
import {
  EmptyState,
  EntitySearch,
  SavedViews,
  type SavedView,
} from '@/components/agentic-os/_shared/views';
import { PersonRow } from './person-row';

interface Props {
  initialPeople: Person[];
  organizations: Pick<Organization, 'id' | 'name'>[];
}

/** The persisted filter shape for a saved view. */
interface PeopleQuery {
  q: string;
  tag: string;
  orgId: string;
  showArchived: boolean;
}

const STORAGE_KEY = 'business.people.saved-views';

const inputCls =
  'w-full sm:w-auto rounded-md border border-border-subtle bg-surface-1 px-3 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none';

function loadViews(): SavedView<PeopleQuery>[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedView<PeopleQuery>[]) : [];
  } catch {
    return [];
  }
}

export function PeopleList({ initialPeople, organizations }: Props) {
  const [people] = useState<Person[]>(initialPeople);
  const [showArchived, setShowArchived] = useState(false);
  const [tagFilter, setTagFilter] = useState('');
  const [orgFilter, setOrgFilter] = useState('');
  const [q, setQ] = useState('');

  const [views, setViews] = useState<SavedView<PeopleQuery>[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  // Hydrate saved views from localStorage on mount.
  useEffect(() => {
    setViews(loadViews());
  }, []);

  const persistViews = (next: SavedView<PeopleQuery>[]) => {
    setViews(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* localStorage unavailable — views stay in-memory for the session. */
    }
  };

  const currentQuery: PeopleQuery = useMemo(
    () => ({ q, tag: tagFilter, orgId: orgFilter, showArchived }),
    [q, tagFilter, orgFilter, showArchived],
  );

  const activeView = views.find((v) => v.id === activeViewId) ?? null;
  const isDirty =
    activeView != null &&
    JSON.stringify(activeView.query) !== JSON.stringify(currentQuery);

  const applyQuery = (query: PeopleQuery) => {
    setQ(query.q);
    setTagFilter(query.tag);
    setOrgFilter(query.orgId);
    setShowArchived(query.showArchived);
  };

  const orgMap = useMemo(
    () => new Map(organizations.map((o) => [o.id, o.name])),
    [organizations],
  );

  const filtered = useMemo(() => {
    return people.filter((p) =>
      personMatchesFilter(p, {
        archived: showArchived,
        tag: tagFilter || undefined,
        organizationId: orgFilter || undefined,
        q: q || undefined,
      }),
    );
  }, [people, showArchived, tagFilter, orgFilter, q]);

  return (
    <div className="space-y-4">
      <EntitySearch
        placeholder="Search name / email / role"
        defaultValue={q}
        onQueryChange={(next) => {
          setQ(next);
          setActiveViewId((id) => (id ? null : id));
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={tagFilter}
          onChange={(e) => {
            setTagFilter(e.target.value);
            setActiveViewId(null);
          }}
          placeholder="Filter by tag"
          className={inputCls}
        />
        <select
          value={orgFilter}
          onChange={(e) => {
            setOrgFilter(e.target.value);
            setActiveViewId(null);
          }}
          className={inputCls}
        >
          <option value="">All organizations</option>
          {organizations.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => {
              setShowArchived(e.target.checked);
              setActiveViewId(null);
            }}
          />
          Show archived
        </label>
        <span className="text-xs text-text-secondary ml-auto tabular-nums">
          {filtered.length} of {people.length}
        </span>
      </div>

      <SavedViews<PeopleQuery>
        views={views}
        activeViewId={activeViewId}
        currentQuery={currentQuery}
        isDirty={isDirty}
        slug="business"
        allViewsLabel="All people"
        onClearView={() => {
          setActiveViewId(null);
          applyQuery({ q: '', tag: '', orgId: '', showArchived: false });
        }}
        onSelectView={(view) => {
          setActiveViewId(view.id);
          applyQuery(view.query);
        }}
        onSaveView={(name, query) => {
          const view: SavedView<PeopleQuery> = {
            id: `view-${Date.now()}`,
            name,
            query,
          };
          persistViews([...views, view]);
          setActiveViewId(view.id);
        }}
        onDeleteView={(id) => {
          persistViews(views.filter((v) => v.id !== id));
          setActiveViewId((current) => (current === id ? null : current));
        }}
      />

      {filtered.length === 0 ? (
        <EmptyState
          title="No people match the current filters"
          description="Clear the filters above, or add a contact to get started."
          primaryCta={{
            label: 'Add person',
            href: '/dashboard/os/business/people?new=1',
          }}
        />
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {filtered.map((p) => (
            <li key={p.id}>
              <PersonRow person={p} orgName={p.organizationId ? orgMap.get(p.organizationId) ?? null : null} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
