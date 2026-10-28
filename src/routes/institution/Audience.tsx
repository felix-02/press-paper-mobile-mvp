import { AppShell } from "@/components/shells/AppShell";
import { PageHeader, Panel, MetricCard, type Metric } from "@/components/dashboard/Panels";
import { useInstitutionStats } from "@/lib/useInstitutionStats";
import { formatCount } from "@/lib/releaseMap";
import { usePageTitle } from "@/lib/usePageTitle";
import { MetricCardSkeleton } from "@/components/primitives/Skeleton";

export function Audience() {
  usePageTitle("Audience");
  const stats = useInstitutionStats();
  if (stats.error) {
    return (
      <AppShell kind="institution">
        <PageHeader title="Audience" subtitle="Who follows your organisation and how engaged they are." />
        <div className="pp-card" role="alert" style={{ padding: 30, textAlign: "center", color: "var(--text-secondary)" }}>{stats.error} Refresh the page to try again.</div>
      </AppShell>
    );
  }

  if (!stats.loaded) {
    return (
      <AppShell kind="institution">
        <PageHeader title="Audience" subtitle="Who follows your organisation and how engaged they are." />
        <div role="status" aria-label="Loading audience data" className="pp-metrics-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <MetricCardSkeleton key={i} />
          ))}
        </div>
      </AppShell>
    );
  }

  const avgViews = stats.releaseCount ? Math.round(stats.totalViews / stats.releaseCount) : 0;

  const metrics: Metric[] = [
    { label: "Total followers", value: formatCount(stats.followers), delta: "all time", positive: true, color: "var(--series-1)" },
    { label: "Releases", value: String(stats.releaseCount), delta: `${stats.publishedCount} published`, positive: true, color: "var(--series-2)" },
    { label: "Total views", value: formatCount(stats.totalViews), delta: "all time", positive: true, color: "var(--series-3)" },
    { label: "Comments", value: formatCount(stats.totalComments), delta: "all time", positive: true, color: "var(--series-4)" },
    { label: "Avg. views / release", value: formatCount(avgViews), delta: "across all", positive: true, color: "var(--series-5)" },
  ];
  const hasAudienceActivity = stats.followers > 0 || stats.totalViews > 0 || stats.totalComments > 0;

  return (
    <AppShell kind="institution">
      <PageHeader title="Audience" subtitle="Who follows your organisation and how engaged they are." />

      <div className="pp-metrics-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 18 }}>
        {metrics.map((m) => (
          <MetricCard key={m.label} metric={m} />
        ))}
      </div>

      <Panel title="Audience insights">
        <div style={{ padding: "18px 4px", color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.65, maxWidth: 580 }}>
          {!hasAudienceActivity && (
            <>
              <strong style={{ color: "var(--text)" }}>No audience activity has been recorded yet.</strong> Followers, views and comments will appear here as people discover and interact with published releases.
              <br />
              <br />
            </>
          )}
          Presspaper reports only what it can actually measure. Your follower count, releases, views and comments are shown above and update as people engage with your releases.
          <br />
          <br />
          Detailed demographics — viewer location, age, gender and device — aren't collected, so we don't show estimated breakdowns. This keeps every number on your dashboard truthful rather than guessed.
        </div>
      </Panel>
    </AppShell>
  );
}
