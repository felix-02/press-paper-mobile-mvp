import { useEffect, useMemo, useState } from "react";
import { supabase, isSupabaseConfigured, type ReleaseRow } from "@/lib/supabase";
import { rowToRelease } from "@/lib/releaseMap";
import { useAppStore } from "@/store/useAppStore";
import type { Release } from "@/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves the current saved-id set from the public, moderation-safe database
 * view. Missing, unpublished, unverified, or moderated releases stay hidden.
 */
export function useResolvedSaved(): { releases: Release[]; loading: boolean; error: string | null } {
  const savedIds = useAppStore((s) => s.savedIds);
  const [dbMap, setDbMap] = useState<Map<string, Release>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missing = useMemo(
    () => [...savedIds].filter((id) => !dbMap.has(id) && UUID.test(id)),
    [savedIds, dbMap]
  );
  const missingKey = missing.join(",");

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || missing.length === 0) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    supabase
      .from("release_details")
      .select("*")
      .in("id", missing)
      .eq("status", "Published")
      .eq("moderation_status", "active")
      .eq("institution_verified", true)
      .then(({ data, error: loadError }) => {
        if (!active) return;
        setLoading(false);
        if (loadError) {
          setError("Some saved releases couldn't be loaded. Refresh to try again.");
          return;
        }
        if (data) {
          setDbMap((prev) => {
            const m = new Map(prev);
            (data as ReleaseRow[]).forEach((r) => m.set(r.id, rowToRelease(r)));
            return m;
          });
        }
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingKey]);

  const releases = useMemo(() => {
    const out: Release[] = [];
    for (const id of savedIds) {
      const r = dbMap.get(id);
      if (r) out.push(r);
    }
    return out;
  }, [savedIds, dbMap]);

  return { releases, loading, error };
}
