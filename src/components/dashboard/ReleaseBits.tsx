import type { ReleaseStatus, MediaScene } from "@/types";
import { MediaTile } from "@/components/media/MediaTile";

const STATUS_STYLES: Record<ReleaseStatus, { color: string; bg: string }> = {
  Published: { color: "var(--green)", bg: "rgba(52,211,153,0.12)" },
  Scheduled: { color: "var(--blue)", bg: "rgba(59,130,246,0.12)" },
  "Awaiting Review": { color: "var(--amber)", bg: "rgba(251,191,36,0.12)" },
  Draft: { color: "var(--text-secondary)", bg: "rgba(255,255,255,0.06)" },
  Archived: { color: "var(--text-muted)", bg: "rgba(255,255,255,0.04)" },
};

/** Coloured status pill (Published / Scheduled / Draft / Archived). */
export function StatusPill({ status }: { status: ReleaseStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        fontWeight: 600,
        color: s.color,
        background: s.bg,
        padding: "3px 9px",
        borderRadius: 999,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: s.color }} />
      {status}
    </span>
  );
}

/** Fixed-size media thumbnail used inside dashboard / table rows. */
export function MediaThumb({
  scene,
  w,
  h,
  radius = 8,
}: {
  scene: MediaScene;
  w: number;
  h: number;
  radius?: number;
}) {
  return (
    <div style={{ width: w, height: h, flexShrink: 0 }}>
      <MediaTile scene={scene} radius={radius} />
    </div>
  );
}
