import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Send, FileText, Image as ImageIcon, Check, Lock, ShieldCheck, Upload } from "lucide-react";
import { AppShell } from "@/components/shells/AppShell";
import { PageHeader } from "@/components/dashboard/Panels";
import { TypeBadge } from "@/components/release/ReleaseTypeBadge";
import { MediaTile } from "@/components/media/MediaTile";
import { InstitutionMark } from "@/components/brand/InstitutionMark";
import { Verified } from "@/components/primitives/Bits";
import type { Institution, MediaScene, ReleaseStatus, ReleaseType } from "@/types";
import { useAppStore } from "@/store/useAppStore";
import { supabase, type ReleaseRow } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";
import { useOrg } from "@/lib/useOrg";
import { RichTextEditor } from "@/components/common/RichTextEditor";
import { track } from "@/lib/analytics";
import { sanitizeRichText } from "@/lib/sanitizeHtml";
import { usePageTitle } from "@/lib/usePageTitle";

const TYPES: ReleaseType[] = ["Announcement", "Publication", "Consultation", "Statistics & Research"];
const SCENES: { scene: MediaScene; label: string }[] = [
  { scene: "wind-farm", label: "Renewables" },
  { scene: "parliament", label: "Government" },
  { scene: "cardiff-bay", label: "Cardiff Bay" },
  { scene: "coast", label: "Coast" },
  { scene: "town", label: "Community" },
  { scene: "skyline", label: "City" },
];

function isReleaseType(value: string): value is ReleaseType {
  return value.trim().length > 0;
}

function isMediaScene(value: string): value is MediaScene {
  return SCENES.some(({ scene }) => scene === value) || /^https:\/\//.test(value);
}

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 7 }}>
      <span style={{ fontSize: 13.5, fontWeight: 500 }}>{children}</span>
      {hint && <span style={{ fontSize: 12, color: "var(--text-faint)" }}>{hint}</span>}
    </div>
  );
}

