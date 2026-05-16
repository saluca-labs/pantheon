'use client';

/**
 * Business OS — Contacts CRM component.
 *
 * Allows users to add and view contacts (people) with a CRM pipeline stage.
 * Stage taxonomy follows widely-published B2B sales process conventions
 * (HubSpot, Salesforce, Pipedrive).
 *
 * @license MIT — original work for Tiresias platform
 * @see https://www.hubspot.com/crm (HubSpot CRM — stage reference)
 */

import { useState } from 'react';
import { fullName, validatePerson, CONTACT_STAGES, INTERACTION_TYPES } from '@/lib/agentic-os/business/crm';
import type { Person, Interaction, ContactStage, InteractionType } from '@/lib/agentic-os/business/crm';

interface Props {
  initial: Person[];
  interactions: Interaction[];
}

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">{label}</span>
      {children}
    </label>
  );
}

const STAGE_COLORS: Record<ContactStage, string> = {
  lead: 'bg-accent/15 text-accent border-accent/30',
  qualified: 'bg-os-autobiographer/15 text-os-autobiographer border-os-autobiographer/30',
  proposal: 'bg-warning/15 text-warning border-warning/30',
  negotiation: 'bg-attention/15 text-attention border-attention/30',
  won: 'bg-positive/15 text-positive border-positive/30',
  lost: 'bg-danger/15 text-danger border-danger/30',
  inactive: 'bg-surface-2 text-text-secondary border-border-subtle',
};

const BLANK_PERSON = {
  firstName: '',
  lastName: '',
  email: '',
  role: '',
  stage: 'lead' as ContactStage,
};

const BLANK_INTERACTION = {
  personId: '',
  interactionType: 'note' as InteractionType,
  summary: '',
};

