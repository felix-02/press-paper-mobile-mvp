import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { TrendingUp, AlertCircle, ArrowUp, Compass, Inbox } from "lucide-react";
import { AppShell } from "@/components/shells/AppShell";
import { ReleaseCard } from "@/components/release/ReleaseCard";
import { InstitutionMark } from "@/components/brand/InstitutionMark";
import { Verified } from "@/components/primitives/Bits";
import { FeedSkeleton } from "@/components/primitives/Skeleton";
import { EmptyState } from "@/components/primitives/EmptyState";
import { useAppStore } from "@/store/useAppStore";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { supabase, type ReleaseRow } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";
import { rowToRelease } from "@/lib/releaseMap";
import { useRealtimeReleases } from "@/lib/useRealtimeReleases";
import { optionFromSearchParam, searchParamValue } from "@/lib/urlState";
import { usePublicInstitutions } from "@/lib/usePublicInstitutions";
import { usePageTitle } from "@/lib/usePageTitle";
import type { Institution, Release } from "@/types";

const FILTERS = ["Latest", "Following", "For You"] as const;
const FEED_RECONCILE_MS = 15_000;
type FeedTab = (typeof FILTERS)[number];

function SuggestRow({ institution: i }: { institution: Institution }) {
  const following = useAppStore((s) => s.followedSlugs.has(i.slug));
  const toggleFollow = useAppStore((s) => s.toggleFollow);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <InstitutionMark institution={i} size={34} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {i.name}
          </span>
          {i.verified && <Verified size={12} />}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{i.category}</div>
      </div>
      <button
        type="button"
        onClick={() => toggleFollow(i.slug)}
        className={following ? "pp-btn pp-btn-ghost" : "pp-btn pp-btn-outline"}
        style={{ padding: "5px 13px", fontSize: 12.5 }}
      >
        {following ? "Following" : "Follow"}
      </button>
    </div>
  );
}

/** Rough engagement score used to rank the "For You" tab (real counts only). */
function engagementScore(release: Release): number {
  const parse = (label: string): number => {
    const amount = Number.parseFloat(label.replace(/[^0-9.]/g, "")) || 0;
    if (/k/i.test(label)) return amount * 1_000;
    if (/m/i.test(label)) return amount * 1_000_000;
    return amount;
  };
  return parse(release.views) + parse(release.comments) * 4;
}

