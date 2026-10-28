import { Link, useSearchParams } from "react-router-dom";
import { Eye, MessageSquare, Plus, ShieldAlert, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/shells/AppShell";
import { PageHeader, Panel, MetricCard, BarRow, type Metric } from "@/components/dashboard/Panels";
import { MetricCardSkeleton, Skeleton } from "@/components/primitives/Skeleton";
import { StatusPill, MediaThumb } from "@/components/dashboard/ReleaseBits";
import { TypeBadge } from "@/components/release/ReleaseTypeBadge";
import { LineChart } from "@/components/charts/LineChart";
import { rowToRelease, formatCount } from "@/lib/releaseMap";
import { useInstitutionStats } from "@/lib/useInstitutionStats";
import { useOrg } from "@/lib/useOrg";
import { useAuth } from "@/auth/AuthProvider";
import { usePageTitle } from "@/lib/usePageTitle";
import type { Release } from "@/types";

/** The six analytics time ranges (label → number of days). */
export const RANGES: [string, number][] = [
  ["Today", 1],
  ["3D", 3],
  ["7D", 7],
  ["1M", 30],
  ["6M", 180],
  ["12M", 365],
];
export const RANGE_LABEL: Record<number, string> = {
  1: "today",
  3: "last 3 days",
  7: "last 7 days",
  30: "last 30 days",
  180: "last 6 months",
  365: "last 12 months",
};

function rangeFromSearchParam(value: string | null, fallback: number): number {
  const days = Number(value);
  return RANGES.some(([, d]) => d === days) ? days : fallback;
}

function RangeTabs({ days, onChange }: { days: number; onChange: (d: number) => void }) {
  return (
    <div style={{ display: "flex", gap: 4, background: "var(--surface-2)", borderRadius: "var(--r-sm)", padding: 3 }}>
      {RANGES.map(([label, d]) => (
        <button
          key={label}
          type="button"
          onClick={() => onChange(d)}
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: "5px 11px",
            borderRadius: 6,
            background: days === d ? "var(--surface-3)" : "transparent",
            color: days === d ? "var(--text)" : "var(--text-muted)",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <div style={{ display: "flex", gap: 18, marginTop: 12 }}>
      {items.map(([label, color]) => (
        <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--text-secondary)" }}>
          <span style={{ width: 10, height: 3, borderRadius: 2, background: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}

export function Dashboard() {
  usePageTitle("Dashboard");
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const days = rangeFromSearchParam(params.get("range"), 30);
  const setDays = (nextDays: number) => {
    const p = new URLSearchParams(params);
    p.set("range", String(nextDays));
    setParams(p);
  };
  const stats = useInstitutionStats(days);
  const org = useOrg();
  if (stats.error) {
    return (
      <AppShell kind="institution">
        <PageHeader title="Dashboard" subtitle={profile?.institution_name ? `${profile.institution_name} publishing overview.` : "Your publishing overview."} />
        <div className="pp-card" role="alert" style={{ padding: 30, textAlign: "center", color: "var(--text-secondary)" }}>{stats.error} Refresh the page to try again.</div>
      </AppShell>
    );
  }

  if (!stats.loaded) {
    return (
      <AppShell kind="institution">
        <PageHeader title="Dashboard" subtitle={profile?.institution_name ? `${profile.institution_name} publishing overview.` : "Your publishing overview."} />
        <div role="status" aria-label="Loading organisation data">
          <div className="pp-metrics-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 18 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <MetricCardSkeleton key={i} />
            ))}
          </div>
          <div className="pp-responsive-grid" style={{ display: "grid", gridTemplateColumns: "1.62fr 1fr", gap: 18, alignItems: "start" }}>
            <div className="pp-card" style={{ padding: 18 }}>
              <Skeleton w={180} h={15} style={{ marginBottom: 18 }} />
              <Skeleton w="100%" h={236} r={10} />
            </div>
            <div className="pp-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
              <Skeleton w={140} h={15} />
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} w="100%" h={40} r={8} />
              ))}
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  const realSeries = stats.viewSeries;
  const dayLabels = realSeries.map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (realSeries.length - 1 - i));
    return d.toLocaleDateString("en-GB", { day: "numeric", month: realSeries.length > 60 ? "short" : undefined });
  });
  const hasRealSeries = realSeries.length > 0 && realSeries.some((n) => n > 0);
  const chartSeries = [{ data: realSeries.length ? realSeries : [0], color: "var(--series-1)" }];
  const chartXLabels = dayLabels.length ? dayLabels : [""];
  const chartYMax = Math.max(10, Math.ceil(Math.max(...realSeries, 0) * 1.25));
  const chartLegend: [string, string][] = [[`Views (${RANGE_LABEL[days] ?? "range"})`, "var(--series-1)"]];

  const metrics: Metric[] = [
    { label: "Total views", value: formatCount(stats.totalViews), delta: "all time", positive: true, color: "var(--series-1)" },
    { label: "Followers", value: formatCount(stats.followers), delta: "all time", positive: true, color: "var(--series-2)" },
    { label: "Releases", value: String(stats.releaseCount), delta: `${stats.publishedCount} published`, positive: true, color: "var(--series-3)" },
    { label: "Comments", value: formatCount(stats.totalComments), delta: "all time", positive: true, color: "var(--series-4)" },
    { label: "Drafts", value: String(stats.draftCount), delta: stats.scheduledCount ? `${stats.scheduledCount} scheduled` : "none scheduled", positive: true, color: "var(--series-5)" },
  ];

  const recent: Release[] = stats.releases.slice(0, 4).map(rowToRelease);
  const topReleases = [...stats.releases]
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
    .slice(0, 5)
    .map((r, idx) => ({ rank: idx + 1, heading: r.heading, type: r.type, views: formatCount(r.views ?? 0), scene: r.scene as Release["scene"] }));

  const topicData = (() => {
    const byType = new Map<string, number>();
    stats.releases.forEach((r) => byType.set(r.type, (byType.get(r.type) ?? 0) + (r.views ?? 0)));
    const max = Math.max(1, ...byType.values());
    return [...byType.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, v], i) => ({ name, views: formatCount(v), pct: Math.round((v / max) * 100), color: `var(--series-${(i % 5) + 1})` }));
  })();

  // Real release-status breakdown (replaces the untracked "country" panel live).
  const statusData = [
    { name: "Published", count: stats.publishedCount },
    { name: "Drafts", count: stats.draftCount },
    { name: "Scheduled", count: stats.scheduledCount },
  ];
  const statusMax = Math.max(1, ...statusData.map((s) => s.count));

  return (
    <AppShell kind="institution">
      {org.available && !org.verified && (
        <Link
          to={org.role === "owner" ? "/inst/profile" : "/inst/team"}
          className="pp-card"
          style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, marginBottom: 18, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)" }}
        >
          <ShieldAlert size={20} color="#b45309" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>Your organisation isn't verified yet</div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
              {org.role === "owner"
                ? "Your organisation is awaiting platform approval. You can prepare drafts in the meantime."
                : "Your organisation's owner is completing the platform review."}
            </div>
          </div>
          <ChevronRight size={18} color="var(--text-muted)" />
        </Link>
      )}
      <PageHeader
        title="Dashboard"
        subtitle={`Welcome back — here's how ${profile?.institution_name || "your organisation"} is performing.`}
        actions={
          <>
            <span style={{ fontSize: 13, color: "var(--text-muted)", alignSelf: "center" }}>
              {(RANGE_LABEL[days] ?? "").replace(/^./, (c) => c.toUpperCase())}
            </span>
            {org.can.publish && (
              <Link to="/inst/publish" className="pp-btn pp-btn-primary">
                <Plus size={16} /> New release
              </Link>
            )}
          </>
        }
      />

      {/* metric row */}
      <div className="pp-metrics-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 18 }}>
        {metrics.map((m) => (
          <MetricCard key={m.label} metric={m} />
        ))}
      </div>

      {/* main grid */}
      <div className="pp-responsive-grid" style={{ display: "grid", gridTemplateColumns: "1.62fr 1fr", gap: 18, alignItems: "start" }}>
        {/* left */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <Panel title="Performance overview" action={<RangeTabs days={days} onChange={setDays} />}>
            {!hasRealSeries ? (
              <div style={{ height: 236, display: "grid", placeItems: "center", textAlign: "center", color: "var(--text-muted)" }}>
                <div>
                  <Eye size={26} style={{ opacity: 0.4, marginBottom: 8 }} />
                  <div style={{ fontSize: 13.5 }}>No view data yet for {RANGE_LABEL[days]}.</div>
                  <div style={{ fontSize: 12.5, marginTop: 2 }}>Views appear here once people read your published releases.</div>
                </div>
              </div>
            ) : (
              <>
                <LineChart
                  series={chartSeries}
                  xLabels={chartXLabels}
                  yMax={chartYMax}
                  height={236}
                  formatY={(n) => `${Math.round(n)}`}
                />
                <Legend items={chartLegend} />
              </>
            )}
          </Panel>

          <Panel title="Recent releases" action={<Link to="/inst/releases" className="pp-link-muted">View all <ChevronRight size={14} /></Link>}>
            {recent.length === 0 ? (
              <div style={{ fontSize: 13.5, color: "var(--text-muted)", padding: "8px 0" }}>
                No releases yet — head to Publish to create your first.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {recent.map((r) => (
                  <div key={r.id} style={{ display: "flex", gap: 13, alignItems: "center" }}>
                    <MediaThumb scene={r.scene} w={68} h={48} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                        <TypeBadge type={r.type} />
                        <StatusPill status={r.status} />
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {r.heading}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>{r.time}</div>
                    </div>
                    <div style={{ display: "flex", gap: 14, flexShrink: 0 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "var(--text-muted)" }}>
                        <Eye size={14} /> {r.views}
                      </span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "var(--text-muted)" }}>
                        <MessageSquare size={14} /> {r.comments}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* right */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <Panel title="Top performing">
            {topReleases.length === 0 ? (
              <div style={{ fontSize: 13.5, color: "var(--text-muted)", padding: "8px 0" }}>
                Once you publish, your best releases appear here.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {topReleases.map((r) => (
                  <div key={r.rank} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-faint)", width: 16, flexShrink: 0 }}>
                      {r.rank}
                    </span>
                    <MediaThumb scene={r.scene} w={52} h={40} radius={7} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {r.heading}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 3 }}>{r.type}</div>
                    </div>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", flexShrink: 0 }}>{r.views}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Releases by status">
            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              {statusData.map((s) => (
                <BarRow key={s.name} label={s.name} value={String(s.count)} pct={Math.round((s.count / statusMax) * 100)} color="var(--series-3)" />
              ))}
            </div>
          </Panel>

          <Panel title="Content by topic">
            {topicData.length === 0 ? (
              <div style={{ fontSize: 13.5, color: "var(--text-muted)", padding: "8px 0" }}>No releases yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                {topicData.map((t) => (
                  <BarRow key={t.name} label={t.name} value={t.views} pct={t.pct} color={t.color} />
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