export function ContactsCrm({ initial, interactions: initialInteractions }: Props) {
  const [people, setPeople] = useState<Person[]>(initial);
  const [interactions, setInteractions] = useState<Interaction[]>(initialInteractions);
  const [personForm, setPersonForm] = useState({ ...BLANK_PERSON });
  const [interactionForm, setInteractionForm] = useState({ ...BLANK_INTERACTION });
  const [savingPerson, setSavingPerson] = useState(false);
  const [savingInteraction, setSavingInteraction] = useState(false);
  const [personError, setPersonError] = useState<string | null>(null);
  const [interactionError, setInteractionError] = useState<string | null>(null);
  const [personMsg, setPersonMsg] = useState<string | null>(null);

  async function handleAddPerson(e: React.FormEvent) {
    e.preventDefault();
    const errors = validatePerson({
      firstName: personForm.firstName,
      lastName: personForm.lastName,
      email: personForm.email || undefined,
      stage: personForm.stage,
    });
    if (errors.length > 0) {
      setPersonError(errors[0] ?? 'Validation error');
      return;
    }
    setSavingPerson(true);
    setPersonError(null);
    setPersonMsg(null);
    try {
      const body = {
        firstName: personForm.firstName.trim(),
        lastName: personForm.lastName.trim(),
        email: personForm.email.trim() || null,
        role: personForm.role.trim() || null,
        stage: personForm.stage,
      };
      const r = await fetch('/api/tiresias/agentic-os/business/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error((data as any).error ?? `Failed (${r.status})`);
      }
      const data = await r.json();
      setPeople((prev) => [data.person, ...prev]);
      setPersonForm({ ...BLANK_PERSON });
      setPersonMsg('Contact added.');
    } catch (err) {
      setPersonError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSavingPerson(false);
    }
  }

  async function handleLogInteraction(e: React.FormEvent) {
    e.preventDefault();
    if (!interactionForm.summary.trim()) {
      setInteractionError('Summary is required.');
      return;
    }
    setSavingInteraction(true);
    setInteractionError(null);
    try {
      const body = {
        personId: interactionForm.personId || null,
        interactionType: interactionForm.interactionType,
        summary: interactionForm.summary.trim(),
      };
      const r = await fetch('/api/tiresias/agentic-os/business/contacts?resource=interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error((data as any).error ?? `Failed (${r.status})`);
      }
      const data = await r.json();
      setInteractions((prev) => [data.interaction, ...prev]);
      setInteractionForm({ ...BLANK_INTERACTION });
    } catch (err) {
      setInteractionError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSavingInteraction(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Add contact */}
      <form
        onSubmit={handleAddPerson}
        className="rounded-xl border border-border-subtle bg-surface-2 p-5 space-y-4"
      >
        <h2 className="text-sm font-semibold text-white">Add contact</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="First name">
            <input
              value={personForm.firstName}
              onChange={(e) => setPersonForm((f) => ({ ...f, firstName: e.target.value }))}
              placeholder="Jane"
              className={inputCls}
              required
            />
          </Field>
          <Field label="Last name">
            <input
              value={personForm.lastName}
              onChange={(e) => setPersonForm((f) => ({ ...f, lastName: e.target.value }))}
              placeholder="Smith"
              className={inputCls}
              required
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={personForm.email}
              onChange={(e) => setPersonForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="jane@example.com"
              className={inputCls}
            />
          </Field>
          <Field label="Role / Title">
            <input
              value={personForm.role}
              onChange={(e) => setPersonForm((f) => ({ ...f, role: e.target.value }))}
              placeholder="CTO"
              className={inputCls}
            />
          </Field>
        </div>
        <Field label="Stage">
          <select
            value={personForm.stage}
            onChange={(e) => setPersonForm((f) => ({ ...f, stage: e.target.value as ContactStage }))}
            className={inputCls}
          >
            {CONTACT_STAGES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={savingPerson}
            className="rounded-lg bg-accent hover:bg-accent/90 disabled:opacity-60 text-white font-medium px-4 py-2 text-sm transition"
          >
            {savingPerson ? 'Adding…' : 'Add contact'}
          </button>
          {personMsg && <span className="text-sm text-positive">{personMsg}</span>}
          {personError && <span className="text-sm text-danger">{personError}</span>}
        </div>
      </form>

      {/* Log interaction */}
      <form
        onSubmit={handleLogInteraction}
        className="rounded-xl border border-border-subtle bg-surface-2 p-5 space-y-4"
      >
        <h2 className="text-sm font-semibold text-white">Log interaction</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Type">
            <select
              value={interactionForm.interactionType}
              onChange={(e) => setInteractionForm((f) => ({ ...f, interactionType: e.target.value as InteractionType }))}
              className={inputCls}
            >
              {INTERACTION_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Contact (optional)">
            <select
              value={interactionForm.personId}
              onChange={(e) => setInteractionForm((f) => ({ ...f, personId: e.target.value }))}
              className={inputCls}
            >
              <option value="">— none —</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{fullName(p)}</option>
              ))}
            </select>
          </Field>
          <Field label="Summary">
            <input
              value={interactionForm.summary}
              onChange={(e) => setInteractionForm((f) => ({ ...f, summary: e.target.value }))}
              placeholder="Quick note about the interaction"
              className={inputCls}
            />
          </Field>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={savingInteraction}
            className="rounded-lg border border-border-subtle text-white text-sm px-4 py-2 hover:border-accent transition disabled:opacity-50"
          >
            {savingInteraction ? 'Logging…' : '+ Log'}
          </button>
          {interactionError && <span className="text-sm text-danger">{interactionError}</span>}
        </div>
      </form>

      {/* Contacts list */}
      <div className="rounded-xl border border-border-subtle bg-surface-2 overflow-hidden">
        <div className="px-5 py-3 border-b border-border-subtle">
          <h2 className="text-sm font-semibold text-white">
            Contacts{' '}
            <span className="text-text-secondary font-normal">({people.length})</span>
          </h2>
        </div>
        {people.length === 0 ? (
          <p className="px-5 py-8 text-sm text-text-secondary text-center">No contacts yet. Add your first above.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {people.map((p) => {
              const recentInteraction = interactions.find((i) => i.personId === p.id);
              return (
                <li key={p.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">{fullName(p)}</p>
                    {p.role && <p className="text-xs text-text-secondary">{p.role}</p>}
                    {recentInteraction && (
                      <p className="text-xs text-text-secondary mt-0.5 italic truncate max-w-xs">
                        Last: {recentInteraction.summary}
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${
                      (STAGE_COLORS as Record<string, string>)[p.stage] ??
                      'bg-surface-2 text-text-secondary border-border-subtle'
                    }`}
                  >
                    {p.stage}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
