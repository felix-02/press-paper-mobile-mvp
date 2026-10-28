import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SearchX, X } from "lucide-react";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { AppShell } from "@/components/shells/AppShell";
import { ReleaseCard } from "@/components/release/ReleaseCard";
import { InstitutionMark } from "@/components/brand/InstitutionMark";
import { Verified } from "@/components/primitives/Bits";
import { FeedSkeleton, Skeleton } from "@/components/primitives/Skeleton";
import { EmptyState } from "@/components/primitives/EmptyState";
import { useAppStore } from "@/store/useAppStore";
import { optionFromSearchParam, searchParamValue } from "@/lib/urlState";
import { usePageTitle } from "@/lib/usePageTitle";
import type { Institution, Release } from "@/types";
import { supabase, type ReleaseRow } from "@/lib/supabase";
import { rowToRelease } from "@/lib/releaseMap";
import { usePublicInstitutions } from "@/lib/usePublicInstitutions";

const CATEGORIES = ["For You", "Government", "Economy", "Environment", "Health", "Education", "Technology"] as const;
type ExploreCategory = (typeof CATEGORIES)[number];
function DiscoverCard({ institution: i }: { institution: Institution }) {
  const following = useAppStore((s) => s.followedSlugs.has(i.slug));
  const toggleFollow = useAppStore((s) => s.toggleFollow);
  return (
    <div
      className="pp-card"
      style={{ padding: 16, width: 210, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 4 }}
    >
      <InstitutionMark institution={i} size={48} />
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{i.name}</span>
        {i.verified && <Verified size={12} />}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{i.category}</div>
      <button
        type="button"
        onClick={() => toggleFollow(i.slug)}
        className={following ? "pp-btn pp-btn-ghost" : "pp-btn pp-btn-blue"}
        style={{ padding: "6px 18px", fontSize: 13, marginTop: 10, width: "100%" }}
      >
        {following ? "Following" : "Follow"}
      </button>
    </div>
  );
}

