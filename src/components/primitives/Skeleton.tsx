/**
 * Loading skeletons. Every list/feed screen shows these instead of bare
 * "Loading…" text so the layout never jumps when real data arrives.
 */

export function Skeleton({
  w = "100%",
  h = 12,
  r = 6,
  style,
}: {
  w?: number | string;
  h?: number | string;
  r?: number;
  style?: React.CSSProperties;
}) {
  return <div aria-hidden className="pp-skeleton" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

/** Mirrors the feed ReleaseCard layout (publisher row, copy block, media). */
export function FeedCardSkeleton() {
  return (
    <div className="pp-card" style={{ padding: 18 }} aria-hidden>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <Skeleton w={40} h={40} r={999} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
          <Skeleton w={160} h={13} />
          <Skeleton w={90} h={11} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 18, marginTop: 16 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
          <Skeleton w={104} h={20} r={6} />
          <Skeleton w="92%" h={16} />
          <Skeleton w="70%" h={16} />
          <Skeleton w="88%" h={12} style={{ marginTop: 2 }} />
          <Skeleton w="52%" h={12} />
        </div>
        <Skeleton w={208} h={152} r={12} style={{ flexShrink: 0 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, paddingTop: 13, borderTop: "1px solid var(--border)" }}>
        <Skeleton w={120} h={13} />
        <Skeleton w={220} h={13} />
      </div>
    </div>
  );
}

/** Compact row skeleton for saved cards, tables and list panels. */
export function ListRowSkeleton({ media = true }: { media?: boolean }) {
  return (
    <div className="pp-card" style={{ padding: 16, display: "flex", gap: 16 }} aria-hidden>
      {media && <Skeleton w={168} h={120} r={10} style={{ flexShrink: 0 }} />}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, justifyContent: "center" }}>
        <Skeleton w={96} h={18} r={6} />
        <Skeleton w="82%" h={15} />
        <Skeleton w="46%" h={12} />
      </div>
    </div>
  );
}

/** Metric tile skeleton for the institution dashboards. */
export function MetricCardSkeleton() {
  return (
    <div className="pp-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }} aria-hidden>
      <Skeleton w={92} h={11} />
      <Skeleton w={64} h={24} />
      <Skeleton w={72} h={10} />
    </div>
  );
}

/** Full-width skeleton group with an accessible loading status for screen readers. */
export function FeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {Array.from({ length: count }, (_, i) => (
        <FeedCardSkeleton key={i} />
      ))}
    </div>
  );
}
