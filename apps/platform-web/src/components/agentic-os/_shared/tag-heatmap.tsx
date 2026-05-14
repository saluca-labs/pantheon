/**
 * Reusable tag-vs-bucket heatmap. OS-agnostic — callers supply tag rows,
 * the bucket ordering, and the tag ordering. Color intensity scales with
 * cell count relative to the dataset max.
 *
 * Cells with zero count render an empty muted square; cells with N > 0
 * render the count and a primary-tinted background whose opacity tracks
 * `count / max`. Hover surfaces the tag + bucket + count via the title
 * attribute so screen-readers + tooltips both work without extra deps.
 */

export interface TagHeatmapCell {
  tag: string;
  bucket: string;
  count: number;
}

export interface TagHeatmapProps {
  data: TagHeatmapCell[];
  /** Buckets across the x-axis, left to right. */
  buckets: string[];
  /** Tags down the y-axis, top to bottom. Empty array = derive from data. */
  tags?: string[];
  /** Optional empty-state message. */
  emptyLabel?: string;
}

export function TagHeatmap({
  data,
  buckets,
  tags,
  emptyLabel = 'No tagged entries in this window yet.',
}: TagHeatmapProps) {
  // Build a lookup table and derive tag rows if none provided.
  const lookup = new Map<string, number>();
  const seenTags = new Set<string>();
  let max = 0;
  for (const cell of data) {
    lookup.set(`${cell.tag}::${cell.bucket}`, cell.count);
    seenTags.add(cell.tag);
    if (cell.count > max) max = cell.count;
  }
  const rows = tags && tags.length > 0 ? tags : Array.from(seenTags).sort();

  if (rows.length === 0 || buckets.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border-subtle bg-surface-0/40 p-6 text-xs text-text-secondary text-center">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="text-left text-[10px] uppercase tracking-wide text-text-secondary font-normal pr-2 sticky left-0 bg-transparent">
              Tag
            </th>
            {buckets.map((b) => (
              <th
                key={b}
                className="text-center text-[10px] uppercase tracking-wide text-text-secondary font-normal px-1 py-1"
              >
                {b}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((tag) => (
            <tr key={tag}>
              <th className="text-left text-xs text-text-primary font-medium pr-2 py-1 sticky left-0 bg-transparent whitespace-nowrap">
                {tag}
              </th>
              {buckets.map((bucket) => {
                const count = lookup.get(`${tag}::${bucket}`) ?? 0;
                const intensity = max > 0 ? count / max : 0;
                return (
                  <td
                    key={bucket}
                    title={`${tag} · ${bucket}: ${count}`}
                    className="text-center font-medium rounded-md border border-border-subtle"
                    style={{
                      backgroundColor:
                        count === 0
                          ? 'transparent'
                          : `rgba(67, 97, 238, ${0.15 + intensity * 0.7})`,
                      color: count === 0 ? '#475569' : '#fff',
                      minWidth: 36,
                      height: 30,
                    }}
                  >
                    {count > 0 ? count : ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
