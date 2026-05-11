/**
 * Filmmaker OS — Call Sheet PDF template.
 *
 * Renders a single shooting day with its strips, principal cast, and notes.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import * as React from 'react';
import {
  Document,
  Page,
  View,
  Text,
  PdfHeader,
  PdfFooter,
  PdfMetadataBlock,
  PdfTable,
  PdfPageStyles,
  type PdfTableColumnDef,
} from '../../_shared/pdf/primitives';
import type { FilmmakerProject } from '../projects';
import type {
  ShootingDay,
  ScheduleStripJoined,
} from '../schedule';
import type { BreakdownElement } from '../breakdown';
import type { Character } from '../characters';
import {
  SHOOTING_UNIT_LABEL,
  SHOOTING_DAY_STATUS_LABEL,
} from '../schedule';
import { pagesLabel } from '../breakdown';

interface CallSheetPdfProps {
  project: Pick<FilmmakerProject, 'id' | 'name' | 'logline'>;
  day: ShootingDay;
  strips: ScheduleStripJoined[];
  /** Cast elements across the day's scenes (already filtered to category='cast'). */
  castElements: BreakdownElement[];
  characters: Character[];
}

export function CallSheetPdf({
  project,
  day,
  strips,
  castElements,
  characters,
}: CallSheetPdfProps): React.ReactElement {
  const characterById = new Map(characters.map((c) => [c.id, c]));

  // Deduplicate principal cast across all strips for this day.
  const principalNames = new Set<string>();
  const principals: { name: string; characterName?: string }[] = [];
  for (const el of castElements) {
    if (!el.isPrincipal) continue;
    const key = el.name.trim().toUpperCase();
    if (principalNames.has(key)) continue;
    principalNames.add(key);
    const character = el.characterId
      ? characterById.get(el.characterId)
      : undefined;
    principals.push({
      name: el.name,
      characterName: character?.name,
    });
  }

  const dayLabel = day.label ?? `Day ${day.dayNumber}`;

  const metaFields = [
    { label: 'Date', value: day.shootDate ?? 'TBD' },
    { label: 'Day', value: String(day.dayNumber) },
    { label: 'Call', value: day.callTime ?? '—' },
    { label: 'Wrap', value: day.wrapTime ?? '—' },
    { label: 'Unit', value: SHOOTING_UNIT_LABEL[day.unit] },
    { label: 'Status', value: SHOOTING_DAY_STATUS_LABEL[day.status] },
  ];

  const stripColumns: PdfTableColumnDef<ScheduleStripJoined>[] = [
    { header: '#', width: 0.06, render: (s) => String(s.scene.sceneNumber) },
    { header: 'Scene', width: 0.32, render: (s) => s.scene.heading },
    {
      header: 'Location',
      width: 0.2,
      render: (s) => s.scene.location ?? '—',
    },
    {
      header: 'I/E',
      width: 0.06,
      render: (s) => (s.scene.interior == null ? '—' : s.scene.interior ? 'INT' : 'EXT'),
    },
    {
      header: 'Time',
      width: 0.1,
      render: (s) => s.scene.timeOfDay ?? '—',
    },
    {
      header: 'Pages',
      width: 0.1,
      render: (s) => (s.sceneMeta ? pagesLabel(s.sceneMeta.eighths) : '—'),
    },
    {
      header: 'Min',
      width: 0.08,
      render: (s) => {
        const m = s.estMinutes ?? s.sceneMeta?.estShootMinutes ?? null;
        return m == null ? '—' : String(m);
      },
    },
    {
      header: 'Notes',
      width: 0.2,
      render: (s) => s.notes ?? '—',
    },
  ];

  return (
    <Document>
      <Page size="LETTER" style={PdfPageStyles.page}>
        <PdfHeader
          title="Call Sheet"
          subtitle={dayLabel}
          projectName={project.name}
        />

        <PdfMetadataBlock fields={metaFields} />

        <Text style={PdfPageStyles.sectionTitle}>Schedule</Text>
        {strips.length === 0 ? (
          <Text style={{ fontSize: 9, color: '#475569' }}>
            No scenes scheduled for this day.
          </Text>
        ) : (
          <PdfTable columns={stripColumns} rows={strips} />
        )}

        <Text style={PdfPageStyles.sectionTitle}>Principal cast</Text>
        {principals.length === 0 ? (
          <Text style={{ fontSize: 9, color: '#475569' }}>
            No principal cast tagged on today's scenes.
          </Text>
        ) : (
          <View>
            {principals.map((p, i) => (
              <View key={`${p.name}-${i}`} style={PdfPageStyles.tableRow} wrap={false}>
                <Text style={[PdfPageStyles.tableCell, { width: '40%' }]}>
                  {p.name}
                </Text>
                <Text style={[PdfPageStyles.tableCell, { width: '60%' }]}>
                  {p.characterName ?? '—'}
                </Text>
              </View>
            ))}
          </View>
        )}

        {day.notes ? (
          <>
            <Text style={PdfPageStyles.sectionTitle}>Notes</Text>
            <Text style={{ fontSize: 9 }}>{day.notes}</Text>
          </>
        ) : null}

        <PdfFooter projectName={project.name} />
      </Page>
    </Document>
  );
}
