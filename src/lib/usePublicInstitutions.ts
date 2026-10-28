import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { Institution } from "@/types";

export interface PublicInstitutionRow {
  slug: string;
  name: string;
  website: string | null;
  location: string | null;
  description: string | null;
  category: string;
  verified: boolean;
  followers_count: number;
  releases_count: number;
  avatar_url?: string | null;
}

export interface PublicInstitution extends Institution {
  followersCount: number;
  releasesCount: number;
}

export function publicInstitutionFromRow(row: PublicInstitutionRow): PublicInstitution {
  return {
    slug: row.slug,
    name: row.name,
    category: row.category,
    verified: row.verified === true,
    color: "#1d4ed8",
    color2: "#312e81",
    mark: "generic",
    website: row.website || undefined,
    location: row.location || undefined,
    description: row.description || undefined,
    followersCount: Number(row.followers_count) || 0,
    releasesCount: Number(row.releases_count) || 0,
    avatarUrl: row.avatar_url || undefined,
  };
}

/** Verified public institutions loaded exclusively from Postgres. */
export function usePublicInstitutions() {
  const [institutions, setInstitutions] = useState<PublicInstitution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setInstitutions([]);
      setLoading(false);
      setError("The data service is not configured.");
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);
    void supabase.rpc("public_institutions", { p_limit: 200 }).then(
      ({ data, error: loadError }) => {
        if (!active) return;
        setLoading(false);
        if (loadError) {
          setInstitutions([]);
          setError("We couldn't load verified institutions. Try again.");
          return;
        }
        setInstitutions(((data as PublicInstitutionRow[] | null) ?? []).map(publicInstitutionFromRow));
      },
      () => {
        if (!active) return;
        setInstitutions([]);
        setLoading(false);
        setError("We couldn't load verified institutions. Try again.");
      }
    );
    return () => {
      active = false;
    };
  }, [retryKey]);

  const refresh = useCallback(() => setRetryKey((value) => value + 1), []);
  return { institutions, loading, error, refresh };
}
