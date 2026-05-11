/**
 * Filmmaker OS — Storyboard PDF template.
 *
 * Two panels per row, paginates naturally with @react-pdf/renderer's
 * `wrap` flag.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import * as React from 'react';
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  PdfHeader,
  PdfFooter,
  PdfPageStyles,
} from '../../_shared/pdf/primitives';
import type { FilmmakerProject } from '../projects';
import type { Storyboard, StoryboardPanel } from '../storyboards';
import { STORYBOARD_STATUS_LABEL } from '../storyboards';

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
  },
  panel: {
    width: '50%',
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  panelCard: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 2,
    padding: 6,
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  panelPos: {
    fontSize: 9,
    fontWeight: 700,
  },
  panelDuration: {
    fontSize: 8,
    color: '#475569',
  },
  panelImage: {
    width: '100%',
    height: 110,
    objectFit: 'contain',
    backgroundColor: '#f1f5f9',
    marginBottom: 4,
  },
  panelImagePlaceholder: {
    width: '100%',
    height: 110,
    backgroundColor: '#f1f5f9',
    borderColor: '#cbd5e1',
    borderWidth: 1,
    borderStyle: 'dashed',
    marginBottom: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 3,
  },
  panelBadge: {
    fontSize: 7,
    color: '#0f172a',
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 4,
    paddingVertical: 1,
    marginRight: 3,
    marginBottom: 2,
    borderRadius: 2,
  },
  panelDesc: {
    fontSize: 8,
    marginBottom: 2,
  },
  panelDialogue: {
    fontSize: 7,
    fontStyle: 'italic',
    color: '#475569',
  },
});

interface StoryboardPdfProps {
  project: Pick<FilmmakerProject, 'id' | 'name' | 'logline'>;
  storyboard: Storyboard;
  panels: StoryboardPanel[];
  sceneHeading?: string | null;
}

function isUsableImageUrl(url: string | null): url is string {
  if (!url) return false;
  return /^https?:\/\//i.test(url);
}

export function StoryboardPdf({
  project,
  storyboard,
  panels,
  sceneHeading,
}: StoryboardPdfProps): React.ReactElement {
  const subtitleParts: string[] = [storyboard.name];
  if (sceneHeading) subtitleParts.push(sceneHeading);
  subtitleParts.push(STORYBOARD_STATUS_LABEL[storyboard.status]);

  return (
    <Document>
      <Page size="LETTER" style={PdfPageStyles.page}>
        <PdfHeader
          title="Storyboard"
          subtitle={subtitleParts.join(' · ')}
          projectName={project.name}
        />

        {storyboard.description ? (
          <Text style={{ fontSize: 9, color: '#475569', marginBottom: 6 }}>
            {storyboard.description}
          </Text>
        ) : null}

        {panels.length === 0 ? (
          <Text style={{ fontSize: 10, color: '#475569' }}>
            No panels yet — add the first beat in the editor.
          </Text>
        ) : (
          <View style={styles.grid}>
            {panels.map((p) => (
              <View key={p.id} style={styles.panel} wrap={false}>
                <View style={styles.panelCard}>
                  <View style={styles.panelHeader}>
                    <Text style={styles.panelPos}>Panel {p.position}</Text>
                    {p.durationSeconds != null ? (
                      <Text style={styles.panelDuration}>
                        {p.durationSeconds}s
                      </Text>
                    ) : null}
                  </View>
                  {isUsableImageUrl(p.imageUrl) ? (
                    <Image src={p.imageUrl} style={styles.panelImage} />
                  ) : (
                    <View style={styles.panelImagePlaceholder}>
                      <Text style={{ fontSize: 8, color: '#94a3b8' }}>
                        No image
                      </Text>
                    </View>
                  )}
                  <View style={styles.panelBadges}>
                    {p.shotSize ? (
                      <Text style={styles.panelBadge}>{p.shotSize}</Text>
                    ) : null}
                    {p.cameraAngle ? (
                      <Text style={styles.panelBadge}>{p.cameraAngle}</Text>
                    ) : null}
                    {p.cameraMove ? (
                      <Text style={styles.panelBadge}>{p.cameraMove}</Text>
                    ) : null}
                  </View>
                  {p.description ? (
                    <Text style={styles.panelDesc}>{p.description}</Text>
                  ) : null}
                  {p.dialogueExcerpt ? (
                    <Text style={styles.panelDialogue}>
                      "{p.dialogueExcerpt}"
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        )}

        <PdfFooter projectName={project.name} />
      </Page>
    </Document>
  );
}
