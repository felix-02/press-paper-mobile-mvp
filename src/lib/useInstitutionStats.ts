import { useEffect, useState } from "react";
import { supabase, type ReleaseRow } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";

export interface InstitutionStats {
  loaded: boolean;
  live: boolean;
  releases: ReleaseRow[];
  releaseCount: number;
  publishedCount: number;
  draftCount: number;
  scheduledCount: number;
  totalViews: number;
  totalComments: number;
  followers: number;
  viewSeries: number[];
  rangeViews: number;
  error: string | null;
}

const EMPTY: InstitutionStats = {
  loaded: false,
  live: false,
  releases: [],
  releaseCount: 0,
  publishedCount: 0,
  draftCount: 0,
  scheduledCount: 0,
  totalViews: 0,
  totalComments: 0,
  followers: 0,
  viewSeries: [],
  rangeViews: 0,
  error: null,
};

/**
 * Real, derived analytics for the signed-in institution: counts, totals, the
 * follower count and the full release list (for recent/top widgets). `days`
 * controls the view time-series window. Empty/loading states never substitute
 * illustrative business data.
 */
export function useInstitutionStats(days = 30): InstitutionStats {
  const { configured, user, profile } = useAuth();
  const [stats, setStats] = useState<InstitutionStats>(EMPTY);

  useEffect(() => {
    if (!configured || !supabase || !user) {
      setStats(EMPTY);
      return;
    }
    const slug = profile?.institution_slug;
    if (!slug) {
      setStats({ ...EMPTY, loaded: true, live: true });
      return;
    }
    let active = true;
    setStats({ ...EMPTY, live: true });

    Promise.all([
      supabase.from("release_details").select("*").eq("institution_slug", slug).order("created_at", { ascending: false }),
      supabase.from("institution_stats").select("followers_count").eq("slug", slug).maybeSingle(),
      supabase.rpc("institution_view_series", { days }),
    ]).then(([rel, stat, series]) => {
      if (!active) return;
      if (rel.error || stat.error || series.error) {
        setStats({ ...EMPTY, loaded: true, live: true, error: "We couldn't load organisation analytics." });
        return;
      }
      const list = ((rel.data as ReleaseRow[] | null) ?? []);
      const seriesRows = (series.data as { day: string; views: number | string }[] | null) ?? [];
      const seriesNums = seriesRows.map((r) => Number(r.views) || 0);
      setStats({
        loaded: true,
        live: true,
        releases: list,
        releaseCount: list.length,
        publishedCount: list.filter((r) => r.status === "Published").length,
        draftCount: list.filter((r) => r.status === "Draft").length,
        scheduledCount: list.filter((r) => r.status === "Scheduled").length,
        totalViews: list.reduce((a, r) => a + (r.views ?? 0), 0),
        totalComments: list.reduce((a, r) => a + (r.comments_count ?? 0), 0),
        followers: (stat.data as { followers_count: number } | null)?.followers_count ?? 0,
        viewSeries: seriesNums,
        rangeViews: seriesNums.reduce((a, n) => a + n, 0),
        error: null,
      });
    });

    return () => {
      active = false;
    };
  }, [configured, user, profile?.institution_slug, days]);

  return stats;
}
