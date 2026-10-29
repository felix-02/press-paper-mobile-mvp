import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Linking,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Body, Button, Card, Field, Row, Screen, Title, useTheme } from "@/ui";
import { useAuth } from "@/auth/AuthProvider";
import { supabase, type ReleaseRow } from "@/lib/supabase";
import { track } from "@/lib/analytics";
import { rowToRelease } from "@/lib/releaseMap";
import { useAppStore } from "@/store/useAppStore";
import { useWatchlists } from "@/lib/useWatchlists";
import {
  usePublicInstitutions,
  publicInstitutionFromRow,
  type PublicInstitution,
  type PublicInstitutionRow,
} from "@/lib/usePublicInstitutions";
import { useRealtimeReleases } from "@/lib/useRealtimeReleases";
import { useComments, type CommentNode } from "@/lib/useComments";
import { useAiSummary } from "@/lib/useAiSummary";
import { useReleaseEngagement } from "@/lib/useReleaseEngagement";
import { useActivity, relativeTime } from "@/lib/useActivity";
import { useOrg } from "@/lib/useOrg";
import { LANGUAGES } from "@/data/languages";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { MediaTile } from "@/components/reader/MediaTile";
import { RichBody } from "@/components/reader/RichBody";
import type { Release } from "@/types";

type Props = { navigation: any; route: any };
const PAGE = 20;
const mapRelease = (row: ReleaseRow): Release => ({
  ...rowToRelease(row),
  createdAt: Date.parse(row.published_at || row.created_at) || 0,
});
const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const plain = (s: string) =>
  s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
const shareUrl = (id: string) =>
  `${process.env.EXPO_PUBLIC_SITE_URL || "https://presspaper.ai"}/r/${encodeURIComponent(id)}`;
const fail = (message: string) => Alert.alert("Please try again", message);

function Status({
  loading,
  error,
  empty,
  retry,
}: {
  loading?: boolean;
  error?: string | null;
  empty?: string;
  retry?: () => void;
}) {
  if (loading)
    return (
      <View accessible accessibilityLabel="Loading" style={styles.state}>
        <ActivityIndicator />
      </View>
    );
  if (error)
    return (
      <Card>
        <Body>{error}</Body>
        {retry && <Button title="Try again" onPress={retry} />}
      </Card>
    );
  if (empty)
    return (
      <Card>
        <Body>{empty}</Body>
      </Card>
    );
  return null;
}
function Chips({
  values,
  value,
  onChange,
}: {
  values: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      {values.map((v) => (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: value === v }}
          key={v}
          onPress={() => onChange(v)}
          style={[
            styles.chip,
            {
              borderColor: colors.border,
              backgroundColor: value === v ? "#2563eb" : colors.surface,
            },
          ]}
        >
          <Text
            style={{
              color: value === v ? "#fff" : colors.text,
              fontWeight: "600",
            }}
          >
            {v}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
function ReleaseCard({
  release,
  navigation,
  trailing,
}: {
  release: Release;
  navigation: any;
  trailing?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const saved = useAppStore((s) => s.savedIds.has(release.id));
  const toggle = useAppStore((s) => s.toggleSaved);
  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          navigation.navigate("Source", { slug: release.institutionSlug })
        }
      >
        <Text style={[styles.eyebrow, { color: colors.text }]}>
          {release.institutionName || release.institutionSlug}
          {release.institutionVerified ? "  ✓" : ""}
        </Text>
      </Pressable>
      <Body>
        {release.type} · {release.time}
      </Body>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Read ${release.heading}`}
        onPress={() => navigation.navigate("Release", { id: release.id })}
      >
        <MediaTile scene={release.scene} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Read ${release.heading}`}
        onPress={() => navigation.navigate("Release", { id: release.id })}
      >
        <Text style={[styles.headline, { color: colors.text }]}>
          {release.heading}
        </Text>
        {!!release.subheading && <Body>{release.subheading}</Body>}
      </Pressable>
      <Body>
        {release.views} views · {release.comments} comments
        {release.revisionCount ? " · Edited" : ""}
      </Body>
      <Row>
        <Button
          variant="secondary"
          title={saved ? "Saved ✓" : "Save"}
          onPress={() => toggle(release.id)}
        />
        <Button
          variant="secondary"
          title="Share"
          onPress={() =>
            void Share.share({
              message: `${release.heading}\n${shareUrl(release.id)}`,
              url: shareUrl(release.id),
            }).catch(() => fail("Sharing is unavailable."))
          }
        />
      </Row>
      {trailing}
    </Card>
  );
}

/** Pagination and periodic RLS reconciliation keep removed or moderated content out of open lists. */
function useReleaseList({
  slug,
  ids,
  query = "",
  following,
}: {
  slug?: string;
  ids?: string[];
  query?: string;
  following?: string[];
} = {}) {
  const [rows, setRows] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [moreBusy, setMoreBusy] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cursor = useRef(0);
  const generation = useRef(0);
  const idsKey = ids?.join(",");
  const followingKey = following?.join(",");
  const fetchPage = useCallback(
    async (offset: number) => {
      if (!supabase) throw new Error("The data service is not configured.");
      if ((ids && !ids.length) || (following && !following.length))
        return [] as ReleaseRow[];
      let request = supabase
        .from("release_details")
        .select("*")
        .eq("status", "Published")
        .eq("moderation_status", "active")
        .eq("institution_verified", true)
        .order("published_at", { ascending: false })
        .order("id", { ascending: false });
      if (slug) request = request.eq("institution_slug", slug);
      if (ids)
        request = request.in(
          "id",
          ids.filter((id) => uuid.test(id)),
        );
      if (following) request = request.in("institution_slug", following);
      // Restrict input to literal word search; PostgREST filter syntax cannot be injected.
      const term = query
        .trim()
        .slice(0, 100)
        .replace(/[^\p{L}\p{N}\s-]/gu, " ")
        .trim();
      if (term)
        request = request.or(
          `heading.ilike.%${term}%,subheading.ilike.%${term}%,institution_name.ilike.%${term}%,type.ilike.%${term}%`,
        );
      const result = await request.range(offset, offset + PAGE - 1);
      if (result.error) throw result.error;
      return (result.data || []) as ReleaseRow[];
    },
    [slug, idsKey, followingKey, query],
  );
  const refresh = useCallback(async () => {
    const version = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPage(0);
      if (version !== generation.current) return;
      cursor.current = data.length;
      setRows(data.map(mapRelease));
      setHasMore(data.length === PAGE);
    } catch {
      if (version === generation.current)
        setError(
          "Releases could not be loaded. Check your connection and retry.",
        );
    } finally {
      if (version === generation.current) setLoading(false);
    }
  }, [fetchPage]);
  useEffect(() => {
    setRows([]);
    void refresh();
    return () => {
      generation.current++;
    };
  }, [refresh]);
  const loadMore = async () => {
    if (moreBusy || loading || !hasMore) return;
    const version = generation.current;
    setMoreBusy(true);
    try {
      const data = await fetchPage(cursor.current);
      if (version !== generation.current) return;
      cursor.current += data.length;
      setRows((previous) => {
        const seen = new Set(previous.map((r) => r.id));
        return [
          ...previous,
          ...data.map(mapRelease).filter((r) => !seen.has(r.id)),
        ];
      });
      setHasMore(data.length === PAGE);
      setError(null);
    } catch {
      if (version === generation.current)
        setError("The next page could not be loaded.");
    } finally {
      setMoreBusy(false);
    }
  };
  const rowIds = rows.map((r) => r.id).join(",");
  useEffect(() => {
    if (!rowIds || !supabase) return;
    let active = true;
    const reconcile = async () => {
      const result = await supabase!
        .from("release_details")
        .select("*")
        .in("id", rowIds.split(","))
        .eq("status", "Published")
        .eq("moderation_status", "active")
        .eq("institution_verified", true);
      if (!active || result.error || !result.data) return;
      const current = new Map(
        result.data.map((row) => [row.id, mapRelease(row as ReleaseRow)]),
      );
      setRows((previous) =>
        previous
          .filter((row) => current.has(row.id))
          .map((row) => current.get(row.id)!),
      );
    };
    const timer = setInterval(() => void reconcile(), 30000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void reconcile();
    });
    return () => {
      active = false;
      clearInterval(timer);
      sub.remove();
    };
  }, [rowIds]);
  return {
    rows,
    setRows,
    loading,
    moreBusy,
    hasMore,
    error,
    refresh,
    loadMore,
  };
}

