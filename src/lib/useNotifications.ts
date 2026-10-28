import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured, type ReleaseRow } from "@/lib/supabase";
import { rowToRelease } from "@/lib/releaseMap";
import { useAppStore } from "@/store/useAppStore";

export interface AppNotification {
  id: string;
  slug: string;
  heading: string;
  time: string;
  type: string;
  ts: number; // numeric timestamp for unread comparison
  institutionName: string;
  institutionVerified: boolean;
}

/** Recent releases from the institutions the user follows, with timestamps. */
export function useNotifications(): AppNotification[] {
  const followed = useAppStore((s) => s.followedSlugs);
  const slugs = [...followed];
  const [live, setLive] = useState<AppNotification[]>([]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || slugs.length === 0) {
      setLive([]);
      return;
    }
    let active = true;
    supabase
      .from("release_details")
      .select("*")
      .eq("status", "Published")
      .eq("moderation_status", "active")
      .eq("institution_verified", true)
      .in("institution_slug", slugs)
      .order("published_at", { ascending: false })
      .limit(8)
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data) {
          setLive([]);
          return;
        }
        setLive(
          (data as ReleaseRow[]).map((row) => {
            const r = rowToRelease(row);
            return {
              id: r.id,
              slug: r.institutionSlug,
              heading: r.heading,
              time: r.time,
              type: r.type,
              ts: Date.parse(row.published_at ?? row.created_at) || 0,
              institutionName: row.institution_name?.trim() || row.institution_slug,
              institutionVerified: row.institution_verified === true,
            };
          })
        );
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slugs.join(",")]);

  const seen = new Set<string>();
  return live
    .filter((n) => (!seen.has(n.id) ? (seen.add(n.id), true) : false))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 8);
}
