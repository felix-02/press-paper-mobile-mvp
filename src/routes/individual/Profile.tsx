import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CalendarDays, LogOut, Pencil, Bookmark, UserPlus, X, Compass } from "lucide-react";
import { AppShell } from "@/components/shells/AppShell";
import { Avatar } from "@/components/brand/Avatar";
import { InstitutionMark } from "@/components/brand/InstitutionMark";
import { ReleaseCard } from "@/components/release/ReleaseCard";
import { Verified } from "@/components/primitives/Bits";
import { Tabs } from "@/components/primitives/Tabs";
import { EmptyState } from "@/components/primitives/EmptyState";
import { useAppStore } from "@/store/useAppStore";
import { useAuth } from "@/auth/AuthProvider";
import { useResolvedSaved } from "@/lib/useResolvedSaved";
import { useActivity, relativeTime } from "@/lib/useActivity";
import { supabase } from "@/lib/supabase";
import { usePublicInstitutions } from "@/lib/usePublicInstitutions";
import { usePageTitle } from "@/lib/usePageTitle";
import type { Institution } from "@/types";

const TABS = ["Following", "Saved", "Activity"] as const;

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 19, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 }}>{label}</div>
    </div>
  );
}

export function Profile() {
  usePageTitle("Your profile");
  const followed = useAppStore((s) => s.followedSlugs);
  const watchlists = useAppStore((s) => s.watchlists);
  const pushToast = useAppStore((s) => s.pushToast);
  const navigate = useNavigate();
  const { signOut, profile, refreshProfile, user } = useAuth();
  const { releases: saved } = useResolvedSaved();
  const activity = useActivity();
  const directory = usePublicInstitutions();
  // Only institutions that still exist in the live directory are listed —
  // stale follow rows are never fabricated into placeholder entries.
  const followedInstitutions: Institution[] = directory.institutions.filter((institution) => followed.has(institution.slug));
  const [params, setParams] = useSearchParams();
  const tabParam = (params.get("tab") || "following").toLowerCase();
  const tab = tabParam === "saved" ? "Saved" : tabParam === "activity" ? "Activity" : "Following";
  const setTab = (t: string) => {
    const p = new URLSearchParams(params);
    p.set("tab", t.toLowerCase());
    setParams(p);
  };
  const [editing, setEditing] = useState(false);
  const displayName = profile?.full_name || user?.email?.split("@")[0] || "You";
  const handle = "@" + (displayName.split(" ")[0]?.toLowerCase() || "you");
  const bio = profile?.bio?.trim() || null;
  const joined = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
    : null;
  // For historical activity rows, show the live name when the institution
  // still exists, otherwise the raw slug — never an invented display name.
  const institutionNameForSlug = (slug: string): string =>
    directory.institutions.find((institution) => institution.slug === slug)?.name ?? slug;

  const logout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <AppShell kind="individual" maxWidth={900}>
      {/* header card */}
      <div className="pp-card" style={{ overflow: "hidden" }}>
        <div style={{ height: 96, background: "linear-gradient(120deg, #2563eb 0%, #6366f1 55%, #0ea5e9 100%)" }} />
        <div style={{ padding: "0 24px 22px" }}>
          <div className="pp-profile-header" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: -34 }}>
            <div className="pp-profile-identity" style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
              <div style={{ borderRadius: 999, border: "4px solid var(--surface-1)", lineHeight: 0 }}>
                <Avatar size={88} name={displayName} />
              </div>
              <div style={{ paddingBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "0" }}>{displayName}</h1>
                </div>
                <div style={{ fontSize: 13.5, color: "var(--text-muted)" }}>{handle}</div>
              </div>
            </div>
            <div className="pp-profile-actions" style={{ display: "flex", gap: 10, paddingBottom: 6 }}>
              <button type="button" onClick={() => setEditing(true)} className="pp-btn pp-btn-ghost">
                <Pencil size={15} /> Edit profile
              </button>
              <button type="button" onClick={logout} className="pp-btn pp-btn-outline">
                <LogOut size={15} /> Log out
              </button>
            </div>
          </div>

          {bio && <p style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 16, maxWidth: 560, lineHeight: 1.55 }}>{bio}</p>}

          <div style={{ display: "flex", gap: 20, marginTop: 14, fontSize: 13, color: "var(--text-muted)" }}>
            {joined && <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <CalendarDays size={14} /> Joined {joined}
            </span>}
          </div>

          <div style={{ display: "flex", gap: 34, marginTop: 20 }}>
            <Stat value={directory.loading ? "…" : String(followedInstitutions.length)} label="Following" />
            <Stat value={String(saved.length)} label="Saved" />
            <Stat value={String(watchlists.length)} label="Watchlists" />
          </div>
        </div>
      </div>

      {/* tabs */}
      <Tabs tabs={TABS} active={tab} onChange={setTab} style={{ marginTop: 26, marginBottom: 22 }} />

      {tab === "Following" && (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>Institutions you follow</h2>
          {directory.loading ? (
            <div className="pp-card" role="status" style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13.5 }}>Loading institutions…</div>
          ) : followedInstitutions.length === 0 ? (
            <EmptyState
              compact
              icon={<Compass size={22} />}
              title="You're not following anyone yet"
              body="Explore sources and follow the institutions you care about."
              action={
                <Link to="/explore" className="pp-btn pp-btn-primary">
                  <Compass size={15} /> Explore institutions
                </Link>
              }
            />
          ) : (
            <div className="pp-responsive-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
              {followedInstitutions.map((i) => (
                <Link key={i.slug} to={`/institution/${i.slug}`} className="pp-card" style={{ padding: 14, display: "flex", alignItems: "center", gap: 11 }}>
                  <InstitutionMark institution={i} size={36} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.name}</span>
                      {i.verified && <Verified size={11} />}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{i.category}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "Saved" && (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>Saved releases</h2>
          {saved.length === 0 ? (
            <EmptyState
              compact
              icon={<Bookmark size={22} />}
              title="Nothing saved yet"
              body="Tap the bookmark on any release to keep it here."
              action={
                <Link to="/home" className="pp-btn pp-btn-outline">
                  Browse your feed
                </Link>
              }
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {saved.map((r) => (
                <ReleaseCard key={r.id} release={r} variant="saved" />
              ))}
            </div>
          )}
        </>
      )}

      {tab === "Activity" && (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>Recent activity</h2>
          {activity.available ? (
            activity.loading ? (
              <div className="pp-card" style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13.5 }}>Loading…</div>
            ) : activity.items.length === 0 ? (
              <div className="pp-card" style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13.5 }}>
                No activity yet. Follow institutions and save releases to see them here.
              </div>
            ) : (
              <div className="pp-card" style={{ padding: 6 }}>
                {activity.items.map((a) =>
                  a.kind === "save" ? (
                    <Link key={a.key} to={`/release/${a.releaseId}`} style={activityRow}>
                      <span style={activityIcon("rgba(59,130,246,0.12)")}>
                        <Bookmark size={15} color="var(--blue)" />
                      </span>
                      <span style={{ fontSize: 13.5, flex: 1 }}>
                        You saved <strong>{a.heading}</strong>
                      </span>
                      <span style={{ fontSize: 12, color: "var(--text-muted)", flexShrink: 0 }}>{relativeTime(a.ts)}</span>
                    </Link>
                  ) : (
                    <Link key={a.key} to={`/institution/${a.slug}`} style={activityRow}>
                      <span style={activityIcon("rgba(52,211,153,0.14)")}>
                        <UserPlus size={15} color="var(--green)" />
                      </span>
                      <span style={{ fontSize: 13.5, flex: 1 }}>
                        You followed <strong>{institutionNameForSlug(a.slug!)}</strong>
                      </span>
                      <span style={{ fontSize: 12, color: "var(--text-muted)", flexShrink: 0 }}>{relativeTime(a.ts)}</span>
                    </Link>
                  )
                )}
              </div>
            )
          ) : (
            <div className="pp-card" style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13.5 }}>
              Activity is temporarily unavailable.
            </div>
          )}
        </>
      )}

      {editing && (
        <EditProfileModal
          initialName={displayName}
          initialBio={bio ?? ""}
          onClose={() => setEditing(false)}
          onSave={async (name, nextBio) => {
            if (supabase && user) {
              const cleanName = name.trim();
              const cleanBio = nextBio.trim();
              if (!cleanName || cleanName.length > 200 || cleanBio.length > 5000) {
                pushToast({ title: "Check your profile details", description: "Names can use 200 characters and bios 5,000.", variant: "info" });
                return;
              }
              const { error } = await supabase.from("profiles").update({ full_name: cleanName, bio: cleanBio || null }).eq("id", user.id);
              if (error) {
                pushToast({ title: "Couldn't save", description: "Check the name and try again.", variant: "error" });
                return;
              }
              await refreshProfile();
            }
            setEditing(false);
            pushToast({ title: "Profile updated", variant: "success" });
          }}
        />
      )}
    </AppShell>
  );
}

const activityRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 11,
  padding: "11px 12px",
  borderBottom: "1px solid var(--border)",
};
const activityIcon = (bg: string): React.CSSProperties => ({
  width: 30,
  height: 30,
  borderRadius: 999,
  background: bg,
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
});

function EditProfileModal({
  initialName,
  initialBio,
  onClose,
  onSave,
}: {
  initialName: string;
  initialBio: string;
  onClose: () => void;
  onSave: (name: string, bio: string) => void | Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [bio, setBio] = useState(initialBio);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "grid", placeItems: "center", zIndex: 100, padding: 20 }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="edit-profile-title" onClick={(e) => e.stopPropagation()} className="pp-card" style={{ width: "100%", maxWidth: 440, padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h3 id="edit-profile-title" style={{ fontSize: 17, fontWeight: 700 }}>Edit profile</h3>
          <button type="button" onClick={onClose} aria-label="Close" style={{ color: "var(--text-muted)" }}>
            <X size={18} />
          </button>
        </div>
        <label style={{ display: "block", fontSize: 13, color: "var(--text-secondary)", marginBottom: 6 }}>Full name</label>
        <input className="pp-input" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} autoFocus />
        <label style={{ display: "block", fontSize: 13, color: "var(--text-secondary)", margin: "14px 0 6px" }}>Bio</label>
        <textarea className="pp-input" value={bio} maxLength={5000} rows={5} onChange={(event) => setBio(event.target.value)} style={{ resize: "vertical" }} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button type="button" onClick={onClose} className="pp-btn pp-btn-ghost">
            Cancel
          </button>
          <button
            type="button"
            className="pp-btn pp-btn-primary"
            disabled={saving || !name.trim()}
            onClick={async () => {
              setSaving(true);
              await onSave(name.trim(), bio.trim());
              setSaving(false);
            }}
            style={{ opacity: saving || !name.trim() ? 0.7 : 1 }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
