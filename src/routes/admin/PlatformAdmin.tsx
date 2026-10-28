import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  Archive,
  Ban,
  Building2,
  Check,
  Copy,
  FileText,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { AdminShell } from "@/components/shells/AdminShell";
import { useAuth } from "@/auth/AuthProvider";
import { useAppStore } from "@/store/useAppStore";
import { usePageTitle } from "@/lib/usePageTitle";
import { supabase } from "@/lib/supabase";
import {
  useAdminConsole,
  type AccountStatus,
  type AdminAuditEvent,
  type AdminRelease,
  type AdminUser,
  type PostModerationStatus,
} from "@/lib/useAdminConsole";

type Tab = "overview" | "users" | "institutions" | "posts" | "activity" | "audit" | "invites";
type AccountActionRow = Pick<AdminUser, "user_id" | "email" | "account_status" | "is_admin">;
type ModerationRequest =
  | { kind: "account"; row: AccountActionRow; status: AccountStatus }
  | { kind: "release"; row: AdminRelease; status: PostModerationStatus };

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: ShieldCheck },
  { id: "users", label: "Users", icon: Users },
  { id: "institutions", label: "Institutions", icon: Building2 },
  { id: "posts", label: "Posts", icon: FileText },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "audit", label: "Audit log", icon: ScrollText },
  { id: "invites", label: "Invites", icon: Send },
];

const STATUS_COLORS: Record<string, { color: string; background: string }> = {
  active: { color: "var(--green)", background: "rgba(52,211,153,0.12)" },
  verified: { color: "var(--green)", background: "rgba(52,211,153,0.12)" },
  published: { color: "var(--green)", background: "rgba(52,211,153,0.12)" },
  pending: { color: "var(--amber)", background: "rgba(245,158,11,0.12)" },
  archived: { color: "var(--amber)", background: "rgba(245,158,11,0.12)" },
  banned: { color: "var(--red)", background: "rgba(248,113,113,0.12)" },
  rejected: { color: "var(--red)", background: "rgba(248,113,113,0.12)" },
  deleted: { color: "var(--red)", background: "rgba(248,113,113,0.12)" },
};

function StatusPill({ value }: { value: string | null | undefined }) {
  const normalized = (value || "unknown").toLowerCase();
  const style = STATUS_COLORS[normalized] ?? { color: "var(--text-muted)", background: "var(--surface-2)" };
  return (
    <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: "capitalize", padding: "3px 9px", borderRadius: 999, ...style }}>
      {normalized}
    </span>
  );
}
function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function Metric({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="pp-card" style={{ padding: 18 }}>
      <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 750, marginTop: 5 }}>{value.toLocaleString()}</div>
      <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 2 }}>{note}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="pp-card" style={{ padding: 34, textAlign: "center", color: "var(--text-muted)", fontSize: 13.5 }}>{children}</div>;
}

function LoadMore({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <div style={{ textAlign: "center", marginTop: 16 }}>
      <button type="button" className="pp-btn pp-btn-outline" onClick={onClick} disabled={busy}>
        {busy ? "Loading…" : "Load more"}
      </button>
    </div>
  );
}

function safeMetadata(value: Record<string, unknown>) {
  const text = JSON.stringify(value);
  return text.length > 180 ? `${text.slice(0, 177)}…` : text;
}

function moderationVerb(request: ModerationRequest): string {
  if (request.status === "active") return "Recover";
  if (request.status === "archived") return "Archive";
  if (request.status === "banned") return "Ban";
  return "Delete";
}

