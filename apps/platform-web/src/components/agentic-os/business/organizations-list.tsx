'use client';

/**
 * Business OS — organizations list with search + saved views.
 *
 * Wave C (UI Depth Wave) adoption:
 *  - The ad-hoc search `<input>` is replaced with the shared `EntitySearch`
 *    primitive (debounced; wired to the same `q` filter state).
 *  - `SavedViews` is added — the filter combination (search / tag / industry /
 *    type / archived) can be saved + restored, persisted to `localStorage`.
 *  - The empty-list state uses the shared `EmptyState` primitive.
 *  - The tag / industry / type / archived controls are kept as ad-hoc inputs:
 *    `EntitySearch` only models the free-text query, so dropping them would
 *    drop functionality. They feed the same `orgMatchesFilter` call.
 *
 * @license MIT — Tiresias Business OS (internal).
 */

import { useEffect, useMemo, useState } from 'react';
import type { Organization } from '@/lib/agentic-os/business/crm';
import { ORG_TYPES } from '@/lib/agentic-os/business/crm';
import { orgMatchesFilter } from '@/lib/agentic-os/business/orgs';
import {
  EmptyState,
  EntitySearch,
  SavedViews,
  type SavedView,
} from '@/components/agentic-os/_shared/views';
import { OrganizationRow } from './organization-row';

interface Props {
  initialOrganizations: Organization[];
}

/** The persisted filter shape for a saved view. */
interface OrgQuery {
  q: string;
  tag: string;
  industry: string;
  type: string;
  showArchived: boolean;
}

const STORAGE_KEY = 'business.organizations.saved-views';

const inputCls =
  'w-full sm:w-auto rounded-md border border-border-subtle bg-surface-1 px-3 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none';

function loadViews(): SavedView<OrgQuery>[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedView<OrgQuery>[]) : [];
  } catch {
    return [];
  }
}

export function OrganizationsList({ initialOrganizations }: Props) {
  const [orgs] = useState<Organization[]>(initialOrganizations);
  const [showArchived, setShowArchived] = useState(false);
  const [tagFilter, setTagFilter] = useState('');
  const [industryFilter, setIndustryFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [q, setQ] = useState('');

  const [views, setViews] = useState<SavedView<OrgQuery>[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  useEffect(() => {
    setViews(loadViews());
  }, []);

  const persistViews = (next: SavedView<OrgQuery>[]) => {
    setViews(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* localStorage unavailable — views stay in-memory for the session. */
    }
  };

  const currentQuery: OrgQuery = useMemo(
    () => ({
      q,
      tag: tagFilter,
      industry: industryFilter,
      type: typeFilter,
      showArchived,
    }),
    [q, tagFilter, industryFilter, typeFilter, showArchived],
  );

  const activeView = views.find((v) => v.id === activeViewId) ?? null;
  const isDirty =
    activeView != null &&
    JSON.stringify(activeView.query) !== JSON.stringify(currentQuery);

  const applyQuery = (query: OrgQuery) => {
    setQ(query.q);
    setTagFilter(query.tag);
    setIndustryFilter(query.industry);
    setTypeFilter(query.type);
    setShowArchived(query.showArchived);
  };

  const filtered = useMemo(() => {
    return orgs.filter((o) =>
      orgMatchesFilter(o, {
        archived: showArchived,
        tag: tagFilter || undefined,
        industry: industryFilter || undefined,
        orgType: (typeFilter || undefined) as any,
        q: q || undefined,
      }),
    );
  }, [orgs, showArchived, tagFilter, industryFilter, typeFilter, q]);

  return (
    <div className="space-y-4">
      <EntitySearch
        placeholder="Search name / industry"
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
        <input
          value={industryFilter}
          onChange={(e) => {
            setIndustryFilter(e.target.value);
            setActiveViewId(null);
          }}
          placeholder="Industry"
          className={inputCls}
        />
        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setActiveViewId(null);
          }}
          className={inputCls}
        >
          <option value="">All types</option>
          {ORG_TYPES.map((t) => (
            <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
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
          {filtered.length} of {orgs.length}
        </span>
      </div>

      <SavedViews<OrgQuery>
        views={views}
        activeViewId={activeViewId}
        currentQuery={currentQuery}
        isDirty={isDirty}
        slug="business"
        allViewsLabel="All organizations"
        onClearView={() => {
          setActiveViewId(null);
          applyQuery({
            q: '',
            tag: '',
            industry: '',
            type: '',
            showArchived: false,
          });
        }}
        onSelectView={(view) => {
          setActiveViewId(view.id);
          applyQuery(view.query);
        }}
        onSaveView={(name, query) => {
          const view: SavedView<OrgQuery> = {
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
          title="No organizations match the current filters"
          description="Clear the filters above, or add an organization to get started."
          primaryCta={{
            label: 'Add organization',
            href: '/dashboard/os/business/organizations?new=1',
          }}
        />
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {filtered.map((o) => (
            <li key={o.id}>
              <OrganizationRow organization={o} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
