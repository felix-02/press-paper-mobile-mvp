import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { Plus, Search, MoreHorizontal, Eye, Send, Trash2, X, AlertCircle, Pencil, Archive, ArchiveRestore } from "lucide-react";
import { AppShell } from "@/components/shells/AppShell";
import { PageHeader } from "@/components/dashboard/Panels";
import { StatusPill, MediaThumb } from "@/components/dashboard/ReleaseBits";
import { TypeBadge } from "@/components/release/ReleaseTypeBadge";
import type { Release } from "@/types";
import { useAppStore } from "@/store/useAppStore";
import { supabase, type ReleaseRow } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";
import { rowToRelease } from "@/lib/releaseMap";
import { useOrg } from "@/lib/useOrg";
import { track } from "@/lib/analytics";
import { usePageTitle } from "@/lib/usePageTitle";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { Skeleton } from "@/components/primitives/Skeleton";

const COLS = "minmax(0,1fr) 132px 118px 150px 74px 104px 40px";
const TYPE_OPTIONS = ["All types", "Announcement", "Publication", "Consultation", "Statistics & Research"];
const STATUS_OPTIONS = ["All statuses", "Published", "Draft", "Scheduled", "Archived"];

function HeaderCell({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: "0", textTransform: "uppercase", color: "var(--text-faint)", textAlign: right ? "right" : "left" }}>
      {children}
    </div>
  );
}

function Row({ r, onActions }: { r: Release; onActions: (release: Release) => void }) {
  const dash = (v?: string) => (v && v.length ? v : "—");
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: COLS,
        gap: 14,
        alignItems: "center",
        padding: "14px 18px",
        borderTop: "1px solid var(--border)",
      }}
    >
      {/* release */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
        <MediaThumb scene={r.scene} w={52} h={38} radius={7} />
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {r.heading}
            </span>
            {r.isNew && (
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--green)", background: "rgba(52,211,153,0.14)", padding: "2px 7px", borderRadius: 999, flexShrink: 0 }}>
                NEW
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {r.subheading}
          </div>
        </div>
      </div>

      <div><TypeBadge type={r.type} /></div>
      <div><StatusPill status={r.status} /></div>
      <div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{dash(r.publishedDate)}</div>
        {r.publishedTime ? <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 1 }}>{r.publishedTime}</div> : null}
      </div>
      <div style={{ fontSize: 13, color: "var(--text-secondary)", textAlign: "right" }}>{dash(r.views)}</div>
      <div style={{ fontSize: 13, color: "var(--text-secondary)", textAlign: "right" }}>{dash(r.engagement)}</div>
      <div style={{ textAlign: "right" }}>
        <button type="button" onClick={() => onActions(r)} style={{ color: "var(--text-muted)", padding: 4 }} aria-label={`Actions for ${r.heading}`}>
          <MoreHorizontal size={17} />
        </button>
      </div>
    </div>
  );
}

