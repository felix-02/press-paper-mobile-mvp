import { create } from "zustand";
import { supabase } from "@/lib/supabase";

// -----------------------------------------------------------------------------
// Application UI store.
//
// Sets are hydrated from Postgres on login and every toggle is
// written back to the `saved_releases` / `follows` tables, so saves and follows
// persist across sessions and devices. The UI reads these sets, so the sidebar,
// profile, counts and buttons everywhere reflect the real data.
// -----------------------------------------------------------------------------

interface Toast {
  id: number;
  title: string;
  description?: string;
  variant: "success" | "info" | "error";
}

interface AppState {
  reset: () => void;

  // live-session binding
  userId: string | null;
  setUserId: (id: string | null) => void;
  hydrate: (data: { saved: string[]; followed: string[] }) => void;

  // saved + followed
  savedIds: Set<string>;
  toggleSaved: (id: string) => boolean;
  isSaved: (id: string) => boolean;

  followedSlugs: Set<string>;
  toggleFollow: (slug: string) => boolean;
  isFollowing: (slug: string) => boolean;

  // toasts
  toasts: Toast[];
  pushToast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: number) => void;

  // watchlists (shared so the sidebar + saved page stay in sync)
  watchlists: { id: string; name: string; count: number }[];
  watchlistItems: Record<string, string[]>;
  setWatchlistData: (lists: { id: string; name: string; count: number }[], items: Record<string, string[]>) => void;
}

let toastSeq = 1;
const savedWrites = new Map<string, Promise<void>>();
const followWrites = new Map<string, Promise<void>>();

function enqueueWrite(queue: Map<string, Promise<void>>, key: string, task: () => Promise<void>) {
  const previous = queue.get(key) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(task);
  queue.set(key, current);
  const cleanup = () => {
    if (queue.get(key) === current) queue.delete(key);
  };
  void current.then(cleanup, cleanup);
}

const initialSaved = () => new Set<string>();
const initialFollowed = () => new Set<string>();

export const useAppStore = create<AppState>((set, get) => ({
  reset: () =>
    set({
      userId: null,
      savedIds: initialSaved(),
      followedSlugs: initialFollowed(),
      watchlists: [],
      watchlistItems: {},
      toasts: [],
    }),

  userId: null,
  setUserId: (id) => set({ userId: id }),
  hydrate: ({ saved, followed }) =>
    set({ savedIds: new Set(saved), followedSlugs: new Set(followed) }),

  savedIds: initialSaved(),
  toggleSaved: (id) => {
    const uid = get().userId;
    if (!supabase || !uid) {
      get().pushToast({ title: "Sign in to save releases", variant: "info" });
      return get().savedIds.has(id);
    }
    const next = new Set(get().savedIds);
    const nowSaved = !next.has(id);
    if (nowSaved) next.add(id);
    else next.delete(id);
    set({ savedIds: next });

    if (supabase && uid) {
      const client = supabase;
      const rollback = () => {
        if (get().userId !== uid || get().savedIds.has(id) !== nowSaved) return;
        const restored = new Set(get().savedIds);
        if (nowSaved) restored.delete(id);
        else restored.add(id);
        set({ savedIds: restored });
        get().pushToast({ title: "Couldn't update saved releases", description: "Your previous state has been restored.", variant: "error" });
      };
      enqueueWrite(savedWrites, `${uid}:${id}`, async () => {
        try {
          const { error } = nowSaved
            ? await client.from("saved_releases").upsert(
                { user_id: uid, release_id: id },
                { onConflict: "user_id,release_id", ignoreDuplicates: true }
              )
            : await client.from("saved_releases").delete().eq("user_id", uid).eq("release_id", id);
          if (error) rollback();
        } catch {
          rollback();
        }
      });
    }
    return nowSaved;
  },
  isSaved: (id) => get().savedIds.has(id),

  followedSlugs: initialFollowed(),
  toggleFollow: (slug) => {
    const uid = get().userId;
    if (!supabase || !uid) {
      get().pushToast({ title: "Sign in to follow institutions", variant: "info" });
      return get().followedSlugs.has(slug);
    }
    const next = new Set(get().followedSlugs);
    const nowFollowing = !next.has(slug);
    if (nowFollowing) next.add(slug);
    else next.delete(slug);
    set({ followedSlugs: next });

    if (supabase && uid) {
      const client = supabase;
      const rollback = () => {
        if (get().userId !== uid || get().followedSlugs.has(slug) !== nowFollowing) return;
        const restored = new Set(get().followedSlugs);
        if (nowFollowing) restored.delete(slug);
        else restored.add(slug);
        set({ followedSlugs: restored });
        get().pushToast({ title: "Couldn't update followed institutions", description: "Your previous state has been restored.", variant: "error" });
      };
      enqueueWrite(followWrites, `${uid}:${slug}`, async () => {
        try {
          const { error } = nowFollowing
            ? await client.from("follows").upsert(
                { follower: uid, institution_slug: slug },
                { onConflict: "follower,institution_slug", ignoreDuplicates: true }
              )
            : await client.from("follows").delete().eq("follower", uid).eq("institution_slug", slug);
          if (error) rollback();
        } catch {
          rollback();
        }
      });
    }
    return nowFollowing;
  },
  isFollowing: (slug) => get().followedSlugs.has(slug),

  toasts: [],
  pushToast: (t) => {
    const id = toastSeq++;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    // Errors linger a little longer so people can actually read them.
    window.setTimeout(() => get().dismissToast(id), t.variant === "error" ? 5000 : 3200);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),

  watchlists: [],
  watchlistItems: {},
  setWatchlistData: (watchlists, watchlistItems) => set({ watchlists, watchlistItems }),
}));
