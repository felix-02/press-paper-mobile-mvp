import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";
import { useAppStore } from "@/store/useAppStore";

export interface Watchlist {
  id: string;
  name: string;
  count: number;
}

/**
 * Watchlists backed by the shared store, so every screen (sidebar, saved page,
 * add-to-list menu) sees the same live data and updates immediately on change.
 */
export function useWatchlists() {
  const { configured, user } = useAuth();
  const lists = useAppStore((s) => s.watchlists);
  const items = useAppStore((s) => s.watchlistItems);
  const setData = useAppStore((s) => s.setWatchlistData);
  const available = configured && !!user;
  const [loading, setLoading] = useState(available);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!available || !supabase || !user) {
      setData([], {});
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const [watchlistResult, itemResult] = await Promise.all([
      supabase.from("watchlists").select("id, name, created_at").eq("user_id", user.id).order("created_at", { ascending: true }),
      supabase.from("watchlist_items").select("watchlist_id, release_id"),
    ]);
    if (watchlistResult.error || itemResult.error) {
      setError("We couldn't load your watchlists. Try again.");
      setLoading(false);
      return;
    }
    const wls = watchlistResult.data;
    const its = itemResult.data;
    const map: Record<string, string[]> = {};
    ((its as { watchlist_id: string; release_id: string }[] | null) ?? []).forEach((r) => {
      (map[r.watchlist_id] ??= []).push(r.release_id);
    });
    const listRows = ((wls as { id: string; name: string }[] | null) ?? []).map((l) => ({
      id: l.id,
      name: l.name,
      count: map[l.id]?.length ?? 0,
    }));
    setData(listRows, map);
    setLoading(false);
  }, [available, user, setData]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = async (name: string) => {
    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 80) return null;
    if (!supabase || !user) return null;
    const { data, error } = await supabase.from("watchlists").insert({ user_id: user.id, name: cleanName }).select("id, name").single();
    if (error) return null;
    await refresh();
    return (data as { id: string; name: string } | null) ?? null;
  };

  const remove = async (id: string) => {
    if (!supabase) return false;
    const { error } = await supabase.from("watchlists").delete().eq("id", id);
    if (error) return false;
    await refresh();
    return true;
  };

  const rename = async (id: string, name: string) => {
    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 80) return false;
    if (!supabase) return false;
    const { error } = await supabase.from("watchlists").update({ name: cleanName }).eq("id", id);
    if (error) return false;
    await refresh();
    return true;
  };

  const addItem = async (watchlistId: string, releaseId: string) => {
    if (!supabase) return false;
    const { error } = await supabase.from("watchlist_items").upsert({ watchlist_id: watchlistId, release_id: releaseId });
    if (error) return false;
    await refresh();
    return true;
  };

  const removeItem = async (watchlistId: string, releaseId: string) => {
    if (!supabase) return false;
    const { error } = await supabase.from("watchlist_items").delete().eq("watchlist_id", watchlistId).eq("release_id", releaseId);
    if (error) return false;
    await refresh();
    return true;
  };

  const itemIds = (watchlistId: string): string[] => items[watchlistId] ?? [];
  const inList = (watchlistId: string, releaseId: string) => (items[watchlistId] ?? []).includes(releaseId);

  return { lists, items, available, loading, error, refresh, create, remove, rename, addItem, removeItem, itemIds, inList };
}
