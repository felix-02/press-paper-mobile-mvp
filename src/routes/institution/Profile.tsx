import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Globe, MapPin, ShieldCheck, Pencil, UserPlus, Check, Upload } from "lucide-react";
import { AppShell } from "@/components/shells/AppShell";
import { PageHeader, Panel } from "@/components/dashboard/Panels";
import { InstitutionMark } from "@/components/brand/InstitutionMark";
import { Avatar } from "@/components/brand/Avatar";
import { Verified } from "@/components/primitives/Bits";
import { useAppStore } from "@/store/useAppStore";
import { useAuth } from "@/auth/AuthProvider";
import { useOrg } from "@/lib/useOrg";
import { supabase } from "@/lib/supabase";
import { safeExternalUrl } from "@/lib/externalUrl";
import { usePageTitle } from "@/lib/usePageTitle";
import type { Institution } from "@/types";

function CheckRow({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: "var(--text-secondary)" }}>
      <span style={{ width: 18, height: 18, borderRadius: 999, background: "rgba(52,211,153,0.14)", display: "grid", placeItems: "center", flexShrink: 0 }}>
        <Check size={11} color="var(--green)" strokeWidth={3} />
      </span>
      {label}
    </div>
  );
}

function VerifiedBlock({ domain, since }: { domain?: string | null; since?: string | null }) {
  const sinceLabel = since ? new Date(since).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "8px 4px 4px" }}>
        <div style={{ width: 56, height: 56, borderRadius: 999, background: "rgba(59,130,246,0.12)", display: "grid", placeItems: "center" }}>
          <ShieldCheck size={28} className="pp-verified" />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14 }}>
          <span style={{ fontSize: 15.5, fontWeight: 700 }}>Verified Institution</span>
          <Verified size={15} />
        </div>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, marginTop: 8 }}>
          Verified as an official public institution{sinceLabel ? ` since ${sinceLabel}` : ""}.
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
        <CheckRow label="Identity confirmed" />
        {domain && <CheckRow label={`Work email domain recorded (${domain})`} />}
        <CheckRow label="Publishing verification active" />
      </div>
    </>
  );
}

function VerificationPanel({ orgVerified }: { orgVerified: boolean }) {
  const { profile } = useAuth();
  const status = profile?.verification_status ?? "unverified";
  const storedDomain = profile?.verification_domain ?? "";

  if (orgVerified || status === "verified") return <VerifiedBlock domain={storedDomain || null} since={profile?.verified_at} />;

  if (status === "rejected") {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", background: "rgba(239,68,68,0.12)", padding: "3px 9px", borderRadius: 999 }}>NOT APPROVED</span>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          This institution account wasn't approved. If you believe this is a mistake, contact support from your organisation's official email and we'll review it again.
        </p>
      </div>
    );
  }

  // pending / unverified — awaiting admin review (no DNS, no setup).
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <ShieldCheck size={18} color="var(--amber)" />
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--amber)", background: "rgba(245,158,11,0.12)", padding: "3px 9px", borderRadius: 999 }}>PENDING REVIEW</span>
      </div>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
        {storedDomain ? (
          <>We've recorded your organisation domain <strong style={{ color: "var(--text)" }}>{storedDomain}</strong>. A Presspaper reviewer will approve your account shortly.</>
        ) : (
          <>Your institution account is awaiting review by a Presspaper reviewer.</>
        )}
      </p>
      <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6, marginTop: 8 }}>
        Once approved you'll get the verified badge and can publish. Verification is based on your work-email domain — no DNS setup needed.
      </p>
    </div>
  );
}

function initialsFrom(name: string | null, email: string): string {
  const base = name?.trim() || email;
  const parts = base.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || base[0]?.toUpperCase() || "?";
}

