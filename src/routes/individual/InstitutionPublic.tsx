import { useEffect, useState } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { AlertCircle, Globe, MapPin, ArrowUpRight, FileText, Inbox } from "lucide-react";
import { AppShell } from "@/components/shells/AppShell";
import { InstitutionMark } from "@/components/brand/InstitutionMark";
import { ReleaseCard } from "@/components/release/ReleaseCard";
import { Verified } from "@/components/primitives/Bits";
import { Tabs } from "@/components/primitives/Tabs";
import { EmptyState } from "@/components/primitives/EmptyState";
import { useAppStore } from "@/store/useAppStore";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { supabase, isSupabaseConfigured, type ReleaseRow } from "@/lib/supabase";
import { rowToRelease, formatCount } from "@/lib/releaseMap";
import type { Institution, Release } from "@/types";
import { useReaderShellKind } from "@/lib/useReaderShellKind";
import { externalUrlLabel, safeExternalUrl } from "@/lib/externalUrl";
import type { PublicInstitutionRow } from "@/lib/usePublicInstitutions";
import { useAuth } from "@/auth/AuthProvider";
import { PublicFooter, PublicHeader } from "@/components/shells/PublicChrome";
import { usePageTitle } from "@/lib/usePageTitle";

const TABS = ["Releases", "About", "Activity"] as const;

function institutionFromRow(row: PublicInstitutionRow): Institution {
  return {
    slug: row.slug,
    name: row.name,
    category: row.category,
    verified: row.verified === true,
    color: "#2563eb",
    color2: "#4338ca",
    mark: "generic",
    website: row.website || undefined,
    location: row.location || undefined,
    description: row.description || undefined,
  };
}

function HeaderStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <span style={{ fontSize: 16, fontWeight: 700 }}>{value}</span>
      <span style={{ fontSize: 13, color: "var(--text-muted)", marginLeft: 6 }}>{label}</span>
    </div>
  );
}

function InstitutionShell({ children, kind, maxWidth }: { children: React.ReactNode; kind: "institution" | "individual"; maxWidth: number }) {
  const { configured, user } = useAuth();
  if (configured && !user) {
    return (
      <div style={{ minHeight: "100vh", background: "#000" }}>
        <PublicHeader />
        <main style={{ width: "100%", maxWidth, margin: "0 auto", padding: "36px 28px 64px" }}>{children}</main>
        <PublicFooter />
      </div>
    );
  }
  return <AppShell kind={kind} maxWidth={maxWidth}>{children}</AppShell>;
}

type InstitutionLookup = {
  slug: string;
  status: "idle" | "loading" | "ready" | "error";
  institution: Institution | null;
  releases: Release[];
  followers: number | null;
  releaseCount: number | null;
};

