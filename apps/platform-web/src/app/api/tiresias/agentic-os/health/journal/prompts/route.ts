import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import { listJournalPrompts } from '@/lib/agentic-os/health/repo';
import {
  JOURNAL_PROMPT_CATEGORIES,
  type JournalPromptCategoryValue,
} from '@/lib/agentic-os/health/schemas';

/**
 * GET — list seeded journal prompts. Optional ?category= filter.
 *
 * Auth required but no consent gate; the prompt catalog is generic
 * content (not the user's data) and is also referenced from
 * marketing/help surfaces.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentHealthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(request.url);
  const cat = url.searchParams.get('category');
  let category: JournalPromptCategoryValue | undefined;
  if (cat) {
    if ((JOURNAL_PROMPT_CATEGORIES as readonly string[]).includes(cat)) {
      category = cat as JournalPromptCategoryValue;
    } else {
      return NextResponse.json(
        { error: `Unknown category: ${cat}` },
        { status: 400 },
      );
    }
  }
  const prompts = await listJournalPrompts(category ? { category } : {});
  return NextResponse.json({ prompts });
}
