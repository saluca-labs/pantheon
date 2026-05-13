import { NextResponse } from 'next/server';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import { listPosts } from '@/lib/agentic-os/creator/posts-repo';
import type { CreatorPost } from '@/lib/agentic-os/creator/posts';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function tipTapToPlainText(content: Record<string, unknown>): string {
  // Simple recursive extraction of text from TipTap JSON
  function extract(node: any): string {
    if (!node) return '';
    if (typeof node === 'string') return node;
    if (node.text) return node.text;
    if (node.content && Array.isArray(node.content)) {
      return node.content.map(extract).join('');
    }
    return '';
  }
  return extract(content);
}

function postToRssItem(post: CreatorPost, baseUrl: string): string {
  const title = escapeXml(post.title);
  const link = `${baseUrl}/dashboard/os/creator/posts/${post.id}`;
  const guid = `<guid isPermaLink="false">${post.id}</guid>`;
  const pubDate = post.publishedAt
    ? `<pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>`
    : '';
  const description = post.excerpt
    ? `<description>${escapeXml(post.excerpt)}</description>`
    : '';
  const contentEncoded = `<content:encoded><![CDATA[${
    tipTapToPlainText(post.content)
  }]]></content:encoded>`;
  const author = '<author>Creator</author>';
  const tags = post.tags.length > 0
    ? post.tags
        .map(
          (tag) => `<category>${escapeXml(tag)}</category>`,
        )
        .join('\n      ')
    : '';

  return `
    <item>
      <title>${title}</title>
      <link>${link}</link>
      ${guid}
      ${pubDate}
      ${description}
      ${contentEncoded}
      ${author}
      ${tags}
    </item>`;
}

export async function GET() {
  const user = await getCurrentCreatorUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const posts = await listPosts(user.userId, {
    status: 'published',
    limit: 50,
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tiresias.network';

  const items = posts.map((p) => postToRssItem(p, baseUrl)).join('');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss
  version="2.0"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:atom="http://www.w3.org/2005/Atom"
>
  <channel>
    <title>Created Content</title>
    <link>${baseUrl}/dashboard/os/creator/posts</link>
    <description>Latest published posts from Creator OS</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link
      href="${baseUrl}/api/tiresias/agentic-os/creator/rss.xml"
      rel="self"
      type="application/rss+xml"
    />${items}
  </channel>
</rss>`;

  return new NextResponse(rss, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}
