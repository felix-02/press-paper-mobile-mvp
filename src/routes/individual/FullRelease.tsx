import { useMemo, useState, useEffect, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  Bookmark,
  Download,
  Sparkles,
  Languages,
  MessageSquare,
  Eye,
  Paperclip,
  Printer,
} from "lucide-react";
import { AppShell } from "@/components/shells/AppShell";
import { InstitutionMark } from "@/components/brand/InstitutionMark";
import { MediaTile } from "@/components/media/MediaTile";
import { TypeBadge } from "@/components/release/ReleaseTypeBadge";
import { Verified } from "@/components/primitives/Bits";
import type { Institution, Release } from "@/types";
import { useAppStore } from "@/store/useAppStore";
import { supabase, isSupabaseConfigured, type ReleaseRow } from "@/lib/supabase";
import { rowToRelease } from "@/lib/releaseMap";
import { useAiSummary } from "@/lib/useAiSummary";
import { track } from "@/lib/analytics";
import { ShareMenu } from "@/components/common/ShareMenu";
import { CommentThread } from "@/components/release/CommentThread";
import { EditedBadge, ReactionBar } from "@/components/release/ReleaseExtras";
import { TagList } from "@/components/common/TagList";
import { LanguageMenu } from "@/components/common/LanguageMenu";
import { AddToWatchlist } from "@/components/common/AddToWatchlist";
import { translateTexts, isTranslationAvailable } from "@/lib/translate";
import { useReleaseEngagement } from "@/lib/useReleaseEngagement";
import { isReleaseUuid, releaseShareUrl } from "@/lib/releaseUrls";
import { sanitizeRichText } from "@/lib/sanitizeHtml";
import { useReaderShellKind } from "@/lib/useReaderShellKind";
import { useAuth } from "@/auth/AuthProvider";
import { usePageTitle } from "@/lib/usePageTitle";

function publisherFromRelease(release: Release): Institution {
  return {
    slug: release.institutionSlug,
    name: release.institutionName?.trim() || release.institutionSlug,
    category: "Institution",
    verified: release.institutionVerified === true,
    color: "#2563eb",
    color2: "#4338ca",
    mark: "generic",
  };
}

function plainText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} style={{ marginTop: 30, scrollMarginTop: 20 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: "0", marginBottom: 12 }}>{title}</h2>
      {children}
    </section>
  );
}

function countFromLabel(value: string): number {
  const amount = Number.parseFloat(value.replace(/[^0-9.]/g, "")) || 0;
  if (/k/i.test(value)) return Math.round(amount * 1_000);
  if (/m/i.test(value)) return Math.round(amount * 1_000_000);
  return Math.round(amount);
}

function RailPanel({ title, icon, children, accent, id }: { title: string; icon?: React.ReactNode; children: React.ReactNode; accent?: string; id?: string }) {
  return (
    <section id={id} className="pp-card" style={{ padding: 16, scrollMarginTop: 20 }}>
      <h3 style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14.5, fontWeight: 600, marginBottom: 12, color: accent ?? "var(--text)" }}>
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

type LookupState =
  | { id: string; status: "loading" }
  | { id: string; status: "resolved"; release: Release }
  | { id: string; status: "not-found" }
  | { id: string; status: "error" };