export function FeedScreen({ navigation }: Props) {
  const [tab, setTab] = useState("Latest");
  const followed = useAppStore((s) => s.followedSlugs);
  const feed = useReleaseList({
    following: tab === "Following" ? [...followed] : undefined,
  });
  const visible = useMemo(
    () => new Set(feed.rows.map((r) => r.id)),
    [feed.rows],
  );
  const realtime = useRealtimeReleases({
    enabled: true,
    ready: !feed.loading && !feed.error,
    visibleIds: visible,
  });
  const pending = realtime.buffered.filter(
    (r) => tab !== "Following" || followed.has(r.institutionSlug),
  );
  const reveal = async () => {
    // Validate buffered rows again at reveal time: moderation may have changed.
    realtime.consume(new Set(pending.map((r) => r.id)));
    await feed.refresh();
  };
  return (
    <Screen refreshing={feed.loading} onRefresh={() => void feed.refresh()}>
      <Body>PRESSPAPER / YOUR DAILY BRIEFING</Body>
      <Title>Official news. Direct from the source.</Title>
      <Row>
        <Button
          variant="secondary"
          title="Sources"
          onPress={() => navigation.navigate("Sources")}
        />
        <Button
          variant="secondary"
          title="Notifications"
          onPress={() => navigation.navigate("Notifications")}
        />
      </Row>
      <Chips values={["Latest", "Following"]} value={tab} onChange={setTab} />
      {pending.length > 0 && (
        <Button
          title={`${pending.length} new releases · Show`}
          onPress={() => void reveal()}
        />
      )}
      <Status
        loading={feed.loading && !feed.rows.length}
        error={feed.error}
        retry={() => void feed.refresh()}
        empty={
          !feed.loading && !feed.error && !feed.rows.length
            ? tab === "Following"
              ? "Follow institutions to build your personal feed."
              : "No published releases yet."
            : undefined
        }
      />
      {feed.rows.map((r) => (
        <ReleaseCard key={r.id} release={r} navigation={navigation} />
      ))}
      {feed.hasMore && (
        <Button
          title={feed.moreBusy ? "Loading…" : "More releases"}
          disabled={feed.moreBusy}
          onPress={() => void feed.loadMore()}
        />
      )}
    </Screen>
  );
}

