import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { invalidateEngagement } from "@/lib/engagement";
import { isReleaseUuid } from "@/lib/releaseUrls";

const countedThisSession = new Set<string>();

/**
 * Real engagement for a single database release:
 *  - views: a real counter incremented once per page view
 *  - comments: the real number of comments stored for this release
 * The initial values come from the same release row and keep rendering stable
 * while the fresh counters load.
 */
export function useReleaseEngagement(releaseId: string, initialViews: number, initialComments: number) {
  const [views, setViews] = useState<number | null>(null);
  const [comments, setComments] = useState<number | null>(null);
  const available = isSupabaseConfigured && !!supabase;

  useEffect(() => {
    if (!available || !supabase) return;
    let active = true;

    // Count real comments for this release.
    supabase
      .from("comments")
      .select("id", { count: "exact", head: true })
      .eq("release_id", releaseId)
      .then(({ count }) => {
        if (active && typeof count === "number") setComments(count);
      });

    // Count and display the same releases.views field used by cards, tables and
    // institution analytics. The RPC also records the deduplicated time-series.
    if (isReleaseUuid(releaseId)) {
      const shouldCount = !countedThisSession.has(releaseId);
      if (shouldCount) countedThisSession.add(releaseId);
      const countRequest = shouldCount
        ? supabase.rpc("increment_release_views", { rid: releaseId })
        : Promise.resolve({ data: null, error: null });
      void countRequest.then(async () => {
        const { data: row } = await supabase!
          .from("release_details")
          .select("views")
          .eq("id", releaseId)
          .maybeSingle();
        if (!active || !row) return;
        setViews((row as { views: number }).views);
        invalidateEngagement(releaseId);
      });
    }

    return () => {
      active = false;
    };
  }, [releaseId, available]);

  return {
    views: views ?? initialViews,
    comments: comments ?? initialComments,
    isLiveViews: views !== null,
    isLiveComments: comments !== null,
  };
}
