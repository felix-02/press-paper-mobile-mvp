import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Bookmark, Plus, Trash2, ListChecks, X, Pencil, Check, Compass } from "lucide-react";
import { AppShell } from "@/components/shells/AppShell";
import { ReleaseCard } from "@/components/release/ReleaseCard";
import { Tabs } from "@/components/primitives/Tabs";
import { EmptyState } from "@/components/primitives/EmptyState";
import { ListRowSkeleton } from "@/components/primitives/Skeleton";
import { useResolvedSaved } from "@/lib/useResolvedSaved";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { useWatchlists } from "@/lib/useWatchlists";
import { useAppStore } from "@/store/useAppStore";
import { usePageTitle } from "@/lib/usePageTitle";

const TABS = ["Saved", "Watchlists"] as const;

export function Saved() {
  usePageTitle("Saved");
  const { releases, loading, error } = useResolvedSaved();
  const savedScroll = useInfiniteScroll(releases.length, 10);
  const [params, setParams] = useSearchParams();
  const urlTab = (params.get("tab") || "saved").toLowerCase();
  const tab = urlTab === "watchlists" ? "Watchlists" : "Saved";
  const setTab = (t: string) => {
    const p = new URLSearchParams(params);
    p.set("tab", t.toLowerCase());
    setParams(p);
  };

  return (
    <AppShell kind="individual" maxWidth={860}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 4 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "0" }}>Saved</h1>
        {tab === "Saved" && !loading && (
          <span style={{ fontSize: 13.5, color: "var(--text-muted)" }}>
            {releases.length} {releases.length === 1 ? "release" : "releases"}
          </span>
        )}
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} style={{ marginTop: 16, marginBottom: 22 }} />

      {tab === "Saved" ? (
        error ? (
          <div className="pp-card" role="alert" style={{ padding: 30, textAlign: "center", color: "var(--text-secondary)", fontSize: 13.5 }}>{error}</div>
        ) : loading && releases.length === 0 ? (
          <div role="status" aria-label="Loading saved releases" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[0, 1, 2].map((i) => (
              <ListRowSkeleton key={i} />
            ))}
          </div>
        ) : releases.length === 0 ? (
          <EmptyState
            icon={<Bookmark size={24} />}
            title="No saved releases yet"
            body="Tap the bookmark on any release to keep it here for later."
            action={
              <Link to="/home" className="pp-btn pp-btn-primary">
                <Compass size={15} /> Browse your feed
              </Link>
            }
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {releases.slice(0, savedScroll.visible).map((r) => (
              <ReleaseCard key={r.id} release={r} variant="saved" />
            ))}
            {savedScroll.hasMore && <div ref={savedScroll.sentinelRef} style={{ height: 1 }} />}
          </div>
        )
      ) : (
        <WatchlistsPanel />
      )}
    </AppShell>
  );
}

