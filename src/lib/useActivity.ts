import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";
import { resolveReleases } from "@/lib/releaseResolve";

export interface ActivityItem {
  key: string;
  kind: "save" | "follow";
  ts: number;
  releaseId?: string;
  heading?: string;
  slug?: string;
}

export function relativeTime(ts: number): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo} month${mo === 1 ? "" : "s"} ago`;
  return `${Math.floor(mo / 12)} year${Math.floor(mo / 12) === 1 ? "" : "s"} ago`;
}

/** Real, time-ordered activity: releases the user saved + institutions followed. */
export function useActivity() {
  const { configured, user } = useAuth();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const available = isSupabaseConfigured && configured;

  useEffect(() => {
    if (!available || !supabase || !user) {
      setItems([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    (async () => {
      const [{ data: saves }, { data: follows }] = await Promise.all([
        supabase!.from("saved_releases").select("release_id, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(40),
        supabase!.from("follows").select("institution_slug, created_at").eq("follower", user.id).order("created_at", { ascending: false }).limit(40),
      ]);
      const saveRows = (saves as { release_id: string; created_at: string }[] | null) ?? [];
      const followRows = (follows as { institution_slug: string; created_at: string }[] | null) ?? [];
      const headings = new Map((await resolveReleases(saveRows.map((s) => s.release_id))).map((r) => [r.id, r.heading]));
      if (!active) return;
      const merged: ActivityItem[] = [
        ...saveRows.map((s) => ({ key: `s-${s.release_id}`, kind: "save" as const, ts: Date.parse(s.created_at) || 0, releaseId: s.release_id, heading: headings.get(s.release_id) ?? "a release" })),
        ...followRows.map((f) => ({ key: `f-${f.institution_slug}`, kind: "follow" as const, ts: Date.parse(f.created_at) || 0, slug: f.institution_slug })),
      ].sort((a, b) => b.ts - a.ts);
      setItems(merged);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [available, user]);

  return { items, loading, available };
}