export function Home() {
  usePageTitle("Home");
  const { configured } = useAuth();
  const followed = useAppStore((s) => s.followedSlugs);
  const navigate = useNavigate();
  const feedTopRef = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState<Release[]>([]);
  const liveRef = useRef<Release[]>([]);
  const [liveLoading, setLiveLoading] = useState(configured);
  const [liveError, setLiveError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [params, setParams] = useSearchParams();
  const publicDirectory = usePublicInstitutions();
  const tab = optionFromSearchParam(FILTERS, params.get("tab"), "Latest");
  const setTab = (nextTab: FeedTab) => {
    const p = new URLSearchParams(params);
    p.set("tab", searchParamValue(nextTab));
    setParams(p);
  };

  // LIVE: pull published releases from Postgres (any institution) so a post made
  // on the institution side shows up in a reader's feed and survives refresh.
  useEffect(() => {
    if (!configured || !supabase) {
      setLiveLoading(false);
      setLiveError(false);
      return;
    }
    let active = true;
    setLiveLoading(true);
    setLiveError(false);
    supabase
      .from("release_details")
      .select("*")
      .eq("status", "Published")
      .order("published_at", { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (!active) return;
        setLiveLoading(false);
        if (error) {
          setLive([]);
          setLiveError(true);
          return;
        }
        setLive(((data as ReleaseRow[] | null) ?? []).map(rowToRelease));
      });
    return () => {
      active = false;
    };
  }, [configured, retryKey]);

  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  // Reconcile already-visible cards as well as adding new ones. This makes an
  // admin archive/delete, an unpublish, or an institution suspension disappear
  // from an open feed without requiring a refresh. RLS remains authoritative.
  useEffect(() => {
    if (!configured || !supabase || liveLoading || liveError) return;
    const client = supabase;
    let active = true;
    let busy = false;
    const reconcile = async () => {
      if (!active || busy) return;
      const ids = [...new Set(liveRef.current.map((release) => release.id))];
      if (ids.length === 0) return;
      busy = true;
      const allowed = new Set<string>();
      try {
        for (let offset = 0; offset < ids.length; offset += 40) {
          const { data, error } = await client
            .from("release_details")
            .select("id")
            .in("id", ids.slice(offset, offset + 40))
            .eq("status", "Published")
            .eq("moderation_status", "active")
            .eq("institution_verified", true);
          if (error || !active) return;
          ((data as { id: string }[] | null) ?? []).forEach((row) => allowed.add(row.id));
        }
        if (active) setLive((current) => current.filter((release) => allowed.has(release.id)));
      } catch {
        // Keep the last known-good feed when reconciliation is offline.
      } finally {
        busy = false;
      }
    };
    const timer = window.setInterval(() => void reconcile(), FEED_RECONCILE_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [configured, liveLoading, liveError]);

  const base = useMemo(() => {
    const seen = new Set<string>();
    return live.filter((release) =>
      seen.has(release.id) ? false : (seen.add(release.id), true)
    );
  }, [live]);
  const visibleIds = useMemo(() => new Set(base.map((release) => release.id)), [base]);
  const realtime = useRealtimeReleases({
    enabled: configured,
    ready: configured && !liveLoading && !liveError,
    visibleIds,
  });
  // "Latest" is strict recency. "Following" narrows to followed publishers.
  // "For You" is a real ranking: releases from followed institutions first
  // (newest first), then everything else ordered by measured engagement.
  const feed = useMemo(() => {
    if (tab === "Following") return base.filter((r) => followed.has(r.institutionSlug));
    if (tab === "For You") {
      const fromFollowed = base.filter((r) => followed.has(r.institutionSlug));
      const rest = base
        .filter((r) => !followed.has(r.institutionSlug))
        .slice()
        .sort((a, b) => engagementScore(b) - engagementScore(a));
      return [...fromFollowed, ...rest];
    }
    return base;
  }, [base, tab, followed]);
  const feedScroll = useInfiniteScroll(feed.length, 8, tab);

  const bufferedForTab = useMemo(
    () => tab === "Following"
      ? realtime.buffered.filter((release) => followed.has(release.institutionSlug))
      : realtime.buffered,
    [realtime.buffered, followed, tab]
  );

  const revealBuffered = () => {
    const selectedIds = new Set(bufferedForTab.map((release) => release.id));
    const additions = realtime.consume(selectedIds);
    if (additions.length === 0) return;
    setLive((current) => {
      const seen = new Set<string>();
      return [...additions, ...current].filter((release) => {
        if (seen.has(release.id)) return false;
        seen.add(release.id);
        return true;
      });
    });
    window.requestAnimationFrame(() => {
      feedTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  // Trending topics: most-used tags across the current feed (real, not random).
  const tagCounts = new Map<string, number>();
  base.forEach((r) => r.tags.forEach((t) => tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)));
  const trending = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Suggested: institutions this user doesn't already follow (changes as they follow).
  const institutionPool = configured ? publicDirectory.institutions : [];
  const suggested = institutionPool
    .filter((i) => !followed.has(i.slug))
    .slice(0, 4);

  return (
    <AppShell kind="individual" maxWidth={1180}>
      <div className="pp-reader-layout" style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>
        {/* main feed */}
        <div className="pp-reader-main" style={{ flex: 1, minWidth: 0, maxWidth: 680 }}>
          <div ref={feedTopRef} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "0" }}>Your feed</h1>
            <div style={{ display: "flex", gap: 6 }}>
              {FILTERS.map((f) => {
                const active = tab === f;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setTab(f)}
                    style={{
                      fontSize: 13,
                      padding: "6px 13px",
                      borderRadius: "var(--r-pill)",
                      background: active ? "var(--surface-3)" : "transparent",
                      color: active ? "var(--text)" : "var(--text-muted)",
                      fontWeight: active ? 600 : 500,
                    }}
                  >
                    {f}
                  </button>
                );
              })}
            </div>
          </div>

          {bufferedForTab.length > 0 && (
            <div
              aria-live="polite"
              style={{
                position: "sticky",
                top: 12,
                zIndex: 24,
                display: "flex",
                justifyContent: "center",
                height: 0,
                overflow: "visible",
              }}
            >
              <button
                type="button"
                onClick={revealBuffered}
                className="pp-fade"
                aria-label={`Show ${bufferedForTab.length} new ${bufferedForTab.length === 1 ? "release" : "releases"}`}
                style={{
                  transform: "translateY(-4px)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 9,
                  minHeight: 38,
                  padding: "8px 14px 8px 11px",
                  borderRadius: 999,
                  color: "#f8fafc",
                  background: "linear-gradient(135deg, rgba(37,99,235,0.96), rgba(79,70,229,0.96))",
                  border: "1px solid rgba(255,255,255,0.24)",
                  boxShadow: "0 12px 32px rgba(37,99,235,0.34), 0 2px 8px rgba(0,0,0,0.4)",
                  backdropFilter: "blur(12px)",
                  fontSize: 13,
                  fontWeight: 650,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: "#bfdbfe",
                    boxShadow: "0 0 0 4px rgba(191,219,254,0.16)",
                  }}
                />
                {bufferedForTab.length} new {bufferedForTab.length === 1 ? "release" : "releases"}
                <ArrowUp size={14} strokeWidth={2.5} />
              </button>
            </div>
          )}

          {liveError ? (
            <div className="pp-card" role="alert" style={{ padding: 30, textAlign: "center", color: "var(--text-secondary)", fontSize: 13.5 }}>
              <AlertCircle size={20} color="var(--red)" style={{ marginBottom: 10 }} />
              <p>We couldn't load your feed.</p>
              <button type="button" className="pp-btn pp-btn-outline" onClick={() => setRetryKey((key) => key + 1)} style={{ marginTop: 14 }}>Retry</button>
            </div>
          ) : liveLoading ? (
            <FeedSkeleton count={3} />
          ) : feed.length === 0 ? (
            tab === "Following" ? (
              <EmptyState
                icon={<Compass size={24} />}
                title="You're not following anyone yet"
                body="Follow the institutions you care about and their releases will appear here the moment they publish."
                action={
                  <Link to="/explore" className="pp-btn pp-btn-primary">
                    <Compass size={15} /> Explore institutions
                  </Link>
                }
              />
            ) : (
              <EmptyState
                icon={<Inbox size={24} />}
                title="No releases yet"
                body="Verified institutions publish here directly. Explore sources to find the ones worth following."
                action={
                  <Link to="/explore" className="pp-btn pp-btn-primary">
                    <Compass size={15} /> Explore sources
                  </Link>
                }
              />
            )
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {feed.slice(0, feedScroll.visible).map((r) => (
                <ReleaseCard key={r.id} release={r} variant="feed" />
              ))}
              {feedScroll.hasMore && <div ref={feedScroll.sentinelRef} style={{ height: 1 }} />}
            </div>
          )}
        </div>

        {/* right rail */}
        <aside className="pp-reader-rail" style={{ width: 304, flexShrink: 0, display: "flex", flexDirection: "column", gap: 18, position: "sticky", top: 0 }}>
          <section className="pp-card" style={{ padding: 18 }}>
            <h2 style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 600, marginBottom: 14 }}>
              <TrendingUp size={16} color="var(--green)" /> Trending topics
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              {trending.length === 0 ? (
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>No topics yet.</span>
              ) : (
                trending.map(([topic, count], i) => (
                  <button key={topic} type="button" onClick={() => navigate(`/explore?q=${encodeURIComponent(topic)}`)} style={{ display: "flex", alignItems: "center", gap: 11, textAlign: "left" }}>
                    <span style={{ fontSize: 13, color: "var(--text-faint)", width: 14 }}>{i + 1}</span>
                    <span style={{ flex: 1 }}>
                      <span style={{ display: "block", fontSize: 13.5, fontWeight: 500 }}>#{topic.replace(/\s/g, "")}</span>
                      <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)" }}>{count} {count === 1 ? "release" : "releases"}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="pp-card" style={{ padding: 18 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Suggested for you</h2>
            {!configured ? (
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>No live institutions available.</span>
            ) : publicDirectory.loading ? (
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading institutions…</span>
            ) : publicDirectory.error ? (
              <button type="button" onClick={publicDirectory.refresh} className="pp-link-muted" style={{ fontSize: 13 }}>Retry suggestions</button>
            ) : suggested.length === 0 ? (
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>You follow every available institution.</span>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {suggested.map((institution) => (
                  <SuggestRow key={institution.slug} institution={institution} />
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
