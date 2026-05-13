import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import { getVideo } from '@/lib/agentic-os/creator/video-repo';
import { VideoPlayer } from '@/components/agentic-os/creator/video-player';
import { VideoForm } from '@/components/agentic-os/creator/video-form';
import { DeleteVideoButton } from '@/components/agentic-os/creator/delete-video-button';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ videoId: string }>;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return 'Unknown';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default async function CreatorVideoDetailPage({ params }: Props) {
  const user = await getCurrentCreatorUser();
  if (!user) redirect('/login');

  const { videoId } = await params;
  const video = await getVideo(videoId, user.userId);
  if (!video) notFound();

  return (
    <div className="space-y-6">
      {/* Back link */}
      <a
        href="/dashboard/os/creator/videos"
        className="inline-flex items-center gap-1.5 text-sm text-[#64748b] hover:text-white transition-colors"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to videos
      </a>

      {/* Player */}
      <VideoPlayer src={video.url} title={video.title} />

      {/* Metadata */}
      <div className="rounded-lg border border-[#2a2d3e] bg-[#1a1d27] p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold text-white mb-1">
              {video.title}
            </h1>
            {video.description && (
              <p className="text-sm text-[#94a3b8] mb-4">{video.description}</p>
            )}

            <div className="flex flex-wrap items-center gap-4 text-xs text-[#64748b]">
              <span className="inline-flex items-center gap-1">
                <span className="text-[#475569]">URL:</span>
                <code className="text-[#94a3b8] font-mono max-w-[400px] truncate">
                  {video.url}
                </code>
              </span>
              <span>
                <span className="text-[#475569]">Duration:</span>{' '}
                {formatDuration(video.durationSeconds)}
              </span>
              <span>
                <span className="text-[#475569]">Status:</span>{' '}
                <span
                  className={`inline-block px-1.5 py-0.5 rounded-full font-medium ${
                    video.status === 'ready'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : video.status === 'processing'
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-red-500/20 text-red-400'
                  }`}
                >
                  {video.status}
                </span>
              </span>
              <span>
                <span className="text-[#475569]">Added:</span>{' '}
                {new Date(video.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>

          <DeleteVideoButton videoId={video.id} />
        </div>
      </div>

      {/* Edit form */}
      <div className="rounded-lg border border-[#2a2d3e] bg-[#1a1d27] p-6">
        <h2 className="text-sm font-semibold text-white mb-4">
          Edit Video Details
        </h2>
        <VideoForm video={video} />
      </div>
    </div>
  );
}
