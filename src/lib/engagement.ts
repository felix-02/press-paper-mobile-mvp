import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// Batches per-release engagement lookups so a feed of N cards costs 2 queries,
// not 2N. Cards call useEngagement(id); ids are collected within a microtask
// window, fetched together, cached, and pushed to subscribers.

export interface Engagement {
  views: number;
  comments: number;
}

const cache = new Map<string, Engagement>();
const subscribers = new Map<string, Set<() => void>>();
let pending = new Set<string>();
let scheduled = false;

function notify(id: string) {
  subscribers.get(id)?.forEach((cb) => cb());
}

async function flush() {
  scheduled = false;
  const ids = [...pending];
  pending = new Set();
  if (!ids.length || !isSupabaseConfigured || !supabase) return;

  try {
    const [{ data: eng }, { data: cmts }] = await Promise.all([
      supabase.from("release_details").select("id, views").in("id", ids),
      supabase.from("comments").select("release_id").in("release_id", ids),
    ]);

    const viewMap = new Map<string, number>();
    ((eng as { id: string; views: number }[] | null) ?? []).forEach((r) => viewMap.set(r.id, r.views));
    const cmtMap = new Map<string, number>();
    ((cmts as { release_id: string }[] | null) ?? []).forEach((r) => cmtMap.set(r.release_id, (cmtMap.get(r.release_id) ?? 0) + 1));

    ids.forEach((id) => {
      cache.set(id, { views: viewMap.get(id) ?? 0, comments: cmtMap.get(id) ?? 0 });
      notify(id);
    });
  } catch {
    /* leave uncached; cards retain the values from their release row */
  }
}

function request(id: string) {
  if (cache.has(id)) return;
  pending.add(id);
  if (!scheduled) {
    scheduled = true;
    setTimeout(flush, 60);
  }
}

/** Real engagement for a card. Returns null until loaded / when unavailable. */
export function useEngagement(id: string): Engagement | null {
  const [, force] = useState(0);
  const available = isSupabaseConfigured && !!supabase;

  useEffect(() => {
    if (!available) return;
    const cb = () => force((n) => n + 1);
    let set = subscribers.get(id);
    if (!set) {
      set = new Set();
      subscribers.set(id, set);
    }
    set.add(cb);
    request(id);
    return () => {
      set!.delete(cb);
      if (set!.size === 0) subscribers.delete(id);
    };
  }, [id, available]);

  return cache.get(id) ?? null;
}

/** Let other parts of the app (e.g. the detail page bump) refresh a cached id. */
export function invalidateEngagement(id: string) {
  cache.delete(id);
  request(id);
}