function ReaderMessage({
  kind,
  title,
  body,
  onRetry,
}: {
  kind: "institution" | "individual";
  title: string;
  body: string;
  onRetry?: () => void;
}) {
  const navigate = useNavigate();
  return (
    <AppShell kind={kind} maxWidth={760}>
      <div className="pp-card" style={{ minHeight: 320, display: "grid", placeItems: "center", padding: 32, textAlign: "center" }}>
        <div>
          <AlertCircle size={32} color="var(--text-muted)" style={{ marginBottom: 12 }} />
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>{title}</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.6, marginTop: 8 }}>{body}</p>
          <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 20 }}>
            {onRetry && (
              <button type="button" onClick={onRetry} className="pp-btn pp-btn-primary">
                Try again
              </button>
            )}
            <button type="button" onClick={() => navigate(kind === "institution" ? "/inst" : "/home")} className="pp-btn pp-btn-ghost">
              Back to {kind === "institution" ? "dashboard" : "home"}
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export function FullRelease() {
  const { id = "" } = useParams();
  const shellKind = useReaderShellKind();
  const [retryKey, setRetryKey] = useState(0);
  const [lookup, setLookup] = useState<LookupState>({ id: "", status: "loading" });

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !isReleaseUuid(id)) return;
    let active = true;
    setLookup({ id, status: "loading" });
    supabase
      .from("release_details")
      .select("*")
      .eq("id", id)
      .eq("status", "Published")
      .eq("moderation_status", "active")
      .eq("institution_verified", true)
      .maybeSingle()
      .then(
        ({ data, error }) => {
          if (!active) return;
          if (error) {
            setLookup({ id, status: "error" });
          } else if (data) {
            setLookup({ id, status: "resolved", release: rowToRelease(data as ReleaseRow) });
          } else {
            setLookup({ id, status: "not-found" });
          }
        },
        () => {
          if (active) setLookup({ id, status: "error" });
        }
      );
    return () => {
      active = false;
    };
  }, [id, retryKey]);

  if (!isSupabaseConfigured || !supabase || !isReleaseUuid(id)) {
    return (
      <ReaderMessage
        kind={shellKind}
        title="Release not found"
        body="This release does not exist or is no longer available."
      />
    );
  }

  const current = lookup.id === id ? lookup : { id, status: "loading" as const };
  if (current.status === "loading") {
    return (
      <AppShell kind={shellKind} maxWidth={1080}>
        <div style={{ minHeight: "60vh", display: "grid", placeItems: "center" }} role="status" aria-label="Loading release">
          <div style={{ width: 28, height: 28, borderRadius: 999, border: "3px solid var(--surface-3)", borderTopColor: "var(--blue)", animation: "pp-spin 0.8s linear infinite" }} />
        </div>
      </AppShell>
    );
  }
  if (current.status === "error") {
    return (
      <ReaderMessage
        kind={shellKind}
        title="Couldn't load this release"
        body="Check your connection and try again."
        onRetry={() => setRetryKey((value) => value + 1)}
      />
    );
  }
  if (current.status === "not-found") {
    return (
      <ReaderMessage
        kind={shellKind}
        title="Release not found"
        body="This release does not exist, is unpublished, or is no longer available."
      />
    );
  }
  return <ReleaseDetail key={current.release.id} release={current.release} shellKind={shellKind} />;
}

