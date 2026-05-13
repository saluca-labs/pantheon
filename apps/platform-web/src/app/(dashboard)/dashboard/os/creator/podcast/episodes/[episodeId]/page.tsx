import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import { getPodcast, getEpisode } from '@/lib/agentic-os/creator/podcast-repo';
import { AudioPlayer } from '@/components/agentic-os/creator/audio-player';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ episodeId: string }>;
}

export default async function CreatorEpisodeDetailPage({ params }: Props) {
  const user = await getCurrentCreatorUser();
  if (!user) redirect('/login');

  const { episodeId } = await params;

  if (episodeId === 'new') redirect('/dashboard/os/creator/podcast');

  const episode = await getEpisode(episodeId, user.userId);
  if (!episode) notFound();

  const podcast = await getPodcast(user.userId);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <a
          href="/dashboard/os/creator/podcast"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to episodes
        </a>
        <div className="flex items-center gap-3">
          <a
            href={`/dashboard/os/creator/podcast/episodes/${episode.id}/edit`}
            className="inline-flex items-center rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            Edit
          </a>
          {episode.status === 'draft' && (
            <a
              href={`/dashboard/os/creator/podcast/episodes/${episode.id}/edit`}
              className="inline-flex items-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400 transition-colors"
            >
              Publish
            </a>
          )}
        </div>
      </div>

      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          {episode.seasonNumber != null && (
            <span className="text-xs font-medium text-zinc-500">
              S{episode.seasonNumber}
            </span>
          )}
          {episode.episodeNumber != null && (
            <span className="text-xs font-medium text-zinc-500">
              E{episode.episodeNumber}
            </span>
          )}
          <span className="inline-flex items-center rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400 capitalize">
            {episode.episodeType}
          </span>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            episode.status === 'published'
              ? 'bg-emerald-500/20 text-emerald-300'
              : episode.status === 'archived'
              ? 'bg-amber-500/20 text-amber-300'
              : 'bg-gray-500/20 text-gray-300'
          }`}>
            {episode.status}
          </span>
        </div>
        <h1 className="text-2xl font-bold text-zinc-100">{episode.title}</h1>
        {podcast?.author && (
          <p className="text-sm text-zinc-500 mt-1">{podcast.author}</p>
        )}
        {episode.publishedAt && (
          <p className="text-xs text-zinc-600 mt-1">
            Published {new Date(episode.publishedAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        )}
      </div>

      {/* Audio Player */}
      {episode.audioFileUrl && (
        <AudioPlayer audioUrl={episode.audioFileUrl} title={episode.title} />
      )}

      {/* Description */}
      {episode.description && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <h2 className="text-sm font-medium text-zinc-400 mb-2">Description</h2>
          <p className="text-sm text-zinc-300 whitespace-pre-wrap">{episode.description}</p>
        </div>
      )}

      {/* Show Notes */}
      {episode.notesMd && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <h2 className="text-sm font-medium text-zinc-400 mb-3">Show Notes</h2>
          <pre className="text-sm text-zinc-300 font-mono whitespace-pre-wrap overflow-x-auto">
            {episode.notesMd}
          </pre>
        </div>
      )}

      {/* Metadata */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
        <h2 className="text-sm font-medium text-zinc-400 mb-3">Details</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          {episode.durationSeconds != null && (
            <>
              <dt className="text-zinc-500">Duration</dt>
              <dd className="text-zinc-300">
                {Math.floor(episode.durationSeconds / 60)}m {episode.durationSeconds % 60}s
              </dd>
            </>
          )}
          {episode.mimeType && (
            <>
              <dt className="text-zinc-500">Format</dt>
              <dd className="text-zinc-300 font-mono text-xs">{episode.mimeType}</dd>
            </>
          )}
          {episode.fileSizeBytes != null && (
            <>
              <dt className="text-zinc-500">File Size</dt>
              <dd className="text-zinc-300">
                {(episode.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB
              </dd>
            </>
          )}
        </dl>
      </div>
    </div>
  );
}
