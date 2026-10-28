import { supabase, isSupabaseConfigured, type ReleaseRow } from "@/lib/supabase";
import { rowToRelease } from "@/lib/releaseMap";
import type { Release } from "@/types";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolve database release ids to Releases while preserving input order. */
export async function resolveReleases(ids: string[]): Promise<Release[]> {
  const uuids = ids.filter((id) => UUID.test(id));
  const map = new Map<string, Release>();
  if (uuids.length && isSupabaseConfigured && supabase) {
    const { data } = await supabase
      .from("release_details")
      .select("*")
      .in("id", uuids)
      .eq("status", "Published")
      .eq("moderation_status", "active")
      .eq("institution_verified", true);
    (data as ReleaseRow[] | null)?.forEach((row) => map.set(row.id, rowToRelease(row)));
  }
  return ids.map((id) => map.get(id)).filter((r): r is Release => !!r);
}
