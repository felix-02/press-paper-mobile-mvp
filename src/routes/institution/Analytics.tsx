import { useSearchParams } from "react-router-dom";
import { Eye } from "lucide-react";
import { AppShell } from "@/components/shells/AppShell";
import { PageHeader, Panel, MetricCard, BarRow, LegendRow, type Metric } from "@/components/dashboard/Panels";
import { LineChart } from "@/components/charts/LineChart";
import { Donut } from "@/components/charts/Donut";
import { useInstitutionStats } from "@/lib/useInstitutionStats";
import { formatCount } from "@/lib/releaseMap";
import { usePageTitle } from "@/lib/usePageTitle";
import { MetricCardSkeleton, Skeleton } from "@/components/primitives/Skeleton";

const RANGES: [string, number][] = [
  ["Today", 1],
  ["3D", 3],
  ["7D", 7],
  ["1M", 30],
  ["6M", 180],
  ["12M", 365],
];
const RANGE_LABEL: Record<number, string> = {
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
        <button key={label} type="button" onClick={() => onChange(d)} style={{ fontSize: 12, fontWeight: 600, padding: "5px 11px", borderRadius: 6, background: days === d ? "var(--surface-3)" : "transparent", color: days === d ? "var(--text)" : "var(--text-muted)" }}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Analytics() {
  usePageTitle("Analytics");
  const [params, setParams] = useSearchParams();
  const days = rangeFromSearchParam(params.get("range"), 365);
  const setDays = (nextDays: number) => {
    const p = new URLSearchParams(params);
    p.set("range", String(nextDays));
    setParams(p);
  };
  const stats = useInstitutionStats(days);
  if (stats.error) {
    return (
      <AppShell kind="institution">
        <PageHeader title="Analytics" subtitle="Performance across your published information." />
        <div className="pp-card" role="alert" style={{ padding: 30, textAlign: "center", color: "var(--text-secondary)" }}>{stats.error} Refresh the page to try again.</div>
      </AppShell>
    );
  }

  if (!stats.loaded) {
    return (
      <AppShell kind="institution">
        <PageHeader title="Analytics" subtitle="Performance across your published information." />
        <div role="status" aria-label="Loading analytics">
          <div className="pp-metrics-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 18 }}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <MetricCardSkeleton key={i} />
            ))}
          </div>
          <div className="pp-card" style={{ padding: 18 }}>
            <Skeleton w={180} h={15} style={{ marginBottom: 18 }} />
            <Skeleton w="100%" h={250} r={10} />
          </div>
        </div>
      </AppShell>
    );
  }

  const avgViews = stats.releaseCount ? Math.round(stats.totalViews / stats.releaseCount) : 0;

  const metrics: Metric[] = [
    { label: "Total views", value: formatCount(stats.totalViews), delta: "all time", positive: true, color: "var(--series-1)" },
    { label: "Comments", value: formatCount(stats.totalComments), delta: "all time", positive: true, color: "var(--series-2)" },
    { label: "Releases", value: String(stats.releaseCount), delta: `${stats.publishedCount} published`, positive: true, color: "var(--series-3)" },
    { label: "Followers", value: formatCount(stats.followers), delta: "all time", positive: true, color: "var(--series-4)" },
    { label: "Avg. views / release", value: formatCount(avgViews), delta: "across all", positive: true, color: "var(--series-5)" },
    { label: `Views (${RANGE_LABEL[days]})`, value: formatCount(stats.rangeViews), delta: "selected range", positive: true, color: "var(--series-1)" },
  ];

  // Real daily-views series for the selected range.
  const realSeries = stats.viewSeries;
  const dayLabels = realSeries.map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (realSeries.length - 1 - i));
    return d.toLocaleDateString("en-GB", { day: "numeric", month: realSeries.length > 45 ? "short" : undefined });
  });
  const hasRealSeries = realSeries.length > 0 && realSeries.some((n) => n > 0);

  // Real content-type performance (group published releases by type, sum views).
  const typePerf = (() => {
    const byType = new Map<string, number>();
    stats.releases.forEach((r) => byType.set(r.type, (byType.get(r.type) ?? 0) + (r.views ?? 0)));
    const max = Math.max(1, ...byType.values());
    return [...byType.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([type, v], i) => ({ type, views: formatCount(v), pct: Math.round((v / max) * 100), color: `var(--series-${(i % 5) + 1})` }));
  })();

  // Real engagement split: views vs comments.
  const totalEng = stats.totalViews + stats.totalComments;
  const engagement = [
    { label: "Views", value: formatCount(stats.totalViews), pct: totalEng ? Math.round((stats.totalViews / totalEng) * 100) : 0, color: "var(--series-1)" },
    { label: "Comments", value: formatCount(stats.totalComments), pct: totalEng ? Math.round((stats.totalComments / totalEng) * 100) : 0, color: "var(--series-2)" },
  ];

  // Real top releases by views.
  const topReleases = [...stats.releases].sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 6);
  const maxTopViews = Math.max(1, ...topReleases.map((r) => r.views ?? 0));

  const NotTracked = ({ what }: { what: string }) => (
    <div style={{ height: 150, display: "grid", placeItems: "center", textAlign: "center", color: "var(--text-muted)" }}>
      <div style={{ fontSize: 13, maxWidth: 240 }}>{what} isn't collected yet. We only report metrics we can measure — no estimates.</div>
    </div>
  );

  return (
    <AppShell kind="institution">
      <PageHeader
        title="Analytics"
        subtitle="Understand how your releases reach and engage the public."
        actions={
          <span style={{ fontSize: 13, color: "var(--text-muted)", alignSelf: "center" }}>
            {(RANGE_LABEL[days] ?? "").replace(/^./, (c) => c.toUpperCase())}
          </span>
        }
      />

      <div className="pp-metrics-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 18 }}>
        {metrics.map((m) => (
          <MetricCard key={m.label} metric={m} />
        ))}
      </div>

      <Panel title="Performance overview" action={<RangeTabs days={days} onChange={setDays} />} style={{ marginBottom: 18 }}>
        {hasRealSeries ? (
            <>
              <LineChart
                series={[{ data: realSeries.length ? realSeries : [0], color: "var(--series-1)" }]}
                xLabels={dayLabels.length ? dayLabels : [""]}
                yMax={Math.max(10, Math.ceil(Math.max(...realSeries, 0) * 1.25))}
                height={250}
                formatY={(n) => `${Math.round(n)}`}
              />
              <div style={{ display: "flex", gap: 18, marginTop: 12 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--text-secondary)" }}>
                  <span style={{ width: 10, height: 3, borderRadius: 2, background: "var(--series-1)" }} />
                  Views ({RANGE_LABEL[days]})
                </span>
              </div>
            </>
          ) : (
            <div style={{ height: 250, display: "grid", placeItems: "center", textAlign: "center", color: "var(--text-muted)" }}>
              <div>
                <Eye size={26} style={{ opacity: 0.4, marginBottom: 8 }} />
                <div style={{ fontSize: 13.5 }}>No view data yet for {RANGE_LABEL[days]}.</div>
                <div style={{ fontSize: 12.5, marginTop: 2 }}>Views are recorded as people read your published releases.</div>
              </div>
            </div>
        )}
      </Panel>

      <div className="pp-responsive-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 18 }}>
        <Panel title="Content type performance">
          {typePerf.length === 0 ? (
            <div style={{ fontSize: 13.5, color: "var(--text-muted)", padding: "8px 0" }}>No releases yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
              {typePerf.map((c) => (
                <BarRow key={c.type} label={c.type} value={c.views} pct={c.pct} color={c.color} />
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Engagement breakdown">
          {totalEng === 0 ? (
            <div style={{ height: 150, display: "grid", placeItems: "center", textAlign: "center", color: "var(--text-muted)" }}>
              <div style={{ fontSize: 13, maxWidth: 260 }}>No engagement has been recorded yet. Views and comments will appear after people interact with published releases.</div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
              <Donut
                segments={engagement.map((e) => ({ pct: e.pct, color: e.color }))}
                size={150}
                thickness={24}
                centerTop={formatCount(totalEng)}
                centerBottom="Total"
              />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 11 }}>
                {engagement.map((e) => (
                  <LegendRow key={e.label} color={e.color} label={e.label} value={e.value} />
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>

      <div className="pp-responsive-grid" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 18, marginBottom: 18 }}>
        <Panel title="Geographic reach">
          <NotTracked what="Viewer location" />
        </Panel>

        <Panel title="Device breakdown">
          <NotTracked what="Device type" />
        </Panel>
      </div>

      <Panel title="Top releases by views">
        {topReleases.length === 0 ? (
          <div style={{ fontSize: 13.5, color: "var(--text-muted)", padding: "8px 0" }}>No releases yet.</div>
        ) : (
          <div className="pp-responsive-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px 36px" }}>
            {topReleases.map((r) => (
              <BarRow key={r.id} label={r.heading} value={formatCount(r.views ?? 0)} pct={Math.round(((r.views ?? 0) / maxTopViews) * 100)} color="var(--series-1)" />
            ))}
          </div>
        )}
      </Panel>
    </AppShell>
  );
}