export function Publish() {
  const navigate = useNavigate();
  const { id: editingId } = useParams();
  usePageTitle(editingId ? "Edit release" : "Publish");
  const pushToast = useAppStore((s) => s.pushToast);
  const { user, profile, profileReady } = useAuth();
  const org = useOrg();
  const previewInstitution: Institution = {
    slug: org.slug || profile?.institution_slug || "institution",
    name: profile?.institution_name?.trim() || "Your organisation",
    category: profile?.org_category?.trim() || "Institution",
    verified: org.verified,
    color: "#2563eb",
    color2: "#4338ca",
    mark: "generic",
  };

  const [heading, setHeading] = useState("");
  const [subheading, setSubheading] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<ReleaseType>("Announcement");
  const [scene, setScene] = useState<MediaScene>("wind-farm");
  const [originalPublishedAt, setOriginalPublishedAt] = useState<string | null>(null);
  const [loadingRelease, setLoadingRelease] = useState(Boolean(editingId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [headingError, setHeadingError] = useState(false);
  const [subheadingError, setSubheadingError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [dbTypes, setDbTypes] = useState<string[]>([]);
  const [platformCovers, setPlatformCovers] = useState<{ label: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);

  // Platform catalogue: release types + extra covers managed by the super admin.
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.from("platform_release_types").select("name").order("created_at").then(({ data }) => {
      if (active) setDbTypes(((data as { name: string }[] | null) ?? []).map((r) => r.name));
    });
    void supabase.from("platform_covers").select("label, url").order("created_at").then(({ data }) => {
      if (active) setPlatformCovers(((data as { label: string; url: string }[] | null) ?? []));
    });
    return () => { active = false; };
  }, []);
  const availableTypes = dbTypes.length > 0 ? dbTypes : TYPES;

  const uploadCover = async (file: File) => {
    if (!supabase || !org.slug) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 3 * 1024 * 1024) {
      pushToast({ title: "Use a PNG, JPEG or WebP under 3 MB", variant: "info" });
      return;
    }
    setUploading(true);
    const path = `${org.slug}/cover-${Date.now()}.${file.type.split("/")[1]}`;
    const { error } = await supabase.storage.from("org-media").upload(path, file, { cacheControl: "31536000", upsert: false });
    if (error) {
      setUploading(false);
      pushToast({ title: "Couldn't upload the cover", description: error.message, variant: "error" });
      return;
    }
    const { data } = supabase.storage.from("org-media").getPublicUrl(path);
    setUploading(false);
    if (data?.publicUrl) {
      setScene(data.publicUrl as MediaScene);
      pushToast({ title: "Cover uploaded", variant: "success" });
    }
  };

  const headingRef = useRef<HTMLInputElement>(null);
  const subheadingRef = useRef<HTMLInputElement>(null);

  // Guard against losing unsaved work on refresh/close. In-app navigation is
  // still free — drafts save in one click and nothing here is destructive.
  const snapshot = JSON.stringify([heading, subheading, body, type, scene]);
  const dirty = !busy && !loadingRelease && snapshot !== savedSnapshot && Boolean(heading.trim() || subheading.trim() || body.replace(/<[^>]*>/g, "").trim());
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!editingId) {
      setHeading("");
      setSubheading("");
      setBody("");
      setType("Announcement");
      setScene("wind-farm");
      setOriginalPublishedAt(null);
      setHeadingError(false);
      setSubheadingError(false);
      setReviewing(false);
      setLoadingRelease(false);
      setLoadError(null);
      setSavedSnapshot(JSON.stringify(["", "", "", "Announcement", "wind-farm"]));
      return;
    }
    if (!profileReady || org.loading) {
      setLoadingRelease(true);
      return;
    }
    if (!supabase || !org.slug) {
      setLoadingRelease(false);
      setLoadError("This release isn't available in an organisation workspace.");
      return;
    }

    let active = true;
    setLoadingRelease(true);
    setLoadError(null);
    supabase
      .from("release_details")
      .select("*")
      .eq("id", editingId)
      .eq("institution_slug", org.slug)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        const row = data as ReleaseRow | null;
        if (error || !row) {
          setLoadError("We couldn't load that release. It may have been removed or you may not have access.");
          setLoadingRelease(false);
          return;
        }
        setHeading(row.heading);
        setSubheading(row.subheading ?? "");
        setBody(row.body ?? "");
        setType(isReleaseType(row.type) ? row.type : "Announcement");
        setScene(isMediaScene(row.scene) ? row.scene : "wind-farm");
        setOriginalPublishedAt(row.published_at);
        setSavedSnapshot(JSON.stringify([
          row.heading,
          row.subheading ?? "",
          row.body ?? "",
          isReleaseType(row.type) ? row.type : "Announcement",
          isMediaScene(row.scene) ? row.scene : "wind-farm",
        ]));
        setLoadingRelease(false);
      });

    return () => {
      active = false;
    };
  }, [editingId, profileReady, org.loading, org.slug]);

  const requireHeading = (): boolean => {
    if (!heading.trim()) {
      setHeadingError(true);
      headingRef.current?.focus();
      pushToast({ title: "Add a heading to continue", description: "Every release needs a headline before it can be published.", variant: "info" });
      return false;
    }
    if (heading.trim().length > 200 || subheading.length > 250 || body.length > 200000) {
      pushToast({ title: "Release is too long", description: "Shorten the headline, summary, or body before saving.", variant: "info" });
      return false;
    }
    return true;
  };

  const validateForPublish = (): boolean => {
    if (!requireHeading()) return false;
    if (!subheading.trim()) {
      setSubheadingError(true);
      subheadingRef.current?.focus();
      pushToast({ title: "Add a subheading to continue", description: "Summarise the release before reviewing it.", variant: "info" });
      return false;
    }
    const bodyText = body.replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/gi, " ").trim();
    if (!bodyText) {
      document.querySelector<HTMLElement>(".pp-rte")?.focus();
      pushToast({ title: "Add the release body to continue", description: "The full official text is required before publishing.", variant: "info" });
      return false;
    }
    return true;
  };

  // All releases persist to the organisation workspace in Postgres.
  const persist = async (status: ReleaseStatus): Promise<string | null> => {
    if (!supabase || !user) {
      pushToast({ title: "Publishing is unavailable", description: "Reconnect your account and try again.", variant: "error" });
      return null;
    }
    if (!org.slug || !org.can.publish || (status === "Published" && !org.verified)) {
      pushToast({ title: "Publishing access is unavailable", description: "Your organisation membership or verification is incomplete.", variant: "error" });
      return null;
    }

    const content = {
      type,
      status,
      heading: heading.trim(),
      subheading: subheading.trim() || null,
      body: body.trim() || null,
      scene,
      published_at: status === "Published" ? (originalPublishedAt ?? new Date().toISOString()) : null,
    };

    const result = editingId
      ? await supabase
          .from("releases")
          .update(content)
          .eq("id", editingId)
          .eq("institution_slug", org.slug)
          .select("id")
          .maybeSingle()
      : await supabase.from("releases").insert({
        owner: user.id,
        institution_slug: org.slug,
        institution_name: profile?.institution_name ?? null,
        ...content,
      }).select("id").single();

    const persisted = result.data as { id: string } | null;
    if (result.error || !persisted?.id) {
      pushToast({ title: "Couldn't save release", description: "Check your publishing access and try again.", variant: "error" });
      return null;
    }
    return persisted.id;
  };

  const submit = async (status: ReleaseStatus) => {
    if (busy) return;
    if (!requireHeading()) return;
    setBusy(true);
    const releaseId = await persist(status);
    setBusy(false);
    if (!releaseId) return;
    setSavedSnapshot(JSON.stringify([heading, subheading, body, type, scene]));
    track(status === "Published" ? "release_published" : "release_draft_saved", { releaseId, status, type });
    if (status === "Published") {
      pushToast({ title: "Release published", description: "It's now live in your organisation's releases.", variant: "success" });
    } else {
      pushToast({ title: "Saved as draft", description: "Your draft is available in Releases.", variant: "info" });
    }
    navigate("/inst/releases");
  };

  const publish = () => {
    if (!org.verified) {
      pushToast({ title: "Approval required before publishing", description: "You can continue saving drafts while the organisation is reviewed.", variant: "info" });
      return;
    }
    if (validateForPublish()) setReviewing(true);
  };
  const saveDraft = () => submit("Draft");

  useEffect(() => {
    if (!reviewing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setReviewing(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [reviewing, busy]);

  if (!profileReady || org.loading || loadingRelease) {
    return (
      <AppShell kind="institution" maxWidth={760}>
        <div style={{ minHeight: "50vh", display: "grid", placeItems: "center", color: "var(--text-muted)" }}>Checking publishing access…</div>
      </AppShell>
    );
  }

  if (org.error) {
    return (
      <AppShell kind="institution" maxWidth={760}>
        <div className="pp-card" role="alert" style={{ padding: 40, textAlign: "center" }}>
          <h1 style={{ fontSize: 19, fontWeight: 700, marginBottom: 8 }}>We couldn't check publishing access</h1>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", maxWidth: 440, margin: "0 auto 18px" }}>{org.error}</p>
          <button type="button" className="pp-btn pp-btn-outline" onClick={() => void org.refresh()}>Retry</button>
        </div>
      </AppShell>
    );
  }

  if (loadError) {
    return (
      <AppShell kind="institution" maxWidth={760}>
        <div className="pp-card" role="alert" style={{ padding: 40, textAlign: "center" }}>
          <h1 style={{ fontSize: 19, fontWeight: 700, marginBottom: 8 }}>Release unavailable</h1>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", maxWidth: 440, margin: "0 auto 18px" }}>{loadError}</p>
          <button type="button" className="pp-btn pp-btn-outline" onClick={() => navigate("/inst/releases")}>Back to releases</button>
        </div>
      </AppShell>
    );
  }

  // Publishing fails closed when organisation membership is missing or inactive.
  if (!org.available || !org.can.publish) {
    return (
      <AppShell kind="institution" maxWidth={760}>
        <div className="pp-card" style={{ padding: 40, textAlign: "center" }}>
          <Lock size={32} color="var(--text-muted)" style={{ marginBottom: 12 }} />
          <h1 style={{ fontSize: 19, fontWeight: 700, marginBottom: 8 }}>Publishing isn't available for your account</h1>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", maxWidth: 440, margin: "0 auto" }}>
            {org.status === "pending"
              ? "Your membership is awaiting owner approval. Once approved with an editor or admin role, you'll be able to create releases."
              : org.status === "active"
                ? "Your role has read-only access. Ask the organisation owner to grant you an editor role."
                : "Your organisation membership is missing or inactive. Ask an owner or platform administrator to restore access."}
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell kind="institution" maxWidth={1180}>
      <PageHeader title={editingId ? "Edit release" : "Publish"} subtitle={editingId ? "Update this release, review it, then save or publish when ready." : "Create and publish an official release to the public."} />

      {!org.verified && (
        <div className="pp-card" style={{ padding: 14, marginBottom: 18, display: "flex", alignItems: "center", gap: 12, borderColor: "rgba(245,158,11,0.35)" }}>
          <ShieldCheck size={18} color="var(--amber)" />
          <div style={{ flex: 1, fontSize: 13.5, color: "var(--text-secondary)" }}>You can save drafts now. Publishing unlocks after platform approval.</div>
          {org.role === "owner" && <button type="button" onClick={() => navigate("/inst/profile")} className="pp-btn pp-btn-ghost">View review status</button>}
        </div>
      )}

      <div className="pp-responsive-grid" style={{ display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: 24, alignItems: "start" }}>
        {/* form */}
        <div className="pp-card" style={{ padding: 24 }}>
          <div style={{ marginBottom: 20 }}>
            <FieldLabel hint={heading.length > 150 ? `${heading.length}/200` : "Required"}>Heading</FieldLabel>
            <input
              ref={headingRef}
              className="pp-input"
              placeholder="Write a clear, specific headline"
              value={heading}
              maxLength={200}
              onChange={(e) => {
                setHeading(e.target.value);
                if (headingError && e.target.value.trim()) setHeadingError(false);
              }}
              style={{
                fontSize: 15.5,
                borderColor: headingError ? "var(--red)" : undefined,
                boxShadow: headingError ? "0 0 0 3px rgba(248,113,113,0.15)" : undefined,
              }}
            />
            {headingError && (
              <span style={{ display: "block", fontSize: 12.5, color: "var(--red)", marginTop: 6 }}>
                Please add a headline before publishing.
              </span>
            )}
          </div>

          <div style={{ marginBottom: 20 }}>
            <FieldLabel hint={subheading.length > 190 ? `${subheading.length}/250` : "Required to publish"}>Subheading</FieldLabel>
            <input
              ref={subheadingRef}
              className="pp-input"
              placeholder="One or two sentences summarising the release"
              value={subheading}
              maxLength={250}
              onChange={(e) => {
                setSubheading(e.target.value);
                if (subheadingError && e.target.value.trim()) setSubheadingError(false);
              }}
              style={{
                borderColor: subheadingError ? "var(--red)" : undefined,
                boxShadow: subheadingError ? "0 0 0 3px rgba(248,113,113,0.15)" : undefined,
              }}
            />
            {subheadingError && (
              <span style={{ display: "block", fontSize: 12.5, color: "var(--red)", marginTop: 6 }}>
                Add a short summary — it's what readers see in their feed.
              </span>
            )}
          </div>

          <div style={{ marginBottom: 20 }}>
            <FieldLabel hint="Required · rich text">Body</FieldLabel>
            <RichTextEditor value={body} onChange={setBody} placeholder="Write the full release here…" />
          </div>

          <div style={{ marginBottom: 20 }}>
            <FieldLabel>Release type</FieldLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {availableTypes.map((t) => {
                const active = type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t as ReleaseType)}
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      padding: "8px 14px",
                      borderRadius: "var(--r-pill)",
                      border: `1px solid ${active ? "var(--blue)" : "var(--border)"}`,
                      background: active ? "rgba(59,130,246,0.1)" : "var(--surface-2)",
                      color: active ? "var(--blue)" : "var(--text-secondary)",
                    }}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <FieldLabel hint="Choose a cover">Cover media</FieldLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {[...SCENES.map(({ scene, label }) => ({ scene: scene as string, label })), ...platformCovers.map((c) => ({ scene: c.url, label: c.label }))].map(({ scene: s, label }) => {
                const active = scene === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScene(s as MediaScene)}
                    style={{
                      position: "relative",
                      borderRadius: 10,
                      overflow: "hidden",
                      border: `2px solid ${active ? "var(--blue)" : "transparent"}`,
                      padding: 0,
                      height: 74,
                    }}
                  >
                    <MediaTile scene={s} radius={8} />
                    <span
                      style={{
                        position: "absolute",
                        left: 7,
                        bottom: 6,
                        fontSize: 11,
                        fontWeight: 600,
                        color: "#fff",
                        textShadow: "0 1px 3px rgba(0,0,0,0.6)",
                      }}
                    >
                      {label}
                    </span>
                    {active && (
                      <span style={{ position: "absolute", top: 6, right: 6, width: 18, height: 18, borderRadius: 999, background: "var(--blue)", display: "grid", placeItems: "center" }}>
                        <Check size={11} color="#fff" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12.5, color: "var(--text-secondary)", cursor: "pointer" }}>
              <span className="pp-btn pp-btn-outline" style={{ padding: "6px 12px", fontSize: 12.5 }}>
                <Upload size={14} /> {uploading ? "Uploading…" : "Upload your own cover"}
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: "none" }}
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void uploadCover(file);
                }}
              />
              PNG, JPEG or WebP · up to 3 MB
            </label>
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 26 }}>
            <button type="button" onClick={publish} disabled={busy || !org.verified} className="pp-btn pp-btn-primary" style={{ padding: "11px 20px" }}>
              <Send size={16} /> {busy ? "Publishing…" : !org.verified ? "Approval required" : originalPublishedAt ? "Review & republish" : "Review & publish"}
            </button>
            <button type="button" onClick={saveDraft} disabled={busy} className="pp-btn pp-btn-outline" style={{ padding: "11px 20px" }} title={originalPublishedAt ? "Removes the release from public view and keeps it as a draft" : undefined}>
              <FileText size={16} /> {originalPublishedAt ? "Unpublish to draft" : "Save as draft"}
            </button>
          </div>
        </div>

        {/* live preview */}
        <div className="pp-publish-preview" style={{ position: "sticky", top: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 12 }}>
            Live preview
          </div>
          <article className="pp-card" style={{ padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14 }}>
              <InstitutionMark institution={previewInstitution} size={38} />
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{previewInstitution.name}</span>
                  {previewInstitution.verified && <Verified size={13} />}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Just now</div>
              </div>
            </div>
            <div style={{ height: 168, marginBottom: 14 }}>
              <MediaTile scene={scene} radius={12} />
            </div>
            <TypeBadge type={type} />
            <h3 style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.3, marginTop: 10, color: heading.trim() ? "var(--text)" : "var(--text-faint)" }}>
              {heading.trim() || "Your headline will appear here"}
            </h3>
            <p style={{ fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.55, marginTop: 7 }}>
              {subheading.trim() || "Your summary will appear here as readers see it in their feed."}
            </p>
          </article>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 9, marginTop: 16, color: "var(--text-muted)", fontSize: 12.5, lineHeight: 1.5 }}>
            <ImageIcon size={15} style={{ marginTop: 1, flexShrink: 0 }} />
            <span>This is how your release will appear in readers' feeds. Publishing makes it visible to the public immediately.</span>
          </div>
        </div>
      </div>

      {reviewing && (
        <div
          onClick={() => !busy && setReviewing(false)}
          style={{ position: "fixed", inset: 0, zIndex: 100, display: "grid", placeItems: "center", padding: 24, background: "rgba(0,0,0,0.68)" }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-release-title"
            onClick={(event) => event.stopPropagation()}
            className="pp-card"
            style={{ width: "100%", maxWidth: 760, maxHeight: "88vh", overflowY: "auto", padding: 26 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 650, color: "var(--green)", textTransform: "uppercase", marginBottom: 7 }}>Content complete · Review</div>
                <h2 id="review-release-title" style={{ fontSize: 22, fontWeight: 700 }}>Review before publishing</h2>
                <p style={{ marginTop: 6, color: "var(--text-secondary)", fontSize: 13.5 }}>Check the public version below. You can go back to edit or publish it immediately.</p>
              </div>
              <TypeBadge type={type} />
            </div>

            <div style={{ height: 240, marginTop: 22 }}>
              <MediaTile scene={scene} radius={13} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 18 }}>
              <InstitutionMark institution={previewInstitution} size={36} />
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13.5, fontWeight: 650 }}>
                  {previewInstitution.name} {previewInstitution.verified && <Verified size={12} />}
                </div>
                <div style={{ color: "var(--text-muted)", fontSize: 12 }}>Publishes immediately</div>
              </div>
            </div>
            <h3 style={{ fontSize: 25, lineHeight: 1.2, marginTop: 18 }}>{heading.trim()}</h3>
            <p style={{ marginTop: 10, color: "var(--text-secondary)", lineHeight: 1.6 }}>{subheading.trim()}</p>
            <div className="pp-prose" style={{ marginTop: 22 }} dangerouslySetInnerHTML={{ __html: sanitizeRichText(body) }} />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--border)" }}>
              <button type="button" className="pp-btn pp-btn-ghost" onClick={() => setReviewing(false)} disabled={busy}>Back to edit</button>
              <button type="button" className="pp-btn pp-btn-primary" onClick={() => void submit("Published")} disabled={busy} style={{ opacity: busy ? 0.7 : 1 }}>
                <Send size={16} /> {busy ? "Publishing…" : "Publish release"}
              </button>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
