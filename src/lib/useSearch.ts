import { useEffect, useMemo, useState } from "react";
import { supabase, isSupabaseConfigured, type ReleaseRow } from "@/lib/supabase";
import { rowToRelease } from "@/lib/releaseMap";
import { usePublicInstitutions } from "@/lib/usePublicInstitutions";
import type { Release, Institution } from "@/types";

function dedupe(list: Release[]): Release[] {
  const seen = new Set<string>();
  const out: Release[] = [];
  for (const r of list) if (!seen.has(r.id)) (seen.add(r.id), out.push(r));
  return out;
}

export interface SearchResults {
  releases: Release[];
  institutions: Institution[];
  empty: boolean;
  loading: boolean;
  error: string | null;
}

/** Global search over moderation-safe database institutions and releases. */
export function useSearch(query: string): SearchResults {
  const q = query.trim().toLowerCase().slice(0, 100);
  const [live, setLive] = useState<Release[]>([]);
  const [releaseLoading, setReleaseLoading] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const directory = usePublicInstitutions();

  useEffect(() => {
    if (!q || !isSupabaseConfigured || !supabase) {
      setLive([]);
      setReleaseLoading(false);
      setReleaseError(null);
      return;
    }
    let active = true;
    setLive([]);
    setReleaseLoading(true);
    setReleaseError(null);
    const timer = window.setTimeout(() => {
      void supabase!
        .from("release_details")
        .select("*")
        .eq("status", "Published")
        .eq("moderation_status", "active")
        .eq("institution_verified", true)
        .order("published_at", { ascending: false })
        .limit(100)
        .then(({ data, error }) => {
          if (!active) return;
          setReleaseLoading(false);
          if (error || !data) {
            setLive([]);
            setReleaseError("Search couldn't be completed. Try again.");
            return;
          }
          setLive((data as ReleaseRow[]).map(rowToRelease).filter((release) =>
            [release.heading, release.subheading, release.institutionName ?? "", release.type, ...release.tags]
              .some((value) => value.toLowerCase().includes(q))
          ));
        }, () => {
          if (!active) return;
          setLive([]);
          setReleaseLoading(false);
          setReleaseError("Search couldn't be completed. Try again.");
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [q]);

  return useMemo(() => {
    if (!q) return { releases: [], institutions: [], empty: true, loading: false, error: null };
    const releases = dedupe(live).slice(0, 30);
    const institutions = (isSupabaseConfigured ? directory.institutions : [])
      .filter((i) => i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q))
      .slice(0, 10);
    const loading = releaseLoading || (isSupabaseConfigured && directory.loading);
    const error = releaseError ?? (isSupabaseConfigured ? directory.error : null);
    return {
      releases,
      institutions,
      empty: !loading && !error && releases.length === 0 && institutions.length === 0,
      loading,
      error,
    };
  }, [q, live, directory.institutions, directory.loading, directory.error, releaseLoading, releaseError]);
}
