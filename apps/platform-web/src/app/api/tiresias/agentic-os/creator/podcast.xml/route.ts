import { NextResponse } from 'next/server';
import { getCreatorPool } from '@/lib/agentic-os/creator/session';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatRfc822(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  function pad(n: number): string {
    return n < 10 ? `0${n}` : `${n}`;
  }
  return `${days[date.getUTCDay()]}, ${pad(date.getUTCDate())} ${
    months[date.getUTCMonth()]
  } ${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(
    date.getUTCMinutes(),
  )}:${pad(date.getUTCSeconds())} GMT`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export async function GET() {
  const pool = getCreatorPool();

  // Fetch the first podcast (per-user podcasts — use the first one found)
  // RSS feeds are public: we find podcasts that have at least one published episode
  const showR = await pool.query(
    `SELECT p.*
       FROM agos_creator_podcasts p
       JOIN agos_creator_episodes e ON e.podcast_id = p.id
      WHERE e.status = 'published'
      GROUP BY p.id
      LIMIT 1`,
  );

  if ((showR.rowCount ?? 0) === 0) {
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
     xmlns:podcast="https://podcastindex.org/namespace/1.0"
     xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>No podcasts configured</title>
    <description>No published podcast episodes available.</description>
  </channel>
</rss>`,
      {
        status: 200,
        headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
      },
    );
  }

  const show = showR.rows[0];

  const epsR = await pool.query(
    `SELECT *
       FROM agos_creator_episodes
      WHERE podcast_id = $1 AND status = 'published'
      ORDER BY season_number DESC NULLS LAST, episode_number DESC NULLS LAST`,
    [show.id],
  );

  const episodes = epsR.rows;

  const buildDate = formatRfc822(new Date());
  const showTitle = escapeXml(show.title ?? 'Untitled Podcast');
  const showDesc = escapeXml(show.description ?? '');
  const showAuthor = escapeXml(show.author ?? 'Unknown');
  const showLink = escapeXml(show.website_url ?? '');
  const showLang = escapeXml(show.language ?? 'en');
  const showExplicit = show.explicit ? 'yes' : 'no';

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
     xmlns:podcast="https://podcastindex.org/namespace/1.0"
     xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${showTitle}</title>
    <link>${showLink}</link>
    <description>${showDesc}</description>
    <language>${showLang}</language>
    <lastBuildDate>${buildDate}</lastBuildDate>
    <itunes:author>${showAuthor}</itunes:author>
    <itunes:summary>${showDesc}</itunes:summary>
    <itunes:explicit>${showExplicit}</itunes:explicit>
    <itunes:type>episodic</itunes:type>`;

  if (show.cover_image_url) {
    xml += `
    <itunes:image href="${escapeXml(show.cover_image_url)}"/>`;
  }

  if (show.category) {
    xml += `
    <itunes:category text="${escapeXml(show.category)}"/>`;
  }

  xml += `
    <podcast:locked>no</podcast:locked>
    <podcast:medium>podcast</podcast:medium>`;

  // Episodes
  for (const ep of episodes) {
    const epTitle = escapeXml(ep.title ?? 'Untitled');
    const epDesc = escapeXml(ep.description ?? '');
    const epGuid = ep.id;
    const epPubDate = ep.published_at ? formatRfc822(new Date(ep.published_at)) : buildDate;
    const epType = ep.episode_type ?? 'full';
    const epNumber = ep.episode_number != null ? String(ep.episode_number) : '';
    const epSeason = ep.season_number != null ? String(ep.season_number) : '';
    const epDuration = ep.duration_seconds != null ? formatDuration(ep.duration_seconds) : '';
    const epUrl = escapeXml(ep.audio_file_url ?? '');
    const epLength = ep.file_size_bytes != null ? String(ep.file_size_bytes) : '';
    const epMime = escapeXml(ep.mime_type ?? 'audio/mpeg');

    xml += `
    <item>
      <title>${epTitle}</title>
      <description>${epDesc}</description>
      <itunes:summary>${epDesc}</itunes:summary>
      <guid isPermaLink="false">${epGuid}</guid>
      <pubDate>${epPubDate}</pubDate>`;

    if (epUrl) {
      xml += `
      <enclosure url="${epUrl}" length="${epLength}" type="${epMime}"/>`;
    }

    xml += `
      <itunes:duration>${epDuration}</itunes:duration>
      <itunes:episodeType>${epType}</itunes:episodeType>`;

    if (epSeason) {
      xml += `
      <itunes:season>${epSeason}</itunes:season>`;
    }

    if (epNumber) {
      xml += `
      <itunes:episode>${epNumber}</itunes:episode>`;
    }

    if (epSeason) {
      xml += `
      <podcast:season>${epSeason}</podcast:season>`;
    }

    if (epNumber) {
      xml += `
      <podcast:episode>${epNumber}</podcast:episode>`;
    }

    xml += `
    </item>`;
  }

  xml += `
  </channel>
</rss>`;

  return new NextResponse(xml, {
    status: 200,
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
}
