/**
 * CyberSec OS — IOC list-row card.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { Hash, Clock } from 'lucide-react';
import type { Ioc } from '@/lib/agentic-os/cyber/iocs';
import { isIocExpired } from '@/lib/agentic-os/cyber/iocs';

export function IocCard({ ioc }: { ioc: Ioc }) {
  const expired = isIocExpired(ioc);
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-2 p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Hash className="w-4 h-4 text-accent shrink-0" />
          <span className="text-sm font-mono text-white truncate" title={ioc.value}>
            {ioc.value}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border border-border-subtle text-text-secondary">
            {ioc.kind}
          </span>
          {ioc.threatType && (
            <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border border-danger/30 text-danger">
              {ioc.threatType}
            </span>
          )}
          {expired && (
            <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border border-warning/30 text-warning">
              expired
            </span>
          )}
        </div>
      </div>
      {ioc.title && <p className="text-xs text-white mb-1">{ioc.title}</p>}
      {ioc.description && (
        <p className="text-xs text-text-primary mb-2">{ioc.description}</p>
      )}
      <div className="flex items-center gap-x-3 gap-y-1 text-[11px] text-text-secondary flex-wrap">
        <span>Conf {ioc.confidence}</span>
        {ioc.source && <span>via {ioc.source}</span>}
        <span className="inline-flex items-center gap-1">
          <Clock className="w-3 h-3" />
          last seen {ioc.lastSeenAt.slice(0, 10)}
        </span>
        {ioc.expiresAt && <span>expires {ioc.expiresAt.slice(0, 10)}</span>}
      </div>
      {ioc.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {ioc.tags.slice(0, 5).map((t) => (
            <span
              key={t}
              className="text-[10px] px-1.5 py-0.5 rounded border border-border-subtle text-text-secondary"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
