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
import { normalizeCaseTab } from '@/components/agentic-os/cyber/cases/CaseWorkspaceTabs';
import { AskCoachButton } from '@/components/agentic-os/cyber/coach/AskCoachButton';

export const dynamic = 'force-dynamic';

export default async function CaseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { caseId } = await params;
  const { tab } = await searchParams;
  const user = await getCurrentCyberUser();
  if (!user) redirect('/login');

  const caseDetail = await getCaseDetail(caseId, user.userId);
  if (!caseDetail) notFound();

  // Validate the `?tab=` deep-link server-side so the workspace seeds a known
  // tab key (falls back to `overview` for absent / unknown values).
  const activeTab = normalizeCaseTab(tab);

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
      <CaseDetailWorkspace caseDetail={caseDetail} activeTab={activeTab} />
    </>
  );
}