function ReleaseDetail({ release, shellKind }: { release: Release; shellKind: "institution" | "individual" }) {
  usePageTitle(release.heading);
  const { profile: authProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const i = useMemo(() => publisherFromRelease(release), [release]);

  const [lang, setLang] = useState<string>("English");
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [commentDelta, setCommentDelta] = useState(0);

  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.slice(1);
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  }, [location.hash]);

  const saved = useAppStore((s) => s.savedIds.has(release.id));
  const toggleSaved = useAppStore((s) => s.toggleSaved);
  const following = useAppStore((s) => s.followedSlugs.has(i.slug));
  const isOwnInstitution = authProfile?.role === "institution" && authProfile.institution_slug === i.slug;
  const toggleFollow = useAppStore((s) => s.toggleFollow);
  const pushToast = useAppStore((s) => s.pushToast);

  // Rich bodies are reduced to the editor's small allowlist. Plain bodies remain
  // plain React text, so they cannot be interpreted as markup.
  const bodyIsHtml = !!release.body && /<[a-z][\s\S]*>/i.test(release.body);
  const safeBody = useMemo(
    () => (bodyIsHtml && release.body ? sanitizeRichText(release.body) : ""),
    [bodyIsHtml, release.body]
  );
  const plainBody = !bodyIsHtml ? release.body?.trim() ?? "" : "";
  const authoredText = useMemo(() => plainText(release.body), [release.body]);
  const hasRichBody = bodyIsHtml && !!safeBody.trim();
  const hasAuthoredBody = hasRichBody || !!plainBody;

  // AI is server-generated from the database release. The only fallback is the
  // publisher-authored subheading; no client-side summary copy is invented.
  const ai = useAiSummary(release, release.subheading.trim(), authoredText || release.subheading);

  // Real, per-release engagement (views counter + real comment count).
  const eng = useReleaseEngagement(
    release.id,
    countFromLabel(release.views),
    countFromLabel(release.comments)
  );
  const commentsLabel = commentDelta > 0
    ? ((eng.isLiveComments ? eng.comments : countFromLabel(release.comments)) + commentDelta).toLocaleString()
    : eng.isLiveComments ? eng.comments.toLocaleString() : release.comments;

  // Count a view once per release: analytics for all, DB counter for real ones.
  const viewedRef = useRef<string | null>(null);
  useEffect(() => {
    if (viewedRef.current === release.id) return;
    viewedRef.current = release.id;
    track("release_viewed", { id: release.id, type: release.type });
  }, [release.id]);

  const [tr, setTr] = useState<{ title: string; subtitle: string; overview: string; summary: string } | null>(null);
  const [translating, setTranslating] = useState(false);

  useEffect(() => {
    let active = true;
    if (lang === "English") {
      setTranslating(false);
      setTr(null);
      return;
    }
    if (!isTranslationAvailable()) {
      setTranslating(false);
      pushToast({ title: "Translation unavailable", description: "Deploy the translate function to enable other languages.", variant: "error" });
      setLang("English");
      return;
    }
    setTranslating(true);
    const sourceOverview = authoredText || release.subheading;
    const fields = [release.heading, release.subheading, sourceOverview, ai.summary];
    translateTexts(lang, fields).then((out) => {
      if (!active) return;
      setTranslating(false);
      if (out === fields || out.length !== fields.length) {
        pushToast({ title: "Couldn't translate", description: "Please try again.", variant: "error" });
        setLang("English");
        return;
      }
      setTr({
        title: out[0],
        subtitle: out[1],
        overview: out[2],
        summary: out[3],
      });
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, release.id, release.heading, release.subheading, authoredText, ai.summary, pushToast]);

  const translated = lang !== "English" && !!tr;
  const title = translated ? tr!.title : release.heading;
  const subtitle = translated ? tr!.subtitle : release.subheading;
  const overview = translated ? tr!.overview : authoredText || release.subheading;
  const summary = translated ? tr!.summary : ai.summary;

  const onSave = () => {
    const now = toggleSaved(release.id);
    pushToast({ title: now ? "Saved" : "Removed from saved", variant: now ? "success" : "info" });
  };

  const shareUrl = releaseShareUrl(release);

  const downloadRelease = () => {
    const text = [release.heading, release.subheading, authoredText].filter(Boolean).join("\n\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${release.heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "presspaper-release"}.txt`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const goBack = () => {
    const historyIndex = (window.history.state as { idx?: number } | null)?.idx;
    if (typeof historyIndex === "number" && historyIndex > 0) navigate(-1);
    else navigate(shellKind === "institution" ? "/inst" : "/home");
  };

  return (
    <AppShell kind={shellKind} maxWidth={1180}>
      <button
        type="button"
        onClick={goBack}
        className="pp-link-muted"
        style={{ marginBottom: 18, fontSize: 13.5 }}
      >
        <ArrowLeft size={15} /> Back
      </button>

      <div className="pp-reader-layout" style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>
        <div className="pp-reader-main" style={{ flex: 1, minWidth: 0 }}>
      {/* institution + actions */}
      <div className="pp-release-heading-row" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div className="pp-release-identity" style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
          <InstitutionMark institution={i} size={44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="pp-release-publisher-line" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{i.name}</span>
              {i.verified && <Verified size={14} />}
              {!isOwnInstitution && (
                <button
                  type="button"
                  onClick={() => toggleFollow(i.slug)}
                  style={{ fontSize: 12.5, color: following ? "var(--text-muted)" : "var(--blue)", fontWeight: 600, marginLeft: 4 }}
                >
                  {following ? "· Following" : "· Follow"}
                </button>
              )}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 1 }}>{release.time}</div>
          </div>
        </div>
      </div>

      {/* title */}
      <div style={{ marginTop: 18 }}>
        <TypeBadge type={release.type} />
        <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "0", lineHeight: 1.15, marginTop: 12 }}>{title}</h1>
        <p style={{ fontSize: 16, color: "var(--text-secondary)", lineHeight: 1.55, marginTop: 12, maxWidth: 720 }}>{subtitle}</p>

        {/* live engagement + tags */}
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 16, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)" }}>
            <Eye size={15} /> {eng.isLiveViews ? eng.views.toLocaleString() : release.views} views
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)" }}>
            <MessageSquare size={15} /> {commentsLabel} comments
          </span>
          {(release.tags.length > 0 || release.extraTags) && <TagList tags={release.tags} max={3} extra={release.extraTags} />}
          <EditedBadge release={release} />
        </div>
      </div>

      {/* media gallery */}
      <div style={{ marginTop: 22 }}>
        <div style={{ height: 360, width: "100%" }}>
          <MediaTile scene={release.scene} radius={16} />
        </div>

        <div id="release-actions" className="pp-card pp-release-action-bar" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 14, padding: 10, scrollMarginTop: 20 }}>
          <button type="button" onClick={onSave} className={saved ? "pp-btn pp-btn-ghost" : "pp-btn pp-btn-outline"}>
            <Bookmark size={15} fill={saved ? "var(--blue)" : "none"} color={saved ? "var(--blue)" : "currentColor"} />
            {saved ? "Saved" : "Save"}
          </button>
          <AddToWatchlist releaseId={release.id} />
          <ShareMenu url={shareUrl} title={release.heading} />
          {release.attachments && release.attachments.length > 0 && (
            <button type="button" onClick={() => setAttachmentsOpen((open) => !open)} className="pp-btn pp-btn-outline" aria-expanded={attachmentsOpen}>
              <Paperclip size={15} /> Attachments ({release.attachments.length})
            </button>
          )}
          <button type="button" onClick={downloadRelease} className="pp-btn pp-btn-outline">
            <Download size={15} /> Download
          </button>
          <button type="button" onClick={() => window.print()} className="pp-btn pp-btn-outline">
            <Printer size={15} /> Print
          </button>
        </div>

        {attachmentsOpen && release.attachments && (
          <div className="pp-card pp-fade pp-responsive-grid" style={{ marginTop: 10, padding: 14, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
            {release.attachments.map((attachment) => (
              <div key={attachment.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: 10, borderRadius: "var(--r-md)", background: "var(--surface-2)" }}>
                <span style={{ width: 34, height: 34, borderRadius: 8, display: "grid", placeItems: "center", background: "var(--surface-3)", color: "var(--text-secondary)", fontSize: 10.5, fontWeight: 700 }}>{attachment.format}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{attachment.name}</span>
                  <span style={{ display: "block", marginTop: 2, color: "var(--text-muted)", fontSize: 11.5 }}>{attachment.size}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

          {/* release body */}
          {translated && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12.5,
                color: "var(--blue)",
                background: "rgba(59,130,246,0.1)",
                border: "1px solid rgba(59,130,246,0.25)",
                borderRadius: "var(--r-pill)",
                padding: "5px 12px",
                marginTop: 24,
              }}
            >
              <Languages size={14} /> Translated to {lang.replace(/\s*\(.*\)$/, "")}
            </div>
          )}

          <Section title="Overview">
            {!translated && hasRichBody ? (
              <div className="pp-prose" dangerouslySetInnerHTML={{ __html: safeBody }} />
            ) : !translated && plainBody ? (
              <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{plainBody}</p>
            ) : overview ? (
              <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.7 }}>{overview}</p>
            ) : (
              <p style={{ fontSize: 14, color: "var(--text-muted)" }}>No body content was provided for this release.</p>
            )}
          </Section>

          {translated && hasAuthoredBody && (
            <Section title="Original release text">
              {hasRichBody ? (
                <div className="pp-prose" dangerouslySetInnerHTML={{ __html: safeBody }} />
              ) : (
                <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{plainBody}</p>
              )}
            </Section>
          )}

          {/* reactions */}
          <div style={{ marginTop: 26 }}>
            <ReactionBar releaseId={release.id} />
          </div>

          {/* comments */}
          <Section id="comments" title="Comments">
            <CommentThread releaseId={release.id} canModerate={isOwnInstitution} onCommentPosted={() => setCommentDelta((count) => count + 1)} />
          </Section>
        </div>

        {/* rail */}
        <aside className="pp-reader-rail" style={{ width: 330, flexShrink: 0, display: "flex", flexDirection: "column", gap: 16, position: "sticky", top: 0 }}>
          {/* translate */}
          <RailPanel title="Translate" icon={<Languages size={16} color="var(--text-muted)" />}>
            <LanguageMenu
              value={lang}
              onChange={setLang}
              busy={translating}
            />
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10, lineHeight: 1.5 }}>
              Translate the published headline and content. The original release text remains available below.
            </p>
          </RailPanel>

          {/* AI summary */}
          <RailPanel id="ai-summary" title={ai.isAi && !translated ? "AI Summary" : "Summary"} icon={<Sparkles size={16} color="var(--purple)" />} accent="var(--text)">
            {(ai.loading && !translated) || translating ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[100, 92, 70].map((w) => (
                  <div key={w} style={{ height: 11, width: `${w}%`, borderRadius: 4, background: "linear-gradient(90deg, var(--surface-2), var(--surface-3), var(--surface-2))", backgroundSize: "200% 100%", animation: "pp-shimmer 1.2s ease-in-out infinite" }} />
                ))}
                <span style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
                  <Sparkles size={11} /> {translating ? "Translating…" : "Summarising…"}
                </span>
              </div>
            ) : (
              <>
                <p style={{ fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.65 }}>
                  {summary || "No summary is available for this release."}
                </p>
                <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  <Sparkles size={11} /> {ai.isAi && !translated ? "AI-generated. Verify important information." : translated ? "Translated summary" : "Source summary"}
                </div>
              </>
            )}
          </RailPanel>
        </aside>
      </div>
    </AppShell>
  );
}