export function InstitutionPublic() {
  const { slug = "" } = useParams();
  const { configured, user, profile } = useAuth();
  const isOwnInstitution = profile?.role === "institution" && profile.institution_slug === slug;
  const shellKind = useReaderShellKind();
  const following = useAppStore((s) => s.followedSlugs.has(slug));
  const toggleFollow = useAppStore((s) => s.toggleFollow);
  const pushToast = useAppStore((s) => s.pushToast);
  const [retryKey, setRetryKey] = useState(0);
  const [lookup, setLookup] = useState<InstitutionLookup>({
    slug: "",
    status: "idle",
    institution: null,
    releases: [],
    followers: null,
    releaseCount: null,
  });
  const [params, setParams] = useSearchParams();
  const tabParam = (params.get("tab") || "releases").toLowerCase();
  const tab = tabParam === "about" ? "About" : tabParam === "activity" ? "Activity" : "Releases";
  const setTab = (t: string) => {
    const p = new URLSearchParams(params);
    p.set("tab", t.toLowerCase());
    setParams(p);
  };
  // LIVE: this institution's real published releases + real follower count.
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !slug) {
      setLookup({ slug, status: "ready", institution: null, releases: [], followers: null, releaseCount: null });
      return;
    }
    let active = true;
    setLookup({ slug, status: "loading", institution: null, releases: [], followers: null, releaseCount: null });
    Promise.all([
      supabase.rpc("public_institution", { p_slug: slug }),
      supabase
        .from("release_details")
        .select("*")
        .eq("institution_slug", slug)
        .eq("status", "Published")
        .eq("moderation_status", "active")
        .eq("institution_verified", true)
        .order("published_at", { ascending: false }),
    ]).then(
      ([institutionResult, releaseResult]) => {
        if (!active) return;
        if (institutionResult.error || releaseResult.error) {
          setLookup({ slug, status: "error", institution: null, releases: [], followers: null, releaseCount: null });
          return;
        }
        const institutionRow = ((institutionResult.data as PublicInstitutionRow[] | null) ?? [])[0] ?? null;
        setLookup({
          slug,
          status: "ready",
          institution: institutionRow ? institutionFromRow(institutionRow) : null,
          releases: ((releaseResult.data as ReleaseRow[] | null) ?? []).map(rowToRelease),
          followers: institutionRow ? Number(institutionRow.followers_count) || 0 : null,
          releaseCount: institutionRow ? Number(institutionRow.releases_count) || 0 : null,
        });
      },
      () => {
        if (active) setLookup({ slug, status: "error", institution: null, releases: [], followers: null, releaseCount: null });
      }
    );
    return () => {
      active = false;
    };
  }, [slug, retryKey]);

  const current = lookup.slug === slug
    ? lookup
    : { slug, status: "loading" as const, institution: null, releases: [], followers: null, releaseCount: null };
  const liveReleases = current.releases;
  const liveFollowers = current.followers;
  const liveReleaseCount = current.releaseCount;
  const i = current.institution;
  usePageTitle(i?.name);

  const seen = new Set<string>();
  const releases = liveReleases
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  const releasesScroll = useInfiniteScroll(releases.length, 10, slug);

  const onFollow = () => {
    if (!i) return;
    const now = toggleFollow(i.slug);
    if (liveFollowers !== null) {
      setLookup((state) => state.slug === slug
        ? { ...state, followers: Math.max(0, (state.followers ?? 0) + (now ? 1 : -1)) }
        : state
      );
    }
    pushToast({ title: now ? `Following ${i.name}` : `Unfollowed ${i.name}`, variant: now ? "success" : "info" });
  };

  if (!i) {
    if (current.status === "loading") {
      return (
        <InstitutionShell kind={shellKind} maxWidth={900}>
          <div style={{ minHeight: "60vh", display: "grid", placeItems: "center" }} role="status" aria-label="Loading institution">
            <div style={{ width: 28, height: 28, borderRadius: 999, border: "3px solid var(--surface-3)", borderTopColor: "var(--blue)", animation: "pp-spin 0.8s linear infinite" }} />
          </div>
        </InstitutionShell>
      );
    }
    const failed = current.status === "error";
    return (
      <InstitutionShell kind={shellKind} maxWidth={760}>
        <div className="pp-card" style={{ minHeight: 320, display: "grid", placeItems: "center", padding: 32, textAlign: "center" }}>
          <div>
            <AlertCircle size={32} color="var(--text-muted)" style={{ marginBottom: 12 }} />
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>{failed ? "Couldn't load this institution" : "Institution not found"}</h1>
            <p style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 8 }}>
              {failed ? "Check your connection and try again." : "This institution does not exist or is no longer available."}
            </p>
            {failed && (
              <button type="button" onClick={() => setRetryKey((value) => value + 1)} className="pp-btn pp-btn-primary" style={{ marginTop: 18 }}>
                Try again
              </button>
            )}
          </div>
        </div>
      </InstitutionShell>
    );
  }

  const websiteUrl = safeExternalUrl(i.website);
  const websiteLabel = websiteUrl ? externalUrlLabel(websiteUrl) : null;
  const followerLabel = formatCount(liveFollowers ?? 0);
  const releaseLabel = String(liveReleaseCount ?? releases.length);

  return (
    <InstitutionShell kind={shellKind} maxWidth={900}>
      {/* header */}
      <div className="pp-card" style={{ overflow: "hidden" }}>
        <div
          style={{
            height: 120,
            background: `linear-gradient(125deg, ${i.color} 0%, ${i.color2 ?? i.color} 100%)`,
            position: "relative",
          }}
        >
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.18)" }} />
        </div>
        <div style={{ padding: "0 24px 22px" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: -36 }}>
            <div style={{ borderRadius: 18, border: "4px solid var(--surface-1)", lineHeight: 0 }}>
              <InstitutionMark institution={i} size={84} shape="square" />
            </div>
            <div style={{ display: "flex", gap: 10, paddingBottom: 6 }}>
              {websiteUrl && (
                <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className="pp-btn pp-btn-ghost">
                  <Globe size={15} /> Visit website
                </a>
              )}
              {configured && !user ? (
                <Link to={`/login?next=${encodeURIComponent(`/institution/${i.slug}`)}`} className="pp-btn pp-btn-blue" style={{ minWidth: 104 }}>
                  Follow
                </Link>
              ) : isOwnInstitution ? (
                <span style={{ fontSize: 12.5, color: "var(--text-muted)", alignSelf: "center" }}>This is your organisation's public page</span>
              ) : (
                <button
                  type="button"
                  onClick={onFollow}
                  className={following ? "pp-btn pp-btn-ghost" : "pp-btn pp-btn-blue"}
                  style={{ minWidth: 104 }}
                >
                  {following ? "Following" : "Follow"}
                </button>
              )}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
            <h1 style={{ fontSize: 23, fontWeight: 700, letterSpacing: "0" }}>{i.name}</h1>
            {i.verified && <Verified size={17} />}
          </div>
          <div style={{ display: "flex", gap: 18, marginTop: 12, fontSize: 13, color: "var(--text-muted)", flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{i.category}</span>
            {i.location && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <MapPin size={14} /> {i.location}
              </span>
            )}
            {websiteUrl && websiteLabel && (
              <a href={websiteUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--blue)" }}>
                {websiteLabel} <ArrowUpRight size={13} />
              </a>
            )}
          </div>

          <div style={{ display: "flex", gap: 26, marginTop: 18 }}>
            <HeaderStat value={followerLabel} label="followers" />
            <HeaderStat value={releaseLabel} label="releases" />
          </div>
        </div>
      </div>

      {/* tabs */}
      <Tabs tabs={TABS} active={tab} onChange={setTab} style={{ marginTop: 26, marginBottom: 22 }} />

      {tab === "Releases" && (
        releases.length === 0 ? (
          <EmptyState
            compact
            icon={<Inbox size={22} />}
            title="No releases published yet"
            body={`Follow ${i.name} to be notified the moment they publish.`}
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {releases.slice(0, releasesScroll.visible).map((r) => (
              <ReleaseCard key={r.id} release={r} variant="saved" />
            ))}
            {releasesScroll.hasMore && <div ref={releasesScroll.sentinelRef} style={{ height: 1 }} />}
          </div>
        )
      )}

      {tab === "About" && (
        <div className="pp-card" style={{ padding: 22 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>About {i.name}</h2>
          {i.description && <p style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.65, marginBottom: 18 }}>{i.description}</p>}
          <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", rowGap: 12, columnGap: 18, fontSize: 14 }}>
            <dt style={aboutDt}>Category</dt><dd style={aboutDd}>{i.category}</dd>
            {i.location && (<><dt style={aboutDt}>Location</dt><dd style={aboutDd}>{i.location}</dd></>)}
            {websiteUrl && websiteLabel && (
              <>
                <dt style={aboutDt}>Website</dt>
                <dd style={aboutDd}>
                  <a href={websiteUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)" }}>
                    {websiteLabel}
                  </a>
                </dd>
              </>
            )}
            <dt style={aboutDt}>Verification</dt>
            <dd style={aboutDd}>{i.verified ? "Verified institution" : "Unverified"}</dd>
            <dt style={aboutDt}>Followers</dt>
            <dd style={aboutDd}>{followerLabel}</dd>
            <dt style={aboutDt}>Releases</dt>
            <dd style={aboutDd}>{releaseLabel}</dd>
          </dl>
        </div>
      )}

      {tab === "Activity" && (
        releases.length === 0 ? (
          <div className="pp-card" style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 13.5 }}>
            No activity yet.
          </div>
        ) : (
          <div className="pp-card" style={{ padding: 6 }}>
            {releases.map((r) => (
              <Link key={r.id} to={`/release/${r.id}`} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 12px", borderBottom: "1px solid var(--border)" }}>
                <span style={{ width: 30, height: 30, borderRadius: 999, background: "rgba(59,130,246,0.12)", display: "grid", placeItems: "center", flexShrink: 0, marginTop: 1 }}>
                  <FileText size={15} color="var(--blue)" />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13.5 }}>
                    Published <strong>{r.heading}</strong>
                  </span>
                  <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{r.type} · {r.publishedDate ?? r.time}</span>
                </span>
              </Link>
            ))}
          </div>
        )
      )}
    </InstitutionShell>
  );
}

const aboutDt: React.CSSProperties = { color: "var(--text-muted)", fontSize: 13 };
const aboutDd: React.CSSProperties = { color: "var(--text)", margin: 0 };
