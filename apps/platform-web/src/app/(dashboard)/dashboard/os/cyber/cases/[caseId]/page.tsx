/**
 * CyberSec OS — Case detail page.
 *
 * Server component. Fetches case + linkedAlerts + events + evidence + tasks,
 * renders the tabbed workspace.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { notFound, redirect } from 'next/navigation';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { getCaseDetail } from '@/lib/agentic-os/cyber/repo';
import { CaseDetailWorkspace } from '@/components/agentic-os/cyber/cases/CaseDetailWorkspace';

export const dynamic = 'force-dynamic';

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const user = await getCurrentCyberUser();
  if (!user) redirect('/login');

  const caseDetail = await getCaseDetail(caseId, user.userId);
  if (!caseDetail) notFound();

  return <CaseDetailWorkspace caseDetail={caseDetail} />;
}