export function ExploreScreen({ navigation }: Props) {
  const [query, setQuery] = useState("");
  const [settled, setSettled] = useState("");
  const [category, setCategory] = useState("For You");
  useEffect(() => {
    const timer = setTimeout(() => setSettled(query), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const feed = useReleaseList({ query: settled });
  const directory = usePublicInstitutions();
  const institutions = directory.institutions.filter((i) =>
    settled
      ? `${i.name} ${i.category}`.toLowerCase().includes(settled.toLowerCase())
      : category === "For You" ||
        `${i.name} ${i.category}`
          .toLowerCase()
          .includes(category.toLowerCase()),
  );
  const matchingRows =
    settled || category === "For You"
      ? feed.rows
      : feed.rows.filter((release) => {
          const source = directory.institutions.find(
            (i) => i.slug === release.institutionSlug,
          );
          return [source?.category || "", release.type, ...release.tags].some(
            (value) => value.toLowerCase().includes(category.toLowerCase()),
          );
        });
  return (
    <Screen
      refreshing={feed.loading}
      onRefresh={() => {
        void feed.refresh();
        directory.refresh();
      }}
    >
      <Title>Explore</Title>
      <Body>Find the institutions and announcements that matter to you.</Body>
      <Field
        label="Search releases and institutions"
        value={query}
        onChangeText={setQuery}
        returnKeyType="search"
      />
      <Chips
        values={[
          "For You",
          "Government",
          "Economy",
          "Environment",
          "Health",
          "Education",
          "Technology",
        ]}
        value={category}
        onChange={(value) => {
          setCategory(value);
          setQuery("");
          setSettled("");
        }}
      />
      <Button
        variant="secondary"
        title="Browse all sources"
        onPress={() => navigation.navigate("Sources")}
      />
      {
        <>
          <Title>Institutions</Title>
          <Status
            loading={directory.loading}
            error={directory.error}
            retry={directory.refresh}
          />
          {institutions.map((i) => (
            <SourceCard key={i.slug} source={i} navigation={navigation} />
          ))}
        </>
      }
      <Title>{settled ? "Matching releases" : "Latest releases"}</Title>
      <Status
        loading={feed.loading}
        error={feed.error}
        retry={() => void feed.refresh()}
        empty={
          !feed.loading && !feed.error && !matchingRows.length
            ? feed.hasMore
              ? "No matching releases in this page. Load more to continue."
              : "No matching releases."
            : undefined
        }
      />
      {matchingRows.map((r) => (
        <ReleaseCard key={r.id} release={r} navigation={navigation} />
      ))}
      {feed.hasMore && (
        <Button
          title="More results"
          disabled={feed.moreBusy}
          onPress={() => void feed.loadMore()}
        />
      )}
    </Screen>
  );
}

export function SavedScreen({ navigation }: Props) {
  const ids = useAppStore((s) => s.savedIds);
  const saved = useReleaseList({ ids: [...ids] });
  const lists = useWatchlists();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      const result = await lists.create(name);
      if (!result) fail("Watchlist could not be created.");
      else {
        setName("");
        navigation.navigate("Watchlist", { id: result.id });
      }
    } catch {
      fail("Watchlist could not be created.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen
      refreshing={saved.loading}
      onRefresh={() => {
        void saved.refresh();
        void lists.refresh();
      }}
    >
      <Title>Your library</Title>
      <Body>Keep important releases close. Organise them into watchlists.</Body>
      <Title>Watchlists</Title>
      <Status
        loading={lists.loading}
        error={lists.error}
        retry={() => void lists.refresh()}
      />
      {lists.lists.map((list) => (
        <Button
          key={list.id}
          variant="secondary"
          title={`${list.name} · ${list.count}`}
          onPress={() => navigation.navigate("Watchlist", { id: list.id })}
        />
      ))}
      <Field
        label="New watchlist"
        value={name}
        onChangeText={setName}
        maxLength={80}
      />
      <Button
        title="Create watchlist"
        disabled={busy || !name.trim()}
        onPress={() => void create()}
      />
      <Title>Saved releases</Title>
      <Status
        loading={saved.loading}
        error={saved.error}
        retry={() => void saved.refresh()}
        empty={
          !saved.loading && !saved.error && !saved.rows.length
            ? "Save any release to find it here."
            : undefined
        }
      />
      {saved.rows.map((r) => (
        <ReleaseCard key={r.id} release={r} navigation={navigation} />
      ))}
      {saved.hasMore && (
        <Button
          title="More saved releases"
          disabled={saved.moreBusy}
          onPress={() => void saved.loadMore()}
        />
      )}
    </Screen>
  );
}

export function WatchlistScreen({ navigation, route }: Props) {
  const id = String(route.params?.id || "");
  const lists = useWatchlists();
  const list = lists.lists.find((l) => l.id === id);
  const feed = useReleaseList({ ids: lists.itemIds(id) });
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setName(list?.name || "");
  }, [list?.name]);
  const action = async (task: () => Promise<boolean>) => {
    setBusy(true);
    try {
      if (!(await task())) fail("The watchlist could not be updated.");
    } catch {
      fail("The watchlist could not be updated.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen
      refreshing={lists.loading || feed.loading}
      onRefresh={() => {
        void lists.refresh();
        void feed.refresh();
      }}
    >
      <Title>{list?.name || "Watchlist"}</Title>
      <Status
        loading={lists.loading}
        error={lists.error}
        retry={() => void lists.refresh()}
        empty={
          !lists.loading && !lists.error && !list
            ? "This watchlist is no longer available."
            : undefined
        }
      />
      {!!list && (
        <>
          <Field
            label="Watchlist name"
            value={name}
            onChangeText={setName}
            maxLength={80}
          />
          <Row>
            <Button
              variant="secondary"
              title="Rename"
              disabled={busy || !name.trim()}
              onPress={() => void action(() => lists.rename(id, name))}
            />
            <Button
              variant="danger"
              title="Delete watchlist"
              disabled={busy}
              onPress={() =>
                Alert.alert(
                  "Delete watchlist?",
                  "The saved releases themselves will remain available.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete",
                      style: "destructive",
                      onPress: () =>
                        void action(async () => {
                          const ok = await lists.remove(id);
                          if (ok) navigation.goBack();
                          return ok;
                        }),
                    },
                  ],
                )
              }
            />
          </Row>
        </>
      )}
      <Status
        loading={feed.loading}
        error={feed.error}
        retry={() => void feed.refresh()}
        empty={
          !feed.loading && !feed.error && list && !feed.rows.length
            ? "Add releases to this watchlist from the release reader."
            : undefined
        }
      />
      {feed.rows.map((r) => (
        <ReleaseCard
          key={r.id}
          release={r}
          navigation={navigation}
          trailing={
            <Button
              variant="secondary"
              title="Remove from watchlist"
              disabled={busy}
              onPress={() => void action(() => lists.removeItem(id, r.id))}
            />
          }
        />
      ))}
      {feed.hasMore && (
        <Button
          title="More releases"
          disabled={feed.moreBusy}
          onPress={() => void feed.loadMore()}
        />
      )}
    </Screen>
  );
}

function SourceCard({
  source,
  navigation,
}: {
  source: PublicInstitution;
  navigation: any;
}) {
  const following = useAppStore((s) => s.followedSlugs.has(source.slug));
  const toggle = useAppStore((s) => s.toggleFollow);
  const { profile, user } = useAuth();
  return (
    <Card>
      {source.avatarUrl && (
        <Image
          source={{ uri: source.avatarUrl }}
          style={styles.avatar}
          accessibilityLabel={`${source.name} logo`}
        />
      )}
      <Button
        title={`${source.name}${source.verified ? " ✓" : ""}`}
        variant="secondary"
        onPress={() => navigation.navigate("Source", { slug: source.slug })}
      />
      <Body>
        {source.category}
        {source.location ? ` · ${source.location}` : ""}
      </Body>
      <Body>
        {source.followersCount} followers · {source.releasesCount} releases
      </Body>
      {profile?.institution_slug !== source.slug && (
        <Button
          title={following ? "Following ✓" : "Follow"}
          variant="secondary"
          onPress={() =>
            user ? toggle(source.slug) : navigation.navigate("Login")
          }
        />
      )}
    </Card>
  );
}
export function SourcesScreen({ navigation }: Props) {
  const directory = usePublicInstitutions();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const categories = [
    "All",
    ...new Set(directory.institutions.map((i) => i.category)),
  ];
  const filtered = directory.institutions.filter(
    (i) =>
      (category === "All" || i.category === category) &&
      `${i.name} ${i.category} ${i.location || ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <Screen refreshing={directory.loading} onRefresh={directory.refresh}>
      <Title>Verified sources</Title>
      <Body>Official voices. First-hand information.</Body>
      <Field
        label="Search institutions"
        value={query}
        onChangeText={setQuery}
      />
      <Chips values={categories} value={category} onChange={setCategory} />
      <Status
        loading={directory.loading}
        error={directory.error}
        retry={directory.refresh}
        empty={
          !directory.loading && !directory.error && !filtered.length
            ? "No institutions match your search."
            : undefined
        }
      />
      {filtered.map((i) => (
        <SourceCard key={i.slug} source={i} navigation={navigation} />
      ))}
    </Screen>
  );
}
export function SourceScreen({ navigation, route }: Props) {
  const slug = String(route.params?.slug || "");
  const [source, setSource] = useState<PublicInstitution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const feed = useReleaseList({ slug });
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!supabase) throw new Error();
      const result = await supabase.rpc("public_institution", { p_slug: slug });
      if (result.error) throw result.error;
      const row = (result.data as PublicInstitutionRow[] | null)?.[0];
      setSource(row ? publicInstitutionFromRow(row) : null);
    } catch {
      setError("Institution could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [slug]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <Screen
      refreshing={loading}
      onRefresh={() => {
        void load();
        void feed.refresh();
      }}
    >
      <Title>{source?.name || "Institution"}</Title>
      <Status
        loading={loading}
        error={error}
        retry={() => void load()}
        empty={
          !loading && !error && !source
            ? "Institution not found or not currently public."
            : undefined
        }
      />
      {source && (
        <>
          <SourceCard source={source} navigation={navigation} />
          <Body>{source.description || "No description added."}</Body>
          {source.website && (
            <Button
              variant="secondary"
              title="Visit official website"
              onPress={() => {
                try {
                  const u = new URL(source.website!);
                  if (
                    ["https:", "http:"].includes(u.protocol) &&
                    !u.username &&
                    !u.password
                  )
                    void Linking.openURL(u.href);
                } catch {
                  fail("The website address is unavailable.");
                }
              }}
            />
          )}
        </>
      )}
      <Title>Latest releases</Title>
      <Status
        loading={feed.loading}
        error={feed.error}
        retry={() => void feed.refresh()}
        empty={
          !feed.loading && !feed.error && !feed.rows.length
            ? "No public releases yet."
            : undefined
        }
      />
      {feed.rows.map((r) => (
        <ReleaseCard key={r.id} release={r} navigation={navigation} />
      ))}
      {feed.hasMore && (
        <Button
          title="More releases"
          disabled={feed.moreBusy}
          onPress={() => void feed.loadMore()}
        />
      )}
    </Screen>
  );
}

export function ReleaseScreen({ navigation, route }: Props) {
  const id = String(route.params?.id || "");
  const [release, setRelease] = useState<Release | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    async (background = false) => {
      if (!background) setLoading(true);
      setError(null);
      if (!uuid.test(id) || !supabase) {
        setLoading(false);
        setRelease(null);
        return;
      }
      try {
        const { data, error: e } = await supabase
          .from("release_details")
          .select("*")
          .eq("id", id)
          .eq("status", "Published")
          .eq("moderation_status", "active")
          .eq("institution_verified", true)
          .maybeSingle();
        if (e) throw e;
        setRelease(data ? mapRelease(data as ReleaseRow) : null);
      } catch {
        setError("The release could not be loaded.");
      } finally {
        if (!background) setLoading(false);
      }
    },
    [id],
  );
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(true), 30000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void load(true);
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [load]);
  return (
    <Screen refreshing={loading} onRefresh={() => void load()}>
      <Status
        loading={loading}
        error={error}
        retry={() => void load()}
        empty={
          !loading && !error && !release
            ? "This release is unavailable, unpublished, or no longer public."
            : undefined
        }
      />
      {release && (
        <ReleaseDetail
          key={release.id}
          release={release}
          navigation={navigation}
        />
      )}
    </Screen>
  );
}
function ReleaseDetail({
  release,
  navigation,
}: {
  release: Release;
  navigation: any;
}) {
  const { profile } = useAuth();
  const org = useOrg();
  const lists = useWatchlists();
  const [commentDelta, setCommentDelta] = useState(0);
  useEffect(() => {
    track("release_viewed", {
      releaseId: release.id,
      type: release.type,
      institutionSlug: release.institutionSlug,
    });
  }, [release.id]);
  const saved = useAppStore((s) => s.savedIds.has(release.id));
  const toggleSaved = useAppStore((s) => s.toggleSaved);
  const followed = useAppStore((s) =>
    s.followedSlugs.has(release.institutionSlug),
  );
  const toggleFollow = useAppStore((s) => s.toggleFollow);
  const summary = useAiSummary(
    release,
    release.subheading || plain(release.body || "").slice(0, 400),
  );
  const engagement = useReleaseEngagement(
    release.id,
    parseCount(release.views),
    parseCount(release.comments),
  );
  const [showLists, setShowLists] = useState(false);
  const [listName, setListName] = useState("");
  const [listBusy, setListBusy] = useState(false);
  const [showLanguages, setShowLanguages] = useState(false);
  const [languageQuery, setLanguageQuery] = useState("");
  const [language, setLanguage] = useState("English");
  const [translation, setTranslation] = useState<string[] | null>(null);
  const [translating, setTranslating] = useState(false);
  const [showRevisions, setShowRevisions] = useState(false);
  const [revisions, setRevisions] = useState<
    {
      id: string;
      heading: string;
      subheading: string | null;
      body: string | null;
      created_at: string;
    }[]
  >([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [revisionsError, setRevisionsError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const translationRequest = useRef(0);
  useEffect(
    () => () => {
      translationRequest.current++;
    },
    [],
  );
  const translate = async (target: string) => {
    const request = ++translationRequest.current;
    setShowLanguages(false);
    if (target === "English") {
      setLanguage(target);
      setTranslation(null);
      setTranslating(false);
      return;
    }
    setTranslating(true);
    try {
      if (!supabase) throw new Error();
      const result = await supabase.functions.invoke("translate", {
        body: {
          target,
          texts: [
            release.heading,
            release.subheading,
            plain(release.body || ""),
            summary.summary,
          ],
        },
      });
      if (request !== translationRequest.current) return;
      const fields = result.data?.texts;
      if (
        result.error ||
        !Array.isArray(fields) ||
        fields.length !== 4 ||
        !fields.every((v) => typeof v === "string")
      )
        throw new Error();
      setLanguage(target);
      setTranslation(fields);
    } catch {
      if (request === translationRequest.current)
        fail(
          "Translation is currently unavailable. The original release is still shown.",
        );
    } finally {
      if (request === translationRequest.current) setTranslating(false);
    }
  };
  const loadRevisions = async () => {
    setShowRevisions(true);
    setRevisionsLoading(true);
    setRevisionsError(null);
    try {
      if (!supabase) throw new Error();
      const result = await supabase
        .from("release_revisions")
        .select("id, heading, subheading, body, created_at")
        .eq("release_id", release.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (result.error) throw result.error;
      setRevisions(result.data || []);
    } catch {
      setRevisionsError("Previous versions could not be loaded.");
    } finally {
      setRevisionsLoading(false);
    }
  };
  const listAction = async (task: () => Promise<boolean>) => {
    setListBusy(true);
    try {
      if (!(await task())) fail("Your watchlist could not be updated.");
    } catch {
      fail("Your watchlist could not be updated.");
    } finally {
      setListBusy(false);
    }
  };
  const exportText = async () => {
    setExporting(true);
    try {
      const text = [
        release.heading,
        release.subheading,
        plain(release.body || ""),
      ]
        .filter(Boolean)
        .join("\n\n");
      const filename =
        (release.heading
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 100) || "presspaper-release") + ".txt";
      const file = new File(Paths.cache, filename);
      file.create({ overwrite: true });
      file.write(text);
      if (await Sharing.isAvailableAsync())
        await Sharing.shareAsync(file.uri, {
          mimeType: "text/plain",
          UTI: "public.plain-text",
        });
      else await Share.share({ message: text });
    } catch {
      fail("The release text could not be exported.");
    } finally {
      setExporting(false);
    }
  };
  const exportPdf = async (print: boolean) => {
    setExporting(true);
    const escape = (value: string) =>
      value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    const html = `<html><head><meta charset="utf-8"></head><body><h1>${escape(translation?.[0] || release.heading)}</h1><p>${escape(release.institutionName || release.institutionSlug)} · ${escape(release.publishedDate || release.time)}</p><h2>${escape(translation?.[1] || release.subheading)}</h2><p style="white-space:pre-wrap">${escape(translation?.[2] || plain(release.body || ""))}</p><p>${escape(shareUrl(release.id))}</p></body></html>`;
    try {
      if (print) await Print.printAsync({ html });
      else {
        const file = await Print.printToFileAsync({ html });
        if (!(await Sharing.isAvailableAsync())) throw new Error();
        await Sharing.shareAsync(file.uri, {
          mimeType: "application/pdf",
          UTI: ".pdf",
          dialogTitle: release.heading,
        });
      }
    } catch {
      fail("This device could not export the release. Try the Share action.");
    } finally {
      setExporting(false);
    }
  };
  return (
    <>
      <Button
        variant="secondary"
        title={`${release.institutionName || release.institutionSlug}${release.institutionVerified ? " ✓" : ""}`}
        onPress={() =>
          navigation.navigate("Source", { slug: release.institutionSlug })
        }
      />
      <Body>
        {release.type} · {release.publishedDate || release.time}
      </Body>
      <Title>{translation?.[0] || release.heading}</Title>
      <Body>{translation?.[1] || release.subheading}</Body>
      <MediaTile scene={release.scene} />
      <Body>
        {engagement.views.toLocaleString()} views ·{" "}
        {(engagement.comments + commentDelta).toLocaleString()} comments
      </Body>
      <Row>
        <Button
          title={saved ? "Saved ✓" : "Save"}
          onPress={() => toggleSaved(release.id)}
        />
        <Button
          variant="secondary"
          title="Share"
          onPress={() =>
            void Share.share({
              message: `${release.heading}\n${shareUrl(release.id)}`,
              url: shareUrl(release.id),
            }).catch(() => fail("Sharing is unavailable."))
          }
        />
      </Row>
      {profile?.institution_slug !== release.institutionSlug && (
        <Button
          title={followed ? "Following institution ✓" : "Follow institution"}
          variant="secondary"
          onPress={() => toggleFollow(release.institutionSlug)}
        />
      )}
      <Button
        title="Add to watchlist"
        variant="secondary"
        onPress={() => setShowLists((v) => !v)}
      />
      {showLists && (
        <Card>
          <Title>Choose watchlists</Title>
          <Status
            loading={lists.loading}
            error={lists.error}
            retry={() => void lists.refresh()}
          />
          {lists.lists.map((list) => (
            <Button
              key={list.id}
              variant="secondary"
              disabled={listBusy}
              title={`${lists.inList(list.id, release.id) ? "✓ " : ""}${list.name}`}
              onPress={() =>
                void listAction(() =>
                  lists.inList(list.id, release.id)
                    ? lists.removeItem(list.id, release.id)
                    : lists.addItem(list.id, release.id),
                )
              }
            />
          ))}
          <Field
            label="New watchlist name"
            value={listName}
            onChangeText={setListName}
            maxLength={80}
          />
          <Button
            title="Create and add release"
            disabled={listBusy || !listName.trim()}
            onPress={() =>
              void listAction(async () => {
                const list = await lists.create(listName);
                if (!list) return false;
                setListName("");
                return lists.addItem(list.id, release.id);
              })
            }
          />
        </Card>
      )}
      <Reactions releaseId={release.id} />
      <Card>
        <Title>
          {summary.isAi ? "AI-generated summary" : "Source summary"}
        </Title>
        {summary.loading && <ActivityIndicator />}
        <Body>{translation?.[3] || summary.summary}</Body>
      </Card>
      <Button
        title={translating ? "Translating…" : `Language · ${language}`}
        variant="secondary"
        disabled={translating}
        onPress={() => setShowLanguages((v) => !v)}
      />
      {showLanguages && (
        <Card>
          <Field
            label="Find a language"
            value={languageQuery}
            onChangeText={setLanguageQuery}
          />
          {LANGUAGES.filter((l) =>
            l.toLowerCase().includes(languageQuery.toLowerCase()),
          ).map((l) => (
            <Button
              key={l}
              title={l}
              variant="secondary"
              onPress={() => void translate(l)}
            />
          ))}
        </Card>
      )}
      <Card>
        {translation ? (
          <Body>{translation[2]}</Body>
        ) : (
          <RichBody
            baseUrl={shareUrl(release.id)}
            html={release.body || "The publisher has not added body text."}
          />
        )}
      </Card>
      {!!release.revisionCount && (
        <Button
          title={`Edited · ${release.revisionCount} previous versions`}
          variant="secondary"
          onPress={() =>
            showRevisions ? setShowRevisions(false) : void loadRevisions()
          }
        />
      )}
      {showRevisions && (
        <Card>
          <Title>Previous versions</Title>
          <Status
            loading={revisionsLoading}
            error={revisionsError}
            retry={() => void loadRevisions()}
          />
          {revisions.map((revision) => (
            <View key={revision.id} style={styles.section}>
              <Body>{new Date(revision.created_at).toLocaleString()}</Body>
              <Title>{revision.heading}</Title>
              <Body>{revision.subheading}</Body>
              <RichBody
                baseUrl={shareUrl(release.id)}
                html={revision.body || ""}
              />
            </View>
          ))}
        </Card>
      )}
      {!!release.tags.length && (
        <Body>Topics · {release.tags.join(" · ")}</Body>
      )}
      {!!release.attachments?.length && (
        <Card>
          <Title>Attachments</Title>
          {release.attachments.map((attachment) => (
            <Body key={attachment.id}>
              {attachment.name} · {attachment.format} · {attachment.size}
            </Body>
          ))}
        </Card>
      )}
      <Row>
        <Button
          title="Export text"
          variant="secondary"
          disabled={exporting}
          onPress={() => void exportText()}
        />
        <Button
          title="Export PDF"
          variant="secondary"
          disabled={exporting}
          onPress={() => void exportPdf(false)}
        />
        <Button
          title="Print"
          variant="secondary"
          disabled={exporting}
          onPress={() => void exportPdf(true)}
        />
      </Row>
      <Title>Discussion</Title>
      <Comments
        releaseId={release.id}
        onCommentPosted={() => setCommentDelta((value) => value + 1)}
        canModerate={org.slug === release.institutionSlug && org.can.publish}
      />
    </>
  );
}
function parseCount(value: string) {
  const n = Number.parseFloat(value.replace(/[^\d.]/g, "")) || 0;
  return Math.round(
    n * (/m/i.test(value) ? 1000000 : /k/i.test(value) ? 1000 : 1),
  );
}
const REACTIONS = [
  ["like", "👍 Like"],
  ["love", "❤️ Love"],
  ["laugh", "😄 Laugh"],
  ["wow", "😮 Wow"],
  ["sad", "😢 Sad"],
  ["celebrate", "🎉 Celebrate"],
];
function Reactions({ releaseId }: { releaseId: string }) {
  const { user } = useAuth();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [mine, setMine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      if (!supabase || !user) return;
      const [all, own] = await Promise.all([
        supabase.rpc("release_reaction_counts", { p_release: releaseId }),
        supabase
          .from("release_reactions")
          .select("reaction")
          .eq("release_id", releaseId)
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);
      if (all.error || own.error) throw new Error();
      setCounts(
        Object.fromEntries(
          (all.data || []).map((r: { reaction: string; count: number }) => [
            r.reaction,
            Number(r.count),
          ]),
        ),
      );
      setMine(own.data?.reaction || null);
      setError(null);
    } catch {
      setError("Reactions could not be loaded.");
    }
  }, [releaseId, user?.id]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const react = async (key: string) => {
    if (!supabase || !user || busy) return;
    setBusy(true);
    try {
      const result =
        mine === key
          ? await supabase
              .from("release_reactions")
              .delete()
              .eq("release_id", releaseId)
              .eq("user_id", user.id)
          : await supabase
              .from("release_reactions")
              .upsert(
                { release_id: releaseId, user_id: user.id, reaction: key },
                { onConflict: "release_id,user_id" },
              );
      if (result.error) throw result.error;
      await refresh();
    } catch {
      fail("Your reaction could not be saved.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.section}>
      <Status error={error} retry={() => void refresh()} />
      <View style={styles.wrap}>
        {REACTIONS.map(([key, label]) => (
          <Button
            key={key}
            title={`${label} ${counts[key] || 0}${mine === key ? " ✓" : ""}`}
            variant={mine === key ? "primary" : "secondary"}
            disabled={busy}
            onPress={() => void react(key)}
          />
        ))}
      </View>
    </View>
  );
}
function Comments({
  releaseId,
  canModerate,
  onCommentPosted,
}: {
  releaseId: string;
  canModerate: boolean;
  onCommentPosted: () => void;
}) {
  const comments = useComments(releaseId);
  const { user } = useAuth();
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<CommentNode | null>(null);
  const [deleting, setDeleting] = useState(false);
  const remove = (id: string) =>
    Alert.alert(
      "Remove comment?",
      "Replies to this comment will also be removed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              if (!supabase) throw new Error();
              const result = await supabase
                .from("comments")
                .delete()
                .eq("id", id)
                .select("id");
              if (result.error || !result.data?.length) throw new Error();
              comments.reload();
            } catch {
              fail("The comment could not be removed.");
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  const renderNode = (node: CommentNode, depth = 0): React.ReactNode => (
    <View
      key={node.id}
      style={[styles.comment, { marginLeft: depth ? 12 : 0 }]}
    >
      <Body>
        {node.author} · {node.time}
      </Body>
      <Body>{node.body}</Body>
      <Row>
        {!depth && (
          <Button
            variant="secondary"
            title="Reply"
            onPress={() => {
              setReplyTo(node);
              setDraft("");
            }}
          />
        )}
        {(node.authorId === user?.id || canModerate) && (
          <Button
            title="Remove"
            variant="danger"
            disabled={deleting}
            onPress={() => remove(node.id)}
          />
        )}
      </Row>
      {node.replies.map((r) => renderNode(r, depth + 1))}
    </View>
  );
  const post = async () => {
    if (await comments.post(draft, replyTo?.id)) {
      setDraft("");
      setReplyTo(null);
      onCommentPosted();
    }
  };
  return (
    <Card>
      <Status
        loading={comments.loading}
        error={comments.loadError}
        retry={comments.reload}
      />
      {replyTo && (
        <>
          <Body>Replying to {replyTo.author}</Body>
          <Button
            title="Cancel reply"
            variant="secondary"
            onPress={() => {
              setReplyTo(null);
              setDraft("");
            }}
          />
        </>
      )}
      <Field
        label={replyTo ? "Your reply" : "Add a thoughtful comment"}
        value={draft}
        onChangeText={setDraft}
        multiline
        maxLength={4000}
        editable={!comments.posting}
      />
      <Button
        title={
          comments.posting
            ? "Posting…"
            : replyTo
              ? "Post reply"
              : "Post comment"
        }
        disabled={
          comments.posting ||
          comments.loading ||
          !!comments.loadError ||
          !draft.trim()
        }
        onPress={() => void post()}
      />
      <Status error={comments.postError} />
      {comments.tree.map((node) => renderNode(node))}
      {!comments.loading && !comments.loadError && !comments.tree.length && (
        <Body>Be the first to comment.</Body>
      )}
    </Card>
  );
}

export function ProfileScreen({ navigation }: Props) {
  const { profile, user, refreshProfile, signOut } = useAuth();
  const { mode, setMode } = useTheme();
  const directory = usePublicInstitutions();
  const followed = useAppStore((s) => s.followedSlugs);
  const savedIds = useAppStore((s) => s.savedIds);
  const lists = useWatchlists();
  const activity = useActivity();
  const [name, setName] = useState(profile?.full_name || "");
  const [bio, setBio] = useState(profile?.bio || "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("Following");
  useEffect(() => {
    setName(profile?.full_name || "");
    setBio(profile?.bio || "");
  }, [profile?.full_name, profile?.bio]);
  const save = async () => {
    if (!name.trim() || !user || !supabase) return;
    setBusy(true);
    try {
      const result = await supabase
        .from("profiles")
        .update({ full_name: name.trim(), bio: bio.trim() || null })
        .eq("id", user.id);
      if (result.error) throw result.error;
      await refreshProfile();
      setEditing(false);
    } catch {
      fail("Your profile could not be saved.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <Title>{profile?.full_name || "Your profile"}</Title>
      <Body>{profile?.bio || "Make yourself at home."}</Body>
      <Body>
        {followed.size} following · {savedIds.size} saved · {lists.lists.length}{" "}
        watchlists
      </Body>
      {user?.created_at && (
        <Body>Joined {new Date(user.created_at).toLocaleDateString()}</Body>
      )}
      <Row>
        <Button
          title={editing ? "Cancel editing" : "Edit profile"}
          variant="secondary"
          onPress={() => setEditing((v) => !v)}
        />
        <Button
          title="Sign out"
          variant="secondary"
          onPress={() => void signOut()}
        />
      </Row>
      {editing && (
        <Card>
          <Field
            label="Full name"
            value={name}
            onChangeText={setName}
            maxLength={200}
          />
          <Field
            label="Bio"
            value={bio}
            onChangeText={setBio}
            multiline
            maxLength={5000}
          />
          <Button
            title={busy ? "Saving…" : "Save profile"}
            disabled={busy || !name.trim()}
            onPress={() => void save()}
          />
        </Card>
      )}
      <Title>Appearance</Title>
      <Chips
        values={["system", "light", "dark"]}
        value={mode}
        onChange={(value) => setMode(value as "system" | "light" | "dark")}
      />
      <Row>
        <Button
          title="Notifications"
          variant="secondary"
          onPress={() => navigation.navigate("Notifications")}
        />
        <Button
          title="Help"
          variant="secondary"
          onPress={() => navigation.navigate("Help")}
        />
      </Row>
      <Chips
        values={["Following", "Saved", "Activity"]}
        value={tab}
        onChange={setTab}
      />
      {tab === "Following" && (
        <>
          <Status
            loading={directory.loading}
            error={directory.error}
            retry={directory.refresh}
            empty={
              !directory.loading &&
              !directory.error &&
              !directory.institutions.some((i) => followed.has(i.slug))
                ? "Follow verified institutions to see them here."
                : undefined
            }
          />
          {directory.institutions
            .filter((i) => followed.has(i.slug))
            .map((i) => (
              <SourceCard key={i.slug} source={i} navigation={navigation} />
            ))}
        </>
      )}
      {tab === "Saved" && (
        <Button
          title="Open your library"
          onPress={() => navigation.navigate("Saved")}
        />
      )}
      {tab === "Activity" && (
        <>
          <Status
            loading={activity.loading}
            empty={
              !activity.loading && !activity.items.length
                ? "No recent activity."
                : undefined
            }
          />
          {activity.items.map((item) => (
            <Card key={item.key}>
              <Button
                variant="secondary"
                title={
                  item.kind === "save"
                    ? `Saved ${item.heading}`
                    : `Followed ${directory.institutions.find((i) => i.slug === item.slug)?.name || item.slug}`
                }
                onPress={() =>
                  navigation.navigate(
                    item.kind === "save" ? "Release" : "Source",
                    item.kind === "save"
                      ? { id: item.releaseId }
                      : { slug: item.slug },
                  )
                }
              />
              <Body>{relativeTime(item.ts)}</Body>
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}

export function NotificationsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const followed = useAppStore((s) => s.followedSlugs);
  const feed = useReleaseList({ following: [...followed] });
  const [seen, setSeen] = useState(0);
  const key = `presspaper.notifications.${user?.id || "guest"}`;
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(key).then((value) => {
      if (active) setSeen(Number(value) || 0);
    });
    return () => {
      active = false;
    };
  }, [key]);
  useFocusEffect(
    useCallback(() => {
      void feed.refresh();
    }, [feed.refresh]),
  );
  const markRead = async () => {
    const time = Date.now();
    try {
      await AsyncStorage.setItem(key, String(time));
      setSeen(time);
    } catch {
      fail("Read status could not be saved.");
    }
  };
  return (
    <Screen refreshing={feed.loading} onRefresh={() => void feed.refresh()}>
      <Title>Notifications</Title>
      <Body>New releases from the institutions you follow.</Body>
      <Button
        title="Mark all as read"
        variant="secondary"
        onPress={() => void markRead()}
      />
      <Status
        loading={feed.loading}
        error={feed.error}
        retry={() => void feed.refresh()}
        empty={
          !feed.loading && !feed.error && !feed.rows.length
            ? "No new releases from your followed institutions."
            : undefined
        }
      />
      {feed.rows.map((release) => (
        <Card key={release.id}>
          <Body>
            {(release.createdAt || 0) > seen ? "● Unread · " : ""}
            {release.institutionName} · {release.time}
          </Body>
          <Button
            title={release.heading}
            variant="secondary"
            onPress={() => navigation.navigate("Release", { id: release.id })}
          />
        </Card>
      ))}
      {feed.hasMore && (
        <Button
          title="More notifications"
          disabled={feed.moreBusy}
          onPress={() => void feed.loadMore()}
        />
      )}
    </Screen>
  );
}

export function HelpScreen() {
  return (
    <Screen>
      <Title>How can we help?</Title>
      <Card>
        <Title>Follow official sources</Title>
        <Body>
          Browse Sources, choose an institution, and tap Follow. Their published
          releases appear in Following and Notifications.
        </Body>
      </Card>
      <Card>
        <Title>Build your library</Title>
        <Body>
          Save releases from your feed or the reader. Create watchlists in your
          library and add releases from the reader. Saves and watchlists follow
          your account across devices.
        </Body>
      </Card>
      <Card>
        <Title>Read, share and discuss</Title>
        <Body>
          Open a release to read the official body, react or join the
          discussion. Share a link, export a PDF, or print using your device. AI
          summaries and translations are available when the publisher platform
          has enabled them.
        </Body>
      </Card>
      <Card>
        <Title>Institution access</Title>
        <Body>
          Institution workspaces are invitation-only. Open your invitation on
          this device and use the exact invited email address. Publishing
          requires platform approval and an active owner, administrator, or
          editor seat.
        </Body>
      </Card>
      <Card>
        <Title>Account recovery</Title>
        <Body>
          Use Forgot password on the sign-in screen. Open the recovery email on
          this device to choose a new password. An archived or suspended account
          needs assistance from your platform administrator.
        </Body>
      </Card>
    </Screen>
  );
}
const styles = StyleSheet.create({
  state: { padding: 28 },
  section: { gap: 12, paddingVertical: 12 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
  },
  eyebrow: { fontSize: 14, fontWeight: "700", lineHeight: 22 },
  headline: {
    fontSize: 23,
    fontWeight: "700",
    lineHeight: 30,
    marginVertical: 8,
  },
  avatar: { width: 52, height: 52, borderRadius: 14 },
  comment: {
    gap: 10,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#94a3b8",
  },
});
