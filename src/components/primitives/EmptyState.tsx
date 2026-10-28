import type { ReactNode } from "react";

/**
 * The one empty state used across the app: soft icon disc, a clear title,
 * a one-line explanation and (almost always) an action that moves the user
 * forward. Empty screens should never be dead ends.
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
  compact = false,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="pp-card" style={{ padding: compact ? "34px 24px" : "56px 24px", textAlign: "center" }}>
      {icon && (
        <span
          aria-hidden
          style={{
            width: 52,
            height: 52,
            borderRadius: 16,
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            display: "grid",
            placeItems: "center",
            margin: "0 auto 16px",
            color: "var(--text-muted)",
          }}
        >
          {icon}
        </span>
      )}
      <p style={{ fontSize: 15.5, fontWeight: 600, color: "var(--text)" }}>{title}</p>
      {body && (
        <p style={{ fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.6, marginTop: 6, maxWidth: 400, marginLeft: "auto", marginRight: "auto" }}>
          {body}
        </p>
      )}
      {action && <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 20 }}>{action}</div>}
    </div>
  );
}
