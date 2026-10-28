import type { ReactNode } from "react";
import { Delta, ProgressBar } from "@/components/primitives/Bits";

/** Display configuration for a metric backed by a runtime data source. */
export interface Metric {
  label: string;
  value: string;
  delta: string;
  positive: boolean;
  color: string;
}

/** Page title block used at the top of every institution screen. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22, gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "0" }}>{title}</h1>
        {subtitle && (
          <p style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 5 }}>{subtitle}</p>
        )}
      </div>
      {actions && <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>{actions}</div>}
    </div>
  );
}

/** A titled card panel with an optional right-aligned action. */
export function Panel({
  title,
  action,
  children,
  style,
  bodyStyle,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  style?: React.CSSProperties;
  bodyStyle?: React.CSSProperties;
}) {
  return (
    <section className="pp-card" style={{ display: "flex", flexDirection: "column", ...style }}>
      {(title || action) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 18px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          {typeof title === "string" ? <h2 className="pp-section-title">{title}</h2> : title}
          {action}
        </div>
      )}
      <div style={{ padding: 18, ...bodyStyle }}>{children}</div>
    </section>
  );
}

/** Metric tile. Values are supplied by the page's runtime data source. */
export function MetricCard({ metric }: { metric: Metric }) {
  return (
    <div className="pp-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: "var(--text-secondary)" }}>
        <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: metric.color }} />
        {metric.label}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: "0" }}>{metric.value}</span>
      </div>
      <Delta value={metric.delta} positive={metric.positive} neutral={!/^[+-]/.test(metric.delta)} />
    </div>
  );
}

/** A labelled meter row (content types, topics, engagement breakdowns…). */
export function BarRow({
  label,
  value,
  pct,
  color = "var(--blue)",
  icon,
}: {
  label: string;
  value: string;
  pct: number;
  color?: string;
  icon?: ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13.5, color: "var(--text)" }}>
          {icon}
          {label}
        </span>
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{value}</span>
      </div>
      <ProgressBar pct={pct} color={color} />
    </div>
  );
}

/** Legend item beside donut charts. */
export function LegendRow({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <span style={{ width: 9, height: 9, borderRadius: 3, background: color, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 13, color: "var(--text-secondary)" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

/** Simple stat tile (icon + value + label), used in activity strips. */
export function StatTile({
  icon,
  value,
  label,
  delta,
  positive,
  neutral,
}: {
  icon?: ReactNode;
  value: string;
  label: string;
  delta?: string;
  positive?: boolean;
  neutral?: boolean;
}) {
  return (
    <div className="pp-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-muted)" }}>
        {icon}
        <span style={{ fontSize: 12.5 }}>{label}</span>
      </div>
      <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: "0" }}>{value}</div>
      {delta && <Delta value={delta} positive={positive} neutral={neutral} />}
    </div>
  );
}
