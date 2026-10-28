import type { ReleaseType } from "@/types";

const TYPE_COLORS: Record<ReleaseType, string> = {
  Announcement: "var(--type-announcement)",
  Consultation: "var(--type-consultation)",
  Publication: "var(--type-publication)",
  "Statistics & Research": "var(--type-statistics)",
  Report: "var(--type-report)",
  "Press Release": "var(--type-press)",
  Legislation: "var(--type-legislation)",
};

export function typeColor(type: ReleaseType): string {
  return TYPE_COLORS[type];
}

/** Small coloured release-type pill. `solid` gives the filled-bg variant used on cards. */
export function TypeBadge({
  type,
  size = "md",
}: {
  type: ReleaseType;
  size?: "sm" | "md";
}) {
  const color = TYPE_COLORS[type];
  return (
    <span
      className="pp-badge"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        fontSize: size === "sm" ? "11px" : "11.5px",
        padding: size === "sm" ? "2px 8px" : "3px 9px",
      }}
    >
      {type}
    </span>
  );
}
