/**
 * Filmmaker OS — Shot List PDF template.
 *
 * Composed from the OS-agnostic `_shared/pdf` primitives.
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
  PdfTable,
  PdfPageStyles,
  type PdfTableColumnDef,
} from '../../_shared/pdf/primitives';
import type { FilmmakerProject } from '../projects';
import type { ShotListEntry } from '../shots';

interface ShotListPdfProps {
  project: Pick<FilmmakerProject, 'id' | 'name' | 'logline'>;
  shots: ShotListEntry[];
}

export function ShotListPdf({
  project,
  shots,
}: ShotListPdfProps): React.ReactElement {
  const columns: PdfTableColumnDef<ShotListEntry>[] = [
    { header: 'Scene', width: 0.06, render: (s) => s.sceneNumber },
    { header: 'Shot', width: 0.06, render: (s) => s.shotNumber },
    { header: 'Type', width: 0.08, render: (s) => s.shotType },
    { header: 'Move', width: 0.1, render: (s) => s.cameraMove },
    { header: 'Subject', width: 0.18, render: (s) => s.subject || '—' },
    { header: 'Description', width: 0.36, render: (s) => s.description || '—' },
    {
      header: 'Sec',
      width: 0.08,
      render: (s) =>
        s.estimatedSeconds == null ? '—' : String(s.estimatedSeconds),
    },
    { header: 'Done', width: 0.08, render: (s) => (s.completed ? 'X' : '—') },
  ];

  return (
    <Document>
      <Page size="LETTER" style={PdfPageStyles.page}>
        <PdfHeader
          title="Shot List"
          subtitle={project.logline ?? undefined}
          projectName={project.name}
        />
        {shots.length === 0 ? (
          <View>
            <Text style={{ fontSize: 10, color: '#475569' }}>
              No shots yet — add coverage in the shot list builder.
            </Text>
          </View>
        ) : (
          <PdfTable columns={columns} rows={shots} />
        )}
        <PdfFooter projectName={project.name} />
      </Page>
    </Document>
  );
}
