/**
 * CyberSec OS — Case detail page.
 *
 * Server component. Fetches case + linkedAlerts + events + evidence + tasks,
 * renders the tabbed workspace.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { notFound, redirect } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { getCurrentCyberUser } from '@/lib/agentic-os/cyber/session';
import { getCaseDetail } from '@/lib/agentic-os/cyber/repo';
import { isCoachConfigured } from '@/lib/agentic-os/cyber/coach/anthropic';
import { CaseDetailWorkspace } from '@/components/agentic-os/cyber/cases/CaseDetailWorkspace';
import { AskCoachButton } from '@/components/agentic-os/cyber/coach/AskCoachButton';

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

  return (
    <>
      {isCoachConfigured() && (
        <div className="flex justify-end mb-3">
          <AskCoachButton caseId={caseId}>
            <Sparkles className="w-3.5 h-3.5" />
            Ask coach about this case
          </AskCoachButton>
        </div>
      )}
      <CaseDetailWorkspace caseDetail={caseDetail} />
    </>
  );
}