function WatchlistsPanel() {
  const { lists, available, loading, error, refresh, create, remove, rename } = useWatchlists();
  const pushToast = useAppStore((s) => s.pushToast);
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  // A pending delete confirmation quietly resets if the user moves on.
  useEffect(() => {
    if (!confirmingId) return;
    const timer = window.setTimeout(() => setConfirmingId(null), 4000);
    return () => window.clearTimeout(timer);
  }, [confirmingId]);

  if (!available) {
    return (
      <EmptyState
        icon={<ListChecks size={24} />}
        title="Watchlists need a live account"
        body="Sign in with Supabase configured to create and use watchlists."
      />
    );
  }

  const submitCreate = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    const wl = await create(n);
    setBusy(false);
    pushToast(wl ? { title: `Created "${n}"`, variant: "success" } : { title: "Couldn't create watchlist", variant: "error" });
    if (wl) {
      setName("");
      setCreating(false);
      navigate(`/watchlist/${wl.id}`);
    }
  };

  const submitRename = async (id: string) => {
    const n = editName.trim();
    if (!n) return;
    const renamed = await rename(id, n);
    if (renamed) setEditingId(null);
    pushToast(renamed ? { title: "Watchlist renamed", variant: "success" } : { title: "Couldn't rename watchlist", variant: "error" });
  };

  const onDelete = async (id: string) => {
    setConfirmingId(null);
    const removed = await remove(id);
    pushToast(removed ? { title: "Watchlist deleted", variant: "success" } : { title: "Couldn't delete watchlist", variant: "error" });
  };

  return (
    <div>
      {error && (
        <div className="pp-card" role="alert" style={{ padding: 14, marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ flex: 1, fontSize: 13.5 }}>{error}</span>
          <button type="button" className="pp-btn pp-btn-outline" onClick={() => void refresh()}>Retry</button>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        {creating ? (
          <div style={{ display: "flex", gap: 8, width: "100%", maxWidth: 360 }}>
            <input className="pp-input" placeholder="Watchlist name" value={name} maxLength={80} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void submitCreate()} />
            <button type="button" onClick={() => void submitCreate()} disabled={!name.trim() || busy} className="pp-btn pp-btn-primary" style={{ flexShrink: 0 }}>
              {busy ? "Creating…" : "Create"}
            </button>
            <button type="button" onClick={() => setCreating(false)} aria-label="Cancel" className="pp-btn pp-btn-ghost" style={{ flexShrink: 0 }}>
              <X size={15} />
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setCreating(true)} className="pp-btn pp-btn-primary">
            <Plus size={16} /> New watchlist
          </button>
        )}
      </div>

      {loading ? (
        <div role="status" aria-label="Loading watchlists" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {[0, 1].map((i) => (
            <ListRowSkeleton key={i} media={false} />
          ))}
        </div>
      ) : lists.length === 0 ? (
        <EmptyState
          icon={<ListChecks size={24} />}
          title="No watchlists yet"
          body="Group the releases you're tracking — consultations, statistics, anything. Create one, then add releases from any release page."
        />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {lists.map((l) => (
            <div key={l.id} className="pp-card" style={{ padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              {editingId === l.id ? (
                <div style={{ display: "flex", gap: 6, flex: 1 }}>
                  <input
                    className="pp-input"
                    value={editName}
                    maxLength={80}
                    autoFocus
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitRename(l.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    style={{ padding: "6px 9px", fontSize: 13 }}
                  />
                  <button type="button" onClick={() => submitRename(l.id)} aria-label="Save name" className="pp-btn pp-btn-blue" style={{ padding: "6px 10px", flexShrink: 0 }}>
                    <Check size={15} />
                  </button>
                </div>
              ) : (
                <>
                  <button type="button" onClick={() => navigate(`/watchlist/${l.id}`)} style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left", flex: 1, minWidth: 0 }}>
                    <span style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(59,130,246,0.12)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                      <ListChecks size={19} color="var(--blue)" />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 14.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.name}</span>
                      <span style={{ display: "block", fontSize: 12.5, color: "var(--text-muted)" }}>{l.count} {l.count === 1 ? "release" : "releases"}</span>
                    </span>
                  </button>
                  <div style={{ display: "flex", gap: 2, flexShrink: 0, alignItems: "center" }}>
                    {confirmingId === l.id ? (
                      <button
                        type="button"
                        onClick={() => void onDelete(l.id)}
                        style={{ fontSize: 12, fontWeight: 600, color: "var(--red)", background: "var(--danger-soft)", border: "1px solid color-mix(in srgb, var(--red) 35%, transparent)", borderRadius: "var(--r-pill)", padding: "5px 11px" }}
                      >
                        Confirm delete
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(l.id);
                            setEditName(l.name);
                          }}
                          aria-label="Rename watchlist"
                          style={{ color: "var(--text-muted)", padding: 6 }}
                        >
                          <Pencil size={15} />
                        </button>
                        <button type="button" onClick={() => setConfirmingId(l.id)} aria-label={`Delete watchlist ${l.name}`} style={{ color: "var(--text-muted)", padding: 6 }}>
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