export function Releases() {
  usePageTitle("Releases");
  const { profile, profileReady } = useAuth();
  const org = useOrg();
  const navigate = useNavigate();
  const [live, setLive] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [selected, setSelected] = useState<Release | null>(null);
  const [working, setWorking] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Search and filters live in the URL so filtered views survive refresh
  // and can be shared between teammates.
  const [params, setParams] = useSearchParams();
  const query = (params.get("q") ?? "").slice(0, 100);
  const typeFilter = TYPE_OPTIONS.includes(params.get("type") ?? "") ? (params.get("type") as string) : "All types";
  const statusFilter = STATUS_OPTIONS.includes(params.get("status") ?? "") ? (params.get("status") as string) : "All statuses";
  const setUrlParam = (key: string, value: string, defaultValue: string) => {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (!value || value === defaultValue) p.delete(key);
      else p.set(key, value);
      return p;
    }, { replace: true });
  };
  const setQuery = (value: string) => setUrlParam("q", value, "");
  // One URL update — multiple setSearchParams calls in the same tick do not
  // compose in React Router (the updater reads last-rendered params).
  const clearFilters = () => {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      p.delete("q");
      p.delete("type");
      p.delete("status");
      return p;
    }, { replace: true });
  };
  const setTypeFilter = (value: string) => setUrlParam("type", value, "All types");
  const setStatusFilter = (value: string) => setUrlParam("status", value, "All statuses");

  // Load the whole organisation workspace, not only releases authored by this user.
  useEffect(() => {
    const slug = profile?.institution_slug;
    if (!profileReady) {
      setLoading(true);
      return;
    }
    if (!supabase || !slug) {
      setLive([]);
      setLoading(false);
      setLoadError("This account isn't connected to an organisation workspace.");
      return;
    }
    let active = true;
    setLoading(true);
    setLoadError(null);
    supabase
      .from("release_details")
      .select("*")
      .eq("institution_slug", slug)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setLive([]);
          setLoadError("We couldn't load this organisation's releases.");
          setLoading(false);
          return;
        }
        setLive(((data as ReleaseRow[] | null) ?? []).map(rowToRelease));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [profileReady, profile?.institution_slug, retryKey]);

  const publishNow = async () => {
    if (!selected || !supabase || !org.slug || !org.can.publish || !org.verified) return;
    setWorking(true);
    const publishedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from("releases")
      .update({ status: "Published", published_at: publishedAt })
      .eq("id", selected.id)
      .eq("institution_slug", org.slug)
      .select("id")
      .maybeSingle();
    setWorking(false);
    if (error || !(data as { id: string } | null)?.id) {
      useAppStore.getState().pushToast({ title: "Couldn't publish release", description: "Refresh and try again.", variant: "error" });
      return;
    }
    setLive((rows) => rows.map((row) => row.id === selected.id ? { ...row, status: "Published", publishedDate: "Just now", time: "Just now" } : row));
    track("release_published", { releaseId: selected.id, status: "Published", type: selected.type });
    setSelected(null);
    useAppStore.getState().pushToast({ title: "Release published", variant: "success" });
  };

  // Archive keeps everything (a reversible rollback); publish restores it.
  const setArchived = async (archived: boolean) => {
    if (!selected || !supabase || !org.slug || !org.can.publish) return;
    setWorking(true);
    const { data, error } = await supabase
      .from("releases")
      .update(archived ? { status: "Archived" } : { status: "Draft" })
      .eq("id", selected.id)
      .eq("institution_slug", org.slug)
      .select("id")
      .maybeSingle();
    setWorking(false);
    if (error || !(data as { id: string } | null)?.id) {
      useAppStore.getState().pushToast({ title: archived ? "Couldn't archive release" : "Couldn't restore release", variant: "error" });
      return;
    }
    setLive((rows) => rows.map((row) => row.id === selected.id ? { ...row, status: archived ? "Archived" : "Draft" } : row));
    setSelected(null);
    useAppStore.getState().pushToast({
      title: archived ? "Release archived" : "Release restored to drafts",
      description: archived ? "It's hidden from the public but fully recoverable here." : "Publish it again whenever you're ready.",
      variant: "success",
    });
  };

  const deleteRelease = async () => {
    if (!selected || !supabase || !org.slug || !org.can.publish) return;
    setWorking(true);
    const { data, error } = await supabase
      .from("releases")
      .delete()
      .eq("id", selected.id)
      .eq("institution_slug", org.slug)
      .select("id")
      .maybeSingle();
    setWorking(false);
    if (error || !(data as { id: string } | null)?.id) {
      useAppStore.getState().pushToast({ title: "Couldn't delete release", description: "Refresh and try again.", variant: "error" });
      return;
    }
    setLive((rows) => rows.filter((row) => row.id !== selected.id));
    track("release_deleted", { releaseId: selected.id, status: selected.status, type: selected.type });
    setSelected(null);
    useAppStore.getState().pushToast({ title: "Release deleted", variant: "success" });
  };

  const rows = live.filter((r) => {
    const q = query.trim().toLowerCase();
    const matchesQuery = !q || r.heading.toLowerCase().includes(q) || (r.subheading ?? "").toLowerCase().includes(q);
    const matchesType = typeFilter === "All types" || r.type === typeFilter;
    const matchesStatus = statusFilter === "All statuses" || r.status === statusFilter;
    return matchesQuery && matchesType && matchesStatus;
  });
  const tableScroll = useInfiniteScroll(rows.length, 25, `${query}:${typeFilter}:${statusFilter}`);

  const selectStyle: React.CSSProperties = {
    fontWeight: 500,
    fontSize: 13.5,
    color: "var(--text-secondary)",
    background: "var(--surface-1)",
    border: "1px solid var(--border)",
    borderRadius: "var(--r-md)",
    padding: "9px 32px 9px 14px",
    appearance: "none",
    cursor: "pointer",
    backgroundImage:
      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2'><polyline points='6 9 12 15 18 9'/></svg>\")",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 12px center",
  };

  return (
    <AppShell kind="institution">
      <PageHeader
        title="Releases"
        subtitle="Manage everything you've published, scheduled or drafted."
        actions={
          org.can.publish ? <Link to="/inst/publish" className="pp-btn pp-btn-primary">
            <Plus size={16} /> New release
          </Link> : undefined
        }
      />

      {/* toolbar */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-md)",
            padding: "9px 14px",
            color: "var(--text-faint)",
            flex: 1,
            maxWidth: 360,
          }}
        >
          <Search size={16} />
          <input
            value={query}
            disabled={loading || Boolean(loadError)}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search releases…"
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--text)", fontSize: 13.5 }}
          />
        </div>
        <select value={typeFilter} disabled={loading || Boolean(loadError)} onChange={(e) => setTypeFilter(e.target.value)} style={selectStyle}>
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select value={statusFilter} disabled={loading || Boolean(loadError)} onChange={(e) => setStatusFilter(e.target.value)} style={selectStyle}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {loadError && (
        <div className="pp-card" role="alert" style={{ padding: 14, marginBottom: 16, display: "flex", alignItems: "center", gap: 10, borderColor: "rgba(220,38,38,0.35)" }}>
          <AlertCircle size={17} color="#dc2626" />
          <span style={{ flex: 1, fontSize: 13.5 }}>{loadError}</span>
          <button type="button" className="pp-btn pp-btn-outline" onClick={() => setRetryKey((key) => key + 1)}>Retry</button>
        </div>
      )}

      {/* table */}
      {loading ? (
        <div className="pp-card" role="status" aria-label="Loading releases" style={{ overflow: "hidden" }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderTop: i === 0 ? "none" : "1px solid var(--border)" }}>
              <Skeleton w={52} h={38} r={7} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                <Skeleton w="42%" h={13} />
                <Skeleton w="64%" h={11} />
              </div>
              <Skeleton w={90} h={20} r={999} />
              <Skeleton w={72} h={20} r={999} />
              <Skeleton w={56} h={12} />
            </div>
          ))}
        </div>
      ) : !loadError ? (
        <>
          <div className="pp-card pp-release-table" style={{ overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 14, padding: "13px 18px", background: "var(--surface-2)" }}>
              <HeaderCell>Release</HeaderCell>
              <HeaderCell>Type</HeaderCell>
              <HeaderCell>Status</HeaderCell>
              <HeaderCell>Date</HeaderCell>
              <HeaderCell right>Views</HeaderCell>
              <HeaderCell right>Engmt.</HeaderCell>
              <HeaderCell right> </HeaderCell>
            </div>
            {rows.length === 0 ? (
              <div style={{ padding: "40px 18px", textAlign: "center", color: "var(--text-muted)", fontSize: 13.5 }}>
                {live.length === 0 ? (
                  <>
                    <p>No releases yet — your first one is a few fields away.</p>
                    {org.can.publish && (
                      <Link to="/inst/publish" className="pp-btn pp-btn-primary" style={{ marginTop: 14 }}>
                        <Plus size={15} /> Create your first release
                      </Link>
                    )}
                  </>
                ) : (
                  <>
                    <p>No releases match the current search and filters.</p>
                    <button
                      type="button"
                      className="pp-btn pp-btn-outline"
                      style={{ marginTop: 14 }}
                      onClick={clearFilters}
                    >
                      Clear filters
                    </button>
                  </>
                )}
              </div>
            ) : (
              rows.slice(0, tableScroll.visible).map((r) => <Row key={r.id} r={r} onActions={(release) => { setConfirmingDelete(false); setSelected(release); }} />)
            )}
          </div>

          {tableScroll.hasMore && <div ref={tableScroll.sentinelRef} style={{ height: 1 }} />}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, fontSize: 12.5, color: "var(--text-muted)" }}>
            <span>Showing {Math.min(tableScroll.visible, rows.length)} of {rows.length} {rows.length === 1 ? "release" : "releases"}</span>
          </div>
        </>
      ) : null}

      {selected && (
        <div onClick={() => !working && setSelected(null)} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)", display: "grid", placeItems: "center", padding: 20 }}>
          <div onClick={(event) => event.stopPropagation()} className="pp-card" role="dialog" aria-modal="true" aria-label={`Actions for ${selected.heading}`} style={{ width: "100%", maxWidth: 430, padding: 22 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 18 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ fontSize: 17, fontWeight: 700 }}>Release actions</h2>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 5, overflowWrap: "anywhere" }}>{selected.heading}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} disabled={working} aria-label="Close"><X size={18} /></button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {selected.status === "Published" && (
                <button type="button" className="pp-btn pp-btn-outline" onClick={() => navigate(`/release/${selected.id}`)} style={{ justifyContent: "flex-start" }}>
                  <Eye size={16} /> View public release
                </button>
              )}
              {org.can.publish && (
                <button type="button" className="pp-btn pp-btn-outline" onClick={() => navigate(`/inst/publish/${selected.id}`)} style={{ justifyContent: "flex-start" }}>
                  <Pencil size={16} /> Edit release
                </button>
              )}
              {selected.status !== "Published" && !org.can.publish && (
                <p style={{ padding: "10px 2px", color: "var(--text-muted)", fontSize: 13, lineHeight: 1.5 }}>
                  Your organisation role has read-only access to this release.
                </p>
              )}
              {selected.status !== "Published" && org.can.publish && (
                <button type="button" className="pp-btn pp-btn-primary" onClick={() => void publishNow()} disabled={working || !org.verified} style={{ justifyContent: "flex-start", opacity: working || !org.verified ? 0.65 : 1 }}>
                  <Send size={16} /> {org.verified ? "Publish now" : "Approval required to publish"}
                </button>
              )}
              {org.can.publish && selected.status !== "Archived" && (
                <button type="button" className="pp-btn pp-btn-outline" onClick={() => void setArchived(true)} disabled={working} style={{ justifyContent: "flex-start" }}>
                  <Archive size={16} /> Archive (reversible)
                </button>
              )}
              {org.can.publish && selected.status === "Archived" && (
                <button type="button" className="pp-btn pp-btn-outline" onClick={() => void setArchived(false)} disabled={working} style={{ justifyContent: "flex-start" }}>
                  <ArchiveRestore size={16} /> Unarchive to drafts
                </button>
              )}
              {org.can.publish && (
                <button type="button" className="pp-btn pp-btn-outline" onClick={() => confirmingDelete ? void deleteRelease() : setConfirmingDelete(true)} disabled={working} style={{ justifyContent: "flex-start", color: "var(--red)" }}>
                  <Trash2 size={16} /> {working ? "Working…" : confirmingDelete ? "Confirm permanent deletion" : "Delete release"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