export function PlatformAdmin() {
  usePageTitle("Administration");
  const { profile } = useAuth();
  const admin = useAdminConsole();
  const pushToast = useAppStore((state) => state.pushToast);
  // Tab and search live in the URL so console views survive refresh.
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab") ?? "overview";
  const tab: Tab = TABS.some(({ id }) => id === tabParam) ? (tabParam as Tab) : "overview";
  const query = (params.get("q") ?? "").slice(0, 100);
  // Functional updates so consecutive calls in one tick (switch tab + clear
  // search) can't clobber each other with stale params.
  const setTab = (nextTab: Tab) => {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (nextTab === "overview") p.delete("tab");
      else p.set("tab", nextTab);
      p.delete("q");
      return p;
    }, { replace: true });
  };
  const setQuery = (value: string) => {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (value) p.set("q", value);
      else p.delete("q");
      return p;
    }, { replace: true });
  };
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("");
  const [newType, setNewType] = useState("");
  const [coverLabel, setCoverLabel] = useState("");
  const [coverUrl, setCoverUrl] = useState("");

  const addReleaseType = async () => {
    const name = newType.trim();
    if (name.length < 2 || !supabase) return;
    const { data, error } = await supabase.rpc("admin_add_release_type", { p_name: name });
    const ok = !error && String(data) === "ok";
    pushToast(ok ? { title: `Release type "${name}" added`, description: "Publishers can use it immediately.", variant: "success" } : { title: "Couldn't add release type", variant: "error" });
    if (ok) setNewType("");
  };
  const addCover = async () => {
    const label = coverLabel.trim();
    const url = coverUrl.trim();
    if (label.length < 2 || !/^https:\/\//.test(url) || !supabase) {
      pushToast({ title: "Add a label and an https image URL", variant: "info" });
      return;
    }
    const { data, error } = await supabase.rpc("admin_add_platform_cover", { p_label: label, p_url: url });
    const ok = !error && String(data) === "ok";
    pushToast(ok ? { title: `Cover "${label}" added for all publishers`, variant: "success" } : { title: "Couldn't add cover", variant: "error" });
    if (ok) { setCoverLabel(""); setCoverUrl(""); }
  };
  const [inviteEmail, setInviteEmail] = useState("");
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [moderationRequest, setModerationRequest] = useState<ModerationRequest | null>(null);
  const [moderationReason, setModerationReason] = useState("");

  const normalizedQuery = query.trim().toLowerCase();
  const filteredUsers = useMemo(() => admin.users.filter((row) => !normalizedQuery || [row.email, row.full_name, row.institution_name, row.role, row.account_status].some((value) => value?.toLowerCase().includes(normalizedQuery))), [admin.users, normalizedQuery]);
  const filteredInstitutions = useMemo(() => admin.institutions.filter((row) => !normalizedQuery || [row.owner_email, row.institution_name, row.institution_slug, row.verification_status, row.account_status].some((value) => value?.toLowerCase().includes(normalizedQuery))), [admin.institutions, normalizedQuery]);
  const filteredReleases = useMemo(() => admin.releases.filter((row) => !normalizedQuery || [row.heading, row.institution_name, row.institution_slug, row.author_email, row.publication_status, row.moderation_status].some((value) => value?.toLowerCase().includes(normalizedQuery))), [admin.releases, normalizedQuery]);

  if (!profile?.is_admin || !admin.available) {
    return (
      <AdminShell maxWidth={720}>
        <div className="pp-card" style={{ padding: 40, textAlign: "center" }}>
          <ShieldCheck size={30} color="var(--text-muted)" style={{ marginBottom: 12 }} />
          <h1 style={{ fontSize: 19, fontWeight: 700, marginBottom: 8 }}>Super admins only</h1>
          <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>Administration data and moderation actions are protected by server-side authorization.</p>
        </div>
      </AdminShell>
    );
  }

  const moderateAccount = async (row: AccountActionRow, status: AccountStatus, reason: string) => {
    setActionBusy(`account:${row.user_id}`);
    const result = await admin.setAccountStatus(row.user_id, status, reason);
    setActionBusy(null);
    const message = result.result === "protected_admin" ? "Super-admin accounts are protected from browser moderation."
      : result.result === "cannot_self" ? "You cannot moderate your own super-admin account."
        : result.result === "no_change" ? "That account already has this status."
          : "The account action failed.";
    pushToast({ title: result.ok ? `Account ${status === "active" ? "recovered" : status}` : message, variant: result.ok ? "success" : "info" });
  };

  const moderateRelease = async (row: AdminRelease, status: PostModerationStatus, reason: string) => {
    setActionBusy(`release:${row.release_id}`);
    const result = await admin.setReleaseModeration(row.release_id, status, reason);
    setActionBusy(null);
    pushToast({ title: result.ok ? `Post ${status === "active" ? "recovered" : status}` : "The post action failed.", variant: result.ok ? "success" : "info" });
  };

  const openModeration = (request: ModerationRequest) => {
    setModerationReason("");
    setModerationRequest(request);
  };

  const confirmModeration = async () => {
    if (!moderationRequest || actionBusy) return;
    const reason = moderationReason.trim();
    if (reason.length < 3 || reason.length > 1000) {
      pushToast({ title: "Add a reason between 3 and 1,000 characters", variant: "info" });
      return;
    }
    if (moderationRequest.kind === "account") {
      await moderateAccount(moderationRequest.row, moderationRequest.status, reason);
    } else {
      await moderateRelease(moderationRequest.row, moderationRequest.status, reason);
    }
    setModerationRequest(null);
    setModerationReason("");
  };

  useEffect(() => {
    if (!moderationRequest) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !actionBusy) setModerationRequest(null);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [moderationRequest, actionBusy]);

  const verifyInstitution = async (ownerId: string, approved: boolean) => {
    if (!window.confirm(`${approved ? "Approve" : "Reject"} this institution?`)) return;
    setActionBusy(`verify:${ownerId}`);
    const ok = await admin.setInstitutionVerification(ownerId, approved);
    setActionBusy(null);
    pushToast({ title: ok ? (approved ? "Institution approved" : "Institution rejected") : "The verification action failed.", variant: ok && approved ? "success" : "info" });
  };

  const issueInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    const name = orgName.trim();
    if (name.length < 2 || name.length > 160 || email.length > 320 || !/.+@.+\..+/.test(email)) {
      pushToast({ title: "Enter an organisation name and valid official email", variant: "info" });
      return;
    }
    setActionBusy("invite:create");
    const result = await admin.createInstitutionInvite(email, name);
    setActionBusy(null);
    if (!result.token) {
      pushToast({ title: "Couldn't create the invitation", description: result.error ?? undefined, variant: "error" });
      return;
    }
    const link = `${window.location.origin}/institution-invite/${result.token}`;
    setLastLink(link);
    setInviteEmail("");
    setOrgName("");
    try {
      await navigator.clipboard.writeText(link);
      pushToast({ title: "Invite created — link copied", variant: "success" });
    } catch {
      pushToast({ title: "Invite created", description: "Copy the generated link below.", variant: "success" });
    }
  };

  const revokeInvite = async (id: string) => {
    if (!window.confirm("Revoke this invitation?")) return;
    setActionBusy(`invite:${id}`);
    const ok = await admin.revokeInstitutionInvite(id);
    setActionBusy(null);
    pushToast({ title: ok ? "Invite revoked" : "The invitation couldn't be revoked", variant: ok ? "success" : "info" });
  };

  const AccountActions = ({ row }: { row: AccountActionRow }) => {
    if (row.is_admin) return <span style={{ fontSize: 12, color: "var(--text-faint)" }}>Protected admin</span>;
    const busy = actionBusy === `account:${row.user_id}`;
    return row.account_status === "active" ? (
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" disabled={busy} onClick={() => openModeration({ kind: "account", row, status: "archived" })} className="pp-btn pp-btn-ghost" style={{ padding: "5px 9px", fontSize: 12 }}><Archive size={13} /> Archive</button>
        <button type="button" disabled={busy} onClick={() => openModeration({ kind: "account", row, status: "banned" })} className="pp-btn pp-btn-ghost" style={{ padding: "5px 9px", fontSize: 12, color: "var(--red)" }}><Ban size={13} /> Ban</button>
      </div>
    ) : (
      <button type="button" disabled={busy} onClick={() => openModeration({ kind: "account", row, status: "active" })} className="pp-btn pp-btn-outline" style={{ padding: "5px 9px", fontSize: 12 }}><RotateCcw size={13} /> Recover</button>
    );
  };

  const topAudit = admin.audit.slice(0, 6);
  const topActivity = admin.activity.slice(0, 6);

  return (
    <AdminShell maxWidth={1320}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 18, marginBottom: 18 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(59,130,246,0.12)", display: "grid", placeItems: "center" }}><ShieldCheck size={22} color="var(--blue)" /></span>
            <div>
              <h1 style={{ fontSize: 25, fontWeight: 750 }}>Global administration</h1>
              <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginTop: 2 }}>Users, institutions, posts, activity and immutable moderation history.</p>
            </div>
          </div>
        </div>
        <button type="button" onClick={() => void admin.refresh()} disabled={admin.loading} className="pp-btn pp-btn-outline"><RefreshCw size={15} /> {admin.loading ? "Refreshing…" : "Refresh"}</button>
      </div>

      <nav aria-label="Administration sections" style={{ display: "flex", gap: 6, overflowX: "auto", borderBottom: "1px solid var(--border)", marginBottom: 20 }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setTab(id)} style={{ display: "inline-flex", alignItems: "center", gap: 7, whiteSpace: "nowrap", padding: "10px 11px", fontSize: 13, color: tab === id ? "var(--text)" : "var(--text-muted)", fontWeight: tab === id ? 650 : 500, borderBottom: `2px solid ${tab === id ? "var(--blue)" : "transparent"}` }}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </nav>

      {admin.error && (
        <div className="pp-card" role="alert" style={{ padding: 14, marginBottom: 18, display: "flex", gap: 10, alignItems: "center", borderColor: "rgba(248,113,113,0.35)" }}>
          <AlertCircle size={17} color="var(--red)" /><span style={{ flex: 1, fontSize: 13.5 }}>{admin.error}</span>
          <button type="button" onClick={() => void admin.refresh()} className="pp-btn pp-btn-outline">Retry</button>
        </div>
      )}

      {admin.loading ? (
        <Empty>Loading the administration console…</Empty>
      ) : (
        <>
          {tab === "overview" && (
            <div>
              <div className="pp-metrics-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 12 }}>
                <Metric label="Users" value={admin.users.length} note={`${admin.users.filter((row) => row.account_status !== "active").length} moderated`} />
                <Metric label="Institutions" value={admin.institutions.length} note={`${admin.pendingInstitutions.filter((row) => row.status === "pending").length} awaiting review`} />
                <Metric label="Posts" value={admin.releases.length} note={`${admin.releases.filter((row) => row.moderation_status !== "active").length} moderated`} />
                <Metric label="Activity events" value={admin.activity.length} note="bounded, user-attributed" />
                <Metric label="Audit entries" value={admin.audit.length} note="privileged mutations" />
              </div>
              <div className="pp-responsive-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 18 }}>
                <section className="pp-card" style={{ padding: 18 }}>
                  <h2 style={{ fontSize: 15.5, fontWeight: 700, marginBottom: 12 }}>Recent user activity</h2>
                  {topActivity.length === 0 ? <span style={{ fontSize: 13, color: "var(--text-muted)" }}>No activity recorded yet.</span> : topActivity.map((event) => (
                    <div key={event.event_id} style={{ padding: "9px 0", borderTop: "1px solid var(--border)" }}>
                      <div style={{ fontSize: 13.5 }}><strong>{event.actor_email ?? event.actor_name ?? "Unknown user"}</strong> · {event.event_type}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{formatDate(event.created_at)}</div>
                    </div>
                  ))}
                </section>
                <section className="pp-card" style={{ padding: 18 }}>
                  <h2 style={{ fontSize: 15.5, fontWeight: 700, marginBottom: 12 }}>Recent admin actions</h2>
                  {topAudit.length === 0 ? <span style={{ fontSize: 13, color: "var(--text-muted)" }}>No privileged actions recorded yet.</span> : topAudit.map((event) => (
                    <div key={event.audit_id} style={{ padding: "9px 0", borderTop: "1px solid var(--border)" }}>
                      <div style={{ fontSize: 13.5 }}><strong>{event.actor_email ?? "Admin"}</strong> · {event.action}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{event.target_type} · {event.target_id} · {formatDate(event.created_at)}</div>
                    </div>
                  ))}
                </section>
              </div>
            </div>
          )}

          {(tab === "users" || tab === "institutions" || tab === "posts") && (
            <label aria-label={`Search ${tab}`} style={{ display: "flex", alignItems: "center", gap: 9, maxWidth: 420, border: "1px solid var(--border)", background: "var(--surface-2)", borderRadius: "var(--r-pill)", padding: "8px 14px", marginBottom: 14 }}>
              <Search size={15} color="var(--text-muted)" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={100} placeholder={`Search ${tab}…`} style={{ flex: 1, border: 0, outline: 0, background: "transparent", color: "var(--text)" }} />
            </label>
          )}

          {tab === "users" && (
            <section className="pp-card" style={{ padding: 18 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>All users ({admin.users.length})</h2>
              {filteredUsers.length === 0 ? <Empty>No users match this search.</Empty> : filteredUsers.map((row) => (
                <div key={row.user_id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderTop: "1px solid var(--border)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 650, overflowWrap: "anywhere" }}>{row.full_name || row.email} {row.is_admin && <ShieldCheck size={13} color="var(--blue)" style={{ display: "inline", verticalAlign: -2 }} />}</div>
                    <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 }}>{row.email} · {row.role}{row.institution_name ? ` · ${row.institution_name}` : ""}</div>
                    {row.status_reason && row.account_status !== "active" && <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 3 }}>{row.status_reason}</div>}
                  </div>
                  <StatusPill value={row.account_status} />
                  <AccountActions row={row} />
                </div>
              ))}
              {admin.hasMore.users && <LoadMore busy={admin.loadingMore === "users"} onClick={() => void admin.loadMore("users")} />}
            </section>
          )}

          {tab === "institutions" && (
            <section className="pp-card" style={{ padding: 18 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>All institutions ({admin.institutions.length})</h2>
              {filteredInstitutions.length === 0 ? <Empty>No institutions match this search.</Empty> : filteredInstitutions.map((row) => (
                <div key={row.owner_id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: "1px solid var(--border)" }}>
                  <Building2 size={18} color="var(--text-muted)" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 650 }}>{row.institution_name || row.institution_slug}</div>
                    <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 }}>{row.owner_email} · {row.member_count} members · {row.release_count} posts ({row.published_count} published)</div>
                  </div>
                  <StatusPill value={row.account_status} />
                  <StatusPill value={row.verification_status} />
                  <div style={{ display: "flex", gap: 5 }}>
                    {row.verification_status !== "verified" && <button type="button" disabled={actionBusy !== null} onClick={() => void verifyInstitution(row.owner_id, true)} className="pp-btn pp-btn-ghost" style={{ padding: "5px 8px", fontSize: 12 }}><Check size={13} /> Approve</button>}
                    {row.verification_status !== "rejected" && <button type="button" disabled={actionBusy !== null} onClick={() => void verifyInstitution(row.owner_id, false)} className="pp-btn pp-btn-ghost" style={{ padding: "5px 8px", fontSize: 12 }}><X size={13} /> Reject</button>}
                  </div>
                  <AccountActions row={{ user_id: row.owner_id, email: row.owner_email, account_status: row.account_status, is_admin: false }} />
                </div>
              ))}
              {admin.hasMore.institutions && <LoadMore busy={admin.loadingMore === "institutions"} onClick={() => void admin.loadMore("institutions")} />}
            </section>
          )}

          {tab === "posts" && (
            <section className="pp-card" style={{ padding: 18 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>All posts ({admin.releases.length})</h2>
              {filteredReleases.length === 0 ? <Empty>No posts match this search.</Empty> : filteredReleases.map((row) => {
                const busy = actionBusy === `release:${row.release_id}`;
                return (
                  <div key={row.release_id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: "1px solid var(--border)" }}>
                    <FileText size={18} color="var(--text-muted)" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 650 }}>{row.heading}</div>
                      <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 }}>{row.institution_name || row.institution_slug} · {row.release_type} · {row.views} views · {row.comments_count} comments</div>
                      {row.moderation_reason && row.moderation_status !== "active" && <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 3 }}>{row.moderation_reason}</div>}
                    </div>
                    <StatusPill value={row.publication_status} />
                    <StatusPill value={row.moderation_status} />
                    <div style={{ display: "flex", gap: 5 }}>
                      {row.moderation_status !== "active" && <button type="button" disabled={busy} onClick={() => openModeration({ kind: "release", row, status: "active" })} className="pp-btn pp-btn-outline" style={{ padding: "5px 8px", fontSize: 12 }}><RotateCcw size={13} /> Recover</button>}
                      {row.moderation_status === "active" && <button type="button" disabled={busy} onClick={() => openModeration({ kind: "release", row, status: "archived" })} className="pp-btn pp-btn-ghost" style={{ padding: "5px 8px", fontSize: 12 }}><Archive size={13} /> Archive</button>}
                      {row.moderation_status !== "deleted" && <button type="button" disabled={busy} onClick={() => openModeration({ kind: "release", row, status: "deleted" })} className="pp-btn pp-btn-ghost" style={{ padding: "5px 8px", fontSize: 12, color: "var(--red)" }}><Trash2 size={13} /> Delete</button>}
                    </div>
                  </div>
                );
              })}
              {admin.hasMore.releases && <LoadMore busy={admin.loadingMore === "releases"} onClick={() => void admin.loadMore("releases")} />}
            </section>
          )}

          {tab === "activity" && (
            <section className="pp-card" style={{ padding: 18 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>User activity ({admin.activity.length})</h2>
              {admin.activity.length === 0 ? <Empty>No user activity has been recorded yet.</Empty> : admin.activity.map((event) => (
                <div key={event.event_id} style={{ display: "grid", gridTemplateColumns: "minmax(180px, .8fr) minmax(180px, 1fr) minmax(220px, 1.2fr) auto", gap: 12, alignItems: "center", padding: "10px 0", borderTop: "1px solid var(--border)", fontSize: 13 }}>
                  <span><strong>{event.actor_email ?? event.actor_name ?? "Unknown user"}</strong><small style={{ display: "block", color: "var(--text-muted)", marginTop: 2 }}>{event.actor_role ?? "unknown role"}</small></span>
                  <span>{event.event_type}<small style={{ display: "block", color: "var(--text-muted)", marginTop: 2 }}>{event.target_type ?? "event"}{event.target_id ? ` · ${event.target_id}` : ""}</small></span>
                  <code style={{ fontSize: 11.5, color: "var(--text-muted)", overflowWrap: "anywhere" }}>{safeMetadata(event.metadata)}</code>
                  <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{formatDate(event.created_at)}</span>
                </div>
              ))}
              {admin.hasMore.activity && <LoadMore busy={admin.loadingMore === "activity"} onClick={() => void admin.loadMore("activity")} />}
            </section>
          )}

          {tab === "audit" && (
            <section className="pp-card" style={{ padding: 18 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 3 }}>Immutable admin audit log ({admin.audit.length})</h2>
              <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 10 }}>Recorded in the same database transaction as each privileged mutation.</p>
              {admin.audit.length === 0 ? <Empty>No privileged actions have been recorded yet.</Empty> : admin.audit.map((event: AdminAuditEvent) => (
                <div key={event.audit_id} style={{ display: "grid", gridTemplateColumns: "minmax(180px,.8fr) minmax(180px,1fr) minmax(220px,1.3fr) auto", gap: 12, alignItems: "center", padding: "11px 0", borderTop: "1px solid var(--border)", fontSize: 13 }}>
                  <span><strong>{event.actor_email ?? event.actor_id}</strong></span>
                  <span>{event.action}<small style={{ display: "block", color: "var(--text-muted)", marginTop: 2 }}>{event.target_type} · {event.target_id}</small></span>
                  <span style={{ color: "var(--text-secondary)" }}>{event.reason ?? "No reason supplied"}</span>
                  <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{formatDate(event.created_at)}</span>
                </div>
              ))}
              {admin.hasMore.audit && <LoadMore busy={admin.loadingMore === "audit"} onClick={() => void admin.loadMore("audit")} />}
            </section>
          )}

          {tab === "invites" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <section className="pp-card" style={{ padding: 18 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700 }}>Invite an institution</h2>
                <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 4, marginBottom: 13 }}>
                  The link is shown once, works exactly one time, is locked to the invited email, and expires 30 minutes after you create it.
                  If it expires, issue a fresh invite for the same email.
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input className="pp-input" value={orgName} onChange={(event) => setOrgName(event.target.value)} maxLength={160} placeholder="Organisation name" style={{ flex: 1, minWidth: 200 }} />
                  <input className="pp-input" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} maxLength={320} placeholder="official@example.org" style={{ flex: 1, minWidth: 220 }} />
                  <button type="button" onClick={() => void issueInvite()} disabled={actionBusy === "invite:create"} className="pp-btn pp-btn-primary"><Send size={14} /> {actionBusy === "invite:create" ? "Creating…" : "Create invite"}</button>
                </div>
                {lastLink && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, padding: "9px 11px", background: "var(--surface-2)", borderRadius: "var(--r-md)" }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12.5 }}>{lastLink}</span>
                    <button type="button" onClick={() => void navigator.clipboard.writeText(lastLink).then(() => pushToast({ title: "Copied", variant: "success" }), () => pushToast({ title: "Copy failed", variant: "error" }))} className="pp-btn pp-btn-ghost"><Copy size={13} /> Copy</button>
                  </div>
                )}
              </section>

              {admin.pendingInstitutions.filter((row) => row.status === "pending").length > 0 && (
                <section className="pp-card" style={{ padding: 18 }}>
                  <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 9 }}>Awaiting verification</h2>
                  {admin.pendingInstitutions.filter((row) => row.status === "pending").map((row) => (
                    <div key={row.user_id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 0", borderTop: "1px solid var(--border)" }}>
                      <div style={{ flex: 1 }}><strong style={{ fontSize: 13.5 }}>{row.institution_name || row.institution_slug || "Unnamed institution"}</strong><span style={{ display: "block", fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 }}>{row.email}{row.domain ? ` · ${row.domain}` : ""}</span></div>
                      <button type="button" disabled={actionBusy !== null} onClick={() => void verifyInstitution(row.user_id, true)} className="pp-btn pp-btn-primary" style={{ padding: "6px 10px", fontSize: 12 }}><Check size={13} /> Approve</button>
                      <button type="button" disabled={actionBusy !== null} onClick={() => void verifyInstitution(row.user_id, false)} className="pp-btn pp-btn-outline" style={{ padding: "6px 10px", fontSize: 12 }}><X size={13} /> Reject</button>
                    </div>
                  ))}
                </section>
              )}

              <section className="pp-card" style={{ padding: 18 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700 }}>Publishing catalogue</h2>
                <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 4, marginBottom: 12 }}>Release types and cover images added here become available to every institution immediately.</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                  <input className="pp-input" value={newType} onChange={(e) => setNewType(e.target.value)} maxLength={60} placeholder="New release type (e.g. Speech)" style={{ flex: 1, minWidth: 200 }} onKeyDown={(e) => e.key === "Enter" && void addReleaseType()} />
                  <button type="button" className="pp-btn pp-btn-outline" onClick={() => void addReleaseType()}>Add type</button>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input className="pp-input" value={coverLabel} onChange={(e) => setCoverLabel(e.target.value)} maxLength={60} placeholder="Cover label" style={{ width: 160 }} />
                  <input className="pp-input" value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} maxLength={500} placeholder="https:// image URL" style={{ flex: 1, minWidth: 220 }} onKeyDown={(e) => e.key === "Enter" && void addCover()} />
                  <button type="button" className="pp-btn pp-btn-outline" onClick={() => void addCover()}>Add cover</button>
                </div>
              </section>

              <section className="pp-card" style={{ padding: 18 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 9 }}>Issued invitations ({admin.invites.length})</h2>
                {admin.invites.length === 0 ? <span style={{ fontSize: 13, color: "var(--text-muted)" }}>No invitations issued yet.</span> : admin.invites.map((invite) => {
                  const consumed = !!invite.consumed_at;
                  const expired = !consumed && new Date(invite.expires_at).getTime() <= Date.now();
                  return (
                    <div key={invite.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 0", borderTop: "1px solid var(--border)" }}>
                      <div style={{ flex: 1 }}><strong style={{ fontSize: 13.5 }}>{invite.org_name}</strong><span style={{ display: "block", fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 }}>{invite.email} · expires {formatDate(invite.expires_at)}</span></div>
                      <StatusPill value={consumed ? "accepted" : expired ? "expired" : "pending"} />
                      {!consumed && <button type="button" disabled={actionBusy !== null} onClick={() => void revokeInvite(invite.id)} className="pp-btn pp-btn-ghost" style={{ padding: "5px 8px", fontSize: 12, color: "var(--red)" }}><X size={13} /> Revoke</button>}
                    </div>
                  );
                })}
              </section>
            </div>
          )}
          {moderationRequest && (
            <div
              role="presentation"
              onMouseDown={() => !actionBusy && setModerationRequest(null)}
              style={{ position: "fixed", inset: 0, zIndex: 120, display: "grid", placeItems: "center", padding: 20, background: "rgba(2,6,23,0.68)", backdropFilter: "blur(10px)" }}
            >
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="moderation-dialog-title"
                onMouseDown={(event) => event.stopPropagation()}
                className="pp-card pp-rise"
                style={{ width: "100%", maxWidth: 480, padding: 24, boxShadow: "var(--shadow-lg)" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                  <span style={{ width: 38, height: 38, borderRadius: 11, display: "grid", placeItems: "center", background: "var(--danger-soft)", color: "var(--red)" }}>
                    {moderationRequest.kind === "account" ? <Ban size={18} /> : <FileText size={18} />}
                  </span>
                  <div>
                    <h2 id="moderation-dialog-title" style={{ fontSize: 18, fontWeight: 750 }}>{moderationVerb(moderationRequest)} {moderationRequest.kind === "account" ? "account" : "post"}</h2>
                    <p style={{ marginTop: 2, fontSize: 12.5, color: "var(--text-muted)", overflowWrap: "anywhere" }}>
                      {moderationRequest.kind === "account" ? moderationRequest.row.email : moderationRequest.row.heading}
                    </p>
                  </div>
                </div>
                <label htmlFor="moderation-reason" style={{ display: "block", marginTop: 20, marginBottom: 7, fontSize: 13, fontWeight: 650 }}>Audit reason</label>
                <textarea
                  id="moderation-reason"
                  autoFocus
                  className="pp-input"
                  value={moderationReason}
                  onChange={(event) => setModerationReason(event.target.value)}
                  maxLength={1000}
                  rows={4}
                  placeholder="Explain why this action is required…"
                  style={{ resize: "vertical", lineHeight: 1.55 }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 8, color: "var(--text-faint)", fontSize: 11.5 }}>
                  <span>This reason is written to the immutable audit log.</span>
                  <span>{moderationReason.length}/1000</span>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 20 }}>
                  <button type="button" className="pp-btn pp-btn-ghost" disabled={Boolean(actionBusy)} onClick={() => setModerationRequest(null)}>Cancel</button>
                  <button type="button" className="pp-btn pp-btn-primary" disabled={Boolean(actionBusy) || moderationReason.trim().length < 3} onClick={() => void confirmModeration()} style={{ opacity: actionBusy || moderationReason.trim().length < 3 ? 0.6 : 1 }}>
                    {actionBusy ? "Applying…" : `${moderationVerb(moderationRequest)} now`}
                  </button>
                </div>
              </section>
            </div>
          )}
        </>
      )}
    </AdminShell>
  );
}