export function Profile() {
  usePageTitle("Organisation profile");
  const pushToast = useAppStore((s) => s.pushToast);
  const navigate = useNavigate();
  const { user, profile, profileReady, profileError, refreshProfile } = useAuth();
  const org = useOrg();
  const i: Institution = {
    slug: profile?.institution_slug || "institution",
    name: profile?.institution_name?.trim() || "Your organisation",
    category: profile?.org_category?.trim() || "Institution",
    verified: org.verified,
    color: "#2563eb",
    color2: "#4338ca",
    mark: "generic",
  };
  const vstatus = org.verified ? "verified" : profile?.verification_status ?? "unverified";
  const canEditProfile = org.role === "owner";
  const [orgName, setOrgName] = useState(profile?.institution_name ?? "");
  const [bio, setBio] = useState(profile?.org_description || profile?.bio || "");
  const [orgWebsite, setOrgWebsite] = useState(profile?.org_website ?? "");
  const [orgLocation, setOrgLocation] = useState(profile?.org_location ?? "");
  const [orgCategory, setOrgCategory] = useState(profile?.org_category ?? "");
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const uploadLogo = async (file: File) => {
    if (!supabase || !user || !profile?.institution_slug) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 2 * 1024 * 1024) {
      pushToast({ title: "Use a square PNG, JPEG or WebP under 2 MB", variant: "info" });
      return;
    }
    setUploadingLogo(true);
    const path = `${profile.institution_slug}/logo-${Date.now()}.${file.type.split("/")[1]}`;
    const { error: uploadError } = await supabase.storage.from("org-media").upload(path, file, { cacheControl: "31536000" });
    if (uploadError) {
      setUploadingLogo(false);
      pushToast({ title: "Couldn't upload the logo", description: uploadError.message, variant: "error" });
      return;
    }
    const { data } = supabase.storage.from("org-media").getPublicUrl(path);
    const url = data?.publicUrl;
    const { error: saveError } = url
      ? await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id)
      : { error: new Error("no url") } as { error: Error };
    setUploadingLogo(false);
    if (saveError) {
      pushToast({ title: "Couldn't save the logo", variant: "error" });
      return;
    }
    await refreshProfile();
    pushToast({ title: "Logo updated", description: "Readers now see it across the platform.", variant: "success" });
  };
  const displayName = orgName.trim() || profile?.institution_name?.trim() || "Your organisation";
  const location = orgLocation.trim() || "Location not provided";
  const website = orgWebsite.trim() || "Website not provided";
  const category = orgCategory.trim() || "Category not provided";
  const markedInstitution = { ...i, name: displayName, category, verified: vstatus === "verified", avatarUrl: profile?.avatar_url || undefined };

  // Initialise the editable fields from the loaded profile (registration data).
  useEffect(() => {
    if (profile) {
      setOrgName(profile.institution_name || "");
      setBio(profile.org_description || profile.bio || "");
      setOrgWebsite(profile.org_website || "");
      setOrgLocation(profile.org_location || "");
      setOrgCategory(profile.org_category || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const saveProfile = async () => {
    const cleanBio = bio.trim();
    const cleanWebsite = orgWebsite.trim() ? safeExternalUrl(orgWebsite) : null;
    const cleanLocation = orgLocation.trim();
    const cleanCategory = orgCategory.trim();
    if (!canEditProfile) {
      pushToast({ title: "Only the organisation owner can edit this profile", variant: "info" });
      return;
    }
    if (
      cleanBio.length > 5000
      || cleanLocation.length > 300
      || cleanCategory.length > 100
      || (orgWebsite.trim() && !cleanWebsite)
    ) {
      pushToast({ title: "Check the profile details", description: "Use a valid website and keep each field within its limit.", variant: "info" });
      return;
    }
    if (!supabase || !user) {
      pushToast({ title: "Couldn't save", description: "Reconnect your account and try again.", variant: "error" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      org_description: cleanBio,
      bio: cleanBio,
      org_website: cleanWebsite,
      org_location: cleanLocation || null,
      org_category: cleanCategory || null,
    }).eq("id", user.id);
    setSaving(false);
    if (error) {
      pushToast({ title: "Couldn't save", description: "Review the details and try again.", variant: "error" });
      return;
    }
    await refreshProfile();
    pushToast({ title: "Profile updated", description: "Your organisation details have been saved.", variant: "success" });
  };

  if (!profileReady) {
    return (
      <AppShell kind="institution" maxWidth={1180}>
        <div className="pp-card" role="status" style={{ padding: 36, textAlign: "center", color: "var(--text-secondary)" }}>Loading organisation profile…</div>
      </AppShell>
    );
  }

  if (profileError || !profile) {
    return (
      <AppShell kind="institution" maxWidth={1180}>
        <PageHeader title="Organisation Profile" subtitle="Manage how your organisation appears on Presspaper." />
        <div className="pp-card" role="alert" style={{ padding: 36, textAlign: "center", color: "var(--text-secondary)" }}>{profileError ?? "Organisation profile data is unavailable."}</div>
      </AppShell>
    );
  }

  return (
    <AppShell kind="institution" maxWidth={1180}>
      <PageHeader title="Organisation Profile" subtitle={`Manage how ${displayName} appears on Presspaper.`} />

      {/* header card */}
      <div className="pp-card" style={{ overflow: "hidden", marginBottom: 18 }}>
        <div style={{ height: 110, background: `linear-gradient(125deg, ${i.color} 0%, ${i.color2 ?? i.color} 100%)`, position: "relative" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.18)" }} />
        </div>
        <div style={{ padding: "0 24px 22px" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: -34 }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
              <div style={{ borderRadius: 18, border: "4px solid var(--surface-1)", lineHeight: 0 }}>
                <InstitutionMark institution={markedInstitution} size={80} shape="square" />
              </div>
              <div style={{ paddingBottom: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "0" }}>{displayName}</h2>
                  {vstatus === "verified" ? (
                    <Verified size={16} />
                  ) : (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: vstatus === "pending" ? "var(--amber)" : "var(--text-muted)",
                        background: vstatus === "pending" ? "rgba(245,158,11,0.12)" : "var(--surface-2)",
                        border: "1px solid var(--border)",
                        padding: "2px 9px",
                        borderRadius: 999,
                      }}
                    >
                      {vstatus === "pending" ? "Pending" : "Unverified"}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {canEditProfile && (
              <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                <label className="pp-btn pp-btn-outline" style={{ cursor: "pointer" }}>
                  <Upload size={14} /> {uploadingLogo ? "Uploading…" : "Update logo"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    style={{ display: "none" }}
                    disabled={uploadingLogo}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void uploadLogo(file);
                    }}
                  />
                </label>
                <button type="button" onClick={() => document.getElementById("organisation-description")?.focus()} className="pp-btn pp-btn-outline">
                  <Pencil size={14} /> Edit profile
                </button>
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 20, marginTop: 16, fontSize: 13, color: "var(--text-muted)", flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{category}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><MapPin size={14} /> {location}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--blue)" }}><Globe size={14} /> {website}</span>
          </div>
        </div>
      </div>

      <div className="pp-responsive-grid" style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 18, alignItems: "start" }}>
        {/* left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <Panel title="Organisation details">
            <div className="pp-responsive-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <label style={{ display: "block" }}>
                <span style={{ display: "block", fontSize: 13, color: "var(--text-secondary)", marginBottom: 6 }}>Organisation name</span>
                <input id="organisation-name" className="pp-input" value={orgName} maxLength={160} disabled readOnly />
                <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>Contact a platform administrator to change the verified organisation name.</span>
              </label>
              <label style={{ display: "block" }}>
                <span style={{ display: "block", fontSize: 13, color: "var(--text-secondary)", marginBottom: 6 }}>Category</span>
                <input className="pp-input" value={orgCategory} maxLength={100} disabled={!canEditProfile} onChange={(event) => setOrgCategory(event.target.value)} />
              </label>
              <label style={{ display: "block" }}>
                <span style={{ display: "block", fontSize: 13, color: "var(--text-secondary)", marginBottom: 6 }}>Location (HQ)</span>
                <input className="pp-input" value={orgLocation} maxLength={300} disabled={!canEditProfile} onChange={(event) => setOrgLocation(event.target.value)} />
              </label>
              <label style={{ display: "block", gridColumn: "1 / -1" }}>
                <span style={{ display: "block", fontSize: 13, color: "var(--text-secondary)", marginBottom: 6 }}>Website</span>
                <input className="pp-input" value={orgWebsite} maxLength={500} disabled={!canEditProfile} onChange={(event) => setOrgWebsite(event.target.value)} />
              </label>
              <label style={{ display: "block", gridColumn: "1 / -1" }}>
                <span style={{ display: "block", fontSize: 13, color: "var(--text-secondary)", marginBottom: 6 }}>Description</span>
                <textarea
                  className="pp-input"
                  id="organisation-description"
                  rows={3}
                  value={bio}
                  maxLength={5000}
                  disabled={!canEditProfile}
                  onChange={(e) => setBio(e.target.value)}
                  style={{ resize: "vertical", lineHeight: 1.6, fontFamily: "inherit" }}
                />
              </label>
            </div>
            {canEditProfile && <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
              <button type="button" onClick={() => {
                setOrgName(profile.institution_name || "");
                setBio(profile.org_description || profile.bio || "");
                setOrgWebsite(profile.org_website || "");
                setOrgLocation(profile.org_location || "");
                setOrgCategory(profile.org_category || "");
              }} className="pp-btn pp-btn-ghost">Cancel</button>
              <button
                type="button"
                className="pp-btn pp-btn-primary"
                onClick={saveProfile}
                disabled={saving}
                style={{ opacity: saving ? 0.7 : 1 }}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>}
          </Panel>

          <Panel
            title="Authorised people"
            action={
              org.can.invite ? (
                <button type="button" onClick={() => navigate("/inst/team")} className="pp-btn pp-btn-outline" style={{ padding: "6px 13px", fontSize: 13 }}>
                  <UserPlus size={14} /> Invite
                </button>
              ) : undefined
            }
            bodyStyle={{ padding: 0 }}
          >
            {org.loading ? (
              <div role="status" style={{ padding: 18, fontSize: 13.5, color: "var(--text-muted)" }}>Loading team members…</div>
            ) : org.error ? (
              <div role="alert" style={{ padding: 18, fontSize: 13.5, color: "var(--text-muted)" }}>{org.error}</div>
            ) : !org.available ? (
              <div style={{ padding: 18, fontSize: 13.5, color: "var(--text-muted)" }}>Organisation team data is unavailable for this account.</div>
            ) : org.activeMembers.length === 0 ? (
              <div style={{ padding: 18, fontSize: 13.5, color: "var(--text-muted)" }}>No active members yet.</div>
            ) : (
              org.activeMembers.map((p, idx) => (
                <div
                  key={p.user_id}
                  style={{ display: "flex", alignItems: "center", gap: 13, padding: "14px 18px", borderTop: idx === 0 ? "none" : "1px solid var(--border)" }}
                >
                  <Avatar initials={initialsFrom(p.full_name, p.email)} size={38} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{p.full_name || p.email}</div>
                    <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{p.email}</div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: p.role === "owner" ? "#b45309" : "var(--text-secondary)", background: "var(--surface-3)", padding: "3px 10px", borderRadius: 999, textTransform: "capitalize" }}>
                    {p.role}
                  </span>
                </div>
              ))
            )}
            {org.available && (
              <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border)" }}>
                <button type="button" onClick={() => navigate("/inst/team")} className="pp-link-muted" style={{ fontSize: 13 }}>
                  Manage team & roles →
                </button>
              </div>
            )}
          </Panel>
        </div>

        {/* right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <Panel title="Verification">
            <VerificationPanel orgVerified={org.verified} />
          </Panel>

          <Panel title="Workspace access">
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                ["Your role", org.loading ? "Loading…" : org.error ? "Unavailable" : org.role ? `${org.role[0].toUpperCase()}${org.role.slice(1)}` : "No active role"],
                ["Active members", org.loading ? "Loading…" : org.error ? "Unavailable" : String(org.activeMembers.length)],
                ["Pending invitations", org.loading ? "Loading…" : org.error ? "Unavailable" : String(org.invites.length)],
                ["Verification", vstatus === "verified" ? "Verified" : "Not verified"],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{k}</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