export function Explore() {
  usePageTitle("Explore");
  const [live, setLive] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [params, setParams] = useSearchParams();
  const publicDirectory = usePublicInstitutions();
  const cat = optionFromSearchParam(CATEGORIES, params.get("category"), "For You");
  const query = (params.get("q") || "").trim().toLowerCase().slice(0, 100);
  const queryLabel = (params.get("q") || "").trim().slice(0, 100);
  const setCat = (nextCategory: ExploreCategory) => {
    const p = new URLSearchParams(params);
    p.set("category", searchParamValue(nextCategory));
    p.delete("q");
    setParams(p);
  };
  const clearQuery = () => {
    const p = new URLSearchParams(params);
    p.delete("q");
    setParams(p);
  };

  const matches = (text: string) => text.toLowerCase().includes(cat.toLowerCase());
  const all = cat === "For You";

  const institutions = publicDirectory.institutions.filter((institution) => {
    if (query) return institution.name.toLowerCase().includes(query) || institution.category.toLowerCase().includes(query);
    return all || matches(institution.category) || matches(institution.name);
  });
  useEffect(() => {
    if (!supabase) {
      setLoadError(true);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setLoadError(false);
    void supabase.from("release_details").select("*").eq("status", "Published").order("created_at", { ascending: false }).limit(100).then(({ data, error }) => {
      if (!active) return;
      setLoading(false);
      if (error) {
        setLoadError(true);
        setLive([]);
      } else {
        setLive(((data as ReleaseRow[] | null) ?? []).map(rowToRelease));
      }
    });
    return () => {
      active = false;
    };
  }, [retryKey]);

  const institutionBySlug = new Map(publicDirectory.institutions.map((institution) => [institution.slug, institution]));
  const pool = live;
  const categoryReleases = all
    ? pool
    : pool.filter((release) => {
        const institution = institutionBySlug.get(release.institutionSlug);
        return (institution ? matches(institution.category) : false)
          || matches(release.type)
          || release.tags.some((tag) => matches(tag));
      });
  const releases = query
    ? categoryReleases.filter((release) => {
        const institution = institutionBySlug.get(release.institutionSlug);
        return [release.heading, release.subheading, release.type, release.institutionName ?? "", institution?.name ?? "", ...release.tags]
          .some((value) => value.toLowerCase().includes(query));
      })
    : categoryReleases;
  const relScroll = useInfiniteScroll(releases.length, 8, `${cat}:${query}`);

  return (
    <AppShell kind="individual" maxWidth={920}>
      <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "0" }}>Explore</h1>
      <p style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 6 }}>
        Discover institutions and official releases from around the world.
      </p>

      <div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap", alignItems: "center" }}>
        {CATEGORIES.map((c) => {
          const active = cat === c && !query;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              style={{
                fontSize: 13,
                padding: "7px 15px",
                borderRadius: "var(--r-pill)",
                border: `1px solid ${active ? "transparent" : "var(--border)"}`,
                background: active ? "var(--surface-3)" : "transparent",
                color: active ? "var(--text)" : "var(--text-secondary)",
                fontWeight: active ? 600 : 500,
              }}
            >
              {c}
            </button>
          );
        })}
        {query && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              fontSize: 13,
              fontWeight: 600,
              padding: "6px 8px 6px 14px",
              borderRadius: "var(--r-pill)",
              border: "1px solid color-mix(in srgb, var(--blue) 35%, transparent)",
              background: "var(--accent-soft)",
              color: "var(--blue)",
            }}
          >
            #{queryLabel.replace(/\s/g, "")}
            <button
              type="button"
              onClick={clearQuery}
              aria-label={`Clear topic filter ${queryLabel}`}
              style={{ display: "grid", placeItems: "center", width: 20, height: 20, borderRadius: 999, color: "inherit" }}
            >
              <X size={13} />
            </button>
          </span>
        )}
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 600, marginTop: 28, marginBottom: 14 }}>Institutions to follow</h2>
      {publicDirectory.loading ? (
        <div style={{ display: "flex", gap: 14, overflowX: "hidden", paddingBottom: 6 }} role="status" aria-label="Loading institutions">
          {[0, 1, 2].map((i) => (
            <div key={i} className="pp-card" style={{ padding: 16, width: 210, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <Skeleton w={48} h={48} r={999} />
              <Skeleton w={120} h={13} />
              <Skeleton w={80} h={11} />
              <Skeleton w="100%" h={32} r={8} style={{ marginTop: 4 }} />
            </div>
          ))}
        </div>
      ) : publicDirectory.error ? (
        <button type="button" onClick={publicDirectory.refresh} className="pp-btn pp-btn-outline">Retry institutions</button>
      ) : institutions.length === 0 ? (
        <p style={{ fontSize: 13.5, color: "var(--text-muted)" }}>
          {query ? `No institutions match “${queryLabel}”.` : `No institutions in ${cat} yet.`}
        </p>
      ) : (
        <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 6 }}>
          {institutions.map((institution) => (
            <DiscoverCard key={institution.slug} institution={institution} />
          ))}
        </div>
      )}

      <h2 style={{ fontSize: 16, fontWeight: 600, marginTop: 30, marginBottom: 14 }}>
        {query ? `Releases matching “${queryLabel}”` : all ? "Latest releases" : `${cat} releases`}
      </h2>
      {loadError ? (
        <div className="pp-card" role="alert" style={{ padding: 36, textAlign: "center", color: "var(--text-muted)", fontSize: 13.5 }}>
          <p>We couldn't load releases.</p>
          <button type="button" onClick={() => setRetryKey((key) => key + 1)} className="pp-btn pp-btn-outline" style={{ marginTop: 12 }}>Retry</button>
        </div>
      ) : loading ? (
        <FeedSkeleton count={2} />
      ) : releases.length === 0 ? (
        <EmptyState
          compact
          icon={<SearchX size={24} />}
          title={query ? `Nothing matches “${queryLabel}”` : `No ${cat} releases right now`}
          body={query ? "Try a different topic, or browse everything that's live." : "New releases land here the moment institutions publish them."}
          action={
            (query || !all) ? (
              <button type="button" className="pp-btn pp-btn-outline" onClick={() => setCat("For You")}>
                Browse all releases
              </button>
            ) : undefined
          }
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {releases.slice(0, relScroll.visible).map((r) => (
            <ReleaseCard key={r.id} release={r} variant="feed" showFollow />
          ))}
          {relScroll.hasMore && <div ref={relScroll.sentinelRef} style={{ height: 1 }} />}
        </div>
      )}
    </AppShell>
  );
}
