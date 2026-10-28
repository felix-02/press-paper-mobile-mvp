import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Trash2, ListChecks, Compass } from "lucide-react";
import { AppShell } from "@/components/shells/AppShell";
import { ReleaseCard } from "@/components/release/ReleaseCard";
import { EmptyState } from "@/components/primitives/EmptyState";
import { ListRowSkeleton } from "@/components/primitives/Skeleton";
import { useWatchlists } from "@/lib/useWatchlists";
import { resolveReleases } from "@/lib/releaseResolve";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { usePageTitle } from "@/lib/usePageTitle";
import type { Release } from "@/types";
import { useAppStore } from "@/store/useAppStore";

export function WatchlistView() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { lists, available, loading: loadingLists, error, refresh, itemIds, removeItem } = useWatchlists();
  const pushToast = useAppStore((state) => state.pushToast);
  const list = lists.find((l) => l.id === id);
  usePageTitle(list?.name ?? "Watchlist");
  const ids = itemIds(id);
  const idsKey = ids.join(",");
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const listScroll = useInfiniteScroll(releases.length, 10, id);

  useEffect(() => {
    if (loadingLists) return;
    let active = true;
    setLoading(true);
    resolveReleases(ids).then((rs) => {
      if (active) {
        setReleases(rs);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, loadingLists]);

  // Removal is instantly reversible (re-add from the release page), so it
  // doesn't warrant a blocking confirm dialog — just do it and say so.
  const removeRelease = async (release: Release) => {
    const removed = await removeItem(id, release.id);
    if (removed) {
      setReleases((prev) => prev.filter((x) => x.id !== release.id));
      pushToast({ title: "Removed from watchlist", variant: "info" });
    } else {
      pushToast({ title: "Couldn't remove release", description: "Refresh and try again.", variant: "error" });
    }
  };

  return (
    <AppShell kind="individual" maxWidth={860}>
      <button type="button" onClick={() => navigate("/saved?tab=watchlists")} className="pp-link-muted" style={{ marginBottom: 14, fontSize: 13.5 }}>
        <ArrowLeft size={15} /> All watchlists
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <span style={{ width: 42, height: 42, borderRadius: 11, background: "rgba(59,130,246,0.12)", display: "grid", placeItems: "center" }}>
          <ListChecks size={21} color="var(--blue)" />
        </span>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "0" }}>{list?.name ?? "Watchlist"}</h1>
          {!loading && !loadingLists && (
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{releases.length} {releases.length === 1 ? "release" : "releases"}</div>
          )}
        </div>
      </div>

      {!available ? (
        <EmptyState icon={<ListChecks size={24} />} title="Sign in to use watchlists" compact />
      ) : error ? (
        <div className="pp-card" role="alert" style={{ padding: 30, textAlign: "center", color: "var(--text-muted)", fontSize: 13.5 }}>
          <p>{error}</p>
          <button type="button" className="pp-btn pp-btn-outline" onClick={() => void refresh()} style={{ marginTop: 14 }}>Retry</button>
        </div>
      ) : loadingLists || loading ? (
        <div role="status" aria-label="Loading watchlist" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[0, 1].map((i) => (
            <ListRowSkeleton key={i} />
          ))}
        </div>
      ) : !list ? (
        <EmptyState
          icon={<ListChecks size={24} />}
          title="Watchlist not found"
          body="This watchlist does not exist or is no longer available."
          action={
            <Link to="/saved?tab=watchlists" className="pp-btn pp-btn-outline">
              Back to watchlists
            </Link>
          }
        />
      ) : releases.length === 0 ? (
        <EmptyState
          icon={<ListChecks size={24} />}
          title="This watchlist is empty"
          body="Open any release and use “Add to list” to start tracking it here."
          action={
            <Link to="/home" className="pp-btn pp-btn-primary">
              <Compass size={15} /> Browse releases
            </Link>
          }
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {releases.slice(0, listScroll.visible).map((r) => (
            <div key={r.id} style={{ position: "relative" }}>
              <ReleaseCard release={r} variant="saved" />
              <button
                type="button"
                onClick={() => void removeRelease(r)}
                aria-label={`Remove ${r.heading} from watchlist`}
                title="Remove from watchlist"
                style={{ position: "absolute", top: 12, right: 12, background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8, padding: 6, color: "var(--text-muted)", zIndex: 2 }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {listScroll.hasMore && <div ref={listScroll.sentinelRef} style={{ height: 1 }} />}
        </div>
      )}
    </AppShell>
  );
}
