import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect, usePreventRemove } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import RenderHTML from "react-native-render-html";
import { useAuth } from "@/auth/AuthProvider";
import { useOrg, type OrgRole } from "@/lib/useOrg";
import { supabase, type ReleaseRow } from "@/lib/supabase";
import { sanitizeRichText } from "@/lib/sanitizeHtml";
import { safeExternalUrl } from "@/lib/externalUrl";
import { track } from "@/lib/analytics";
import { Screen, Card, Title, Body, Button, Field, Row, useTheme } from "@/ui";
import { RichComposer } from "@/components/institution/RichComposer";

type Props = { navigation: any; route: any };
type Org = ReturnType<typeof useOrg>;
const CATEGORIES = [
  "Government",
  "Regulator / Agency",
  "Central Bank",
  "University",
  "Local Authority",
  "International Organisation",
  "Other",
];
const TYPES = [
  "Announcement",
  "Publication",
  "Consultation",
  "Statistics & Research",
];
const SCENES = [
  "wind-farm",
  "parliament",
  "cardiff-bay",
  "coast",
  "town",
  "skyline",
];
const ROLE_LABEL: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Publisher",
  editor: "Editor",
  viewer: "Analyst",
};
const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  metric: { minWidth: "45%", flexGrow: 1, paddingVertical: 8 },
  number: { fontSize: 30, fontWeight: "700" },
  wrap: { gap: 12 },
  cover: { width: "100%", height: 180, borderRadius: 16 },
  logo: { width: 80, height: 80, borderRadius: 20 },
  chart: {
    height: 130,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
    paddingVertical: 8,
  },
});
function Notice({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <Card>
      <Body>{message}</Body>
      {retry && (
        <Button title="Try again" onPress={retry} variant="secondary" />
      )}
    </Card>
  );
}
function Choice({
  values,
  value,
  onChange,
  disabled = false,
}: {
  values: string[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.grid}>
      {values.map((v) => (
        <Button
          key={v}
          title={v === value ? `✓ ${v}` : v}
          onPress={() => onChange(v)}
          disabled={disabled}
          variant={v === value ? "primary" : "secondary"}
        />
      ))}
    </View>
  );
}
function Access({
  org,
  navigation,
  team = false,
  children,
}: {
  org: Org;
  navigation: any;
  team?: boolean;
  children: React.ReactNode;
}) {
  const { profile, signOut } = useAuth();
  if (org.loading)
    return (
      <Screen>
        <ActivityIndicator accessibilityLabel="Checking organisation access" />
      </Screen>
    );
  if (org.error)
    return (
      <Screen>
        <Notice message={org.error} retry={() => void org.refresh()} />
      </Screen>
    );
  if (
    profile?.role !== "institution" ||
    profile.is_admin ||
    profile.account_status === "banned" ||
    profile.account_status === "archived"
  )
    return (
      <Screen>
        <Notice message="An active institution account is required." />
        <Button title="Sign out" onPress={() => void signOut()} />
      </Screen>
    );
  if (!org.verified)
    return (
      <Screen>
        <Title>Under review</Title>
        <Body>
          Your institution is awaiting platform approval. Refresh to check the
          latest decision.
        </Body>
        <Button title="Refresh status" onPress={() => void org.refresh()} />
        <Button
          title="Sign out"
          onPress={() => void signOut()}
          variant="secondary"
        />
      </Screen>
    );
  if (!team && !org.active)
    return (
      <Screen>
        <Notice message="Your organisation membership is inactive or awaiting owner approval." />
        <Button
          title="View team status"
          onPress={() => navigation.navigate("Team")}
        />
      </Screen>
    );
  return <>{children}</>;
}

async function allWorkspaceReleases(slug: string) {
  if (!supabase) throw new Error("Organisation unavailable.");
  const rows: ReleaseRow[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase
      .from("release_details")
      .select("*")
      .eq("institution_slug", slug)
      .order("created_at", { ascending: false })
      .order("id")
      .range(offset, offset + 499);
    if (error) throw new Error("Organisation releases could not be loaded.");
    rows.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  return { data: rows, error: null };
}

function useWorkspace(days = 30) {
  const { profile } = useAuth();
  const [rows, setRows] = useState<ReleaseRow[]>([]),
    [followers, setFollowers] = useState(0),
    [series, setSeries] = useState<{ day: string; views: number }[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++request.current;
    if (!supabase || !profile?.institution_slug) {
      setLoading(false);
      setError("Organisation unavailable.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [releases, counts, views] = await Promise.all([
        allWorkspaceReleases(profile.institution_slug),
        supabase
          .from("institution_stats")
          .select("followers_count")
          .eq("slug", profile.institution_slug)
          .maybeSingle(),
        supabase.rpc("institution_view_series", { days }),
      ]);
      if (current !== request.current) return;
      if (releases.error || counts.error || views.error)
        throw new Error("Organisation data could not be loaded.");
      setRows(releases.data ?? []);
      setFollowers(Number(counts.data?.followers_count ?? 0));
      setSeries(
        (views.data ?? []).map((v: any) => ({
          day: v.day,
          views: Number(v.views) || 0,
        })),
      );
    } catch (e) {
      if (current === request.current)
        setError(e instanceof Error ? e.message : "Connection unavailable.");
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, [profile?.institution_slug, days]);
  useFocusEffect(
    useCallback(() => {
      void refresh();
      return () => {
        request.current += 1;
      };
    }, [refresh]),
  );
  return {
    rows,
    followers,
    series,
    loading,
    error,
    refresh,
    views: rows.reduce((n, r) => n + (r.views ?? 0), 0),
    comments: rows.reduce((n, r) => n + (r.comments_count ?? 0), 0),
  };
}
function Metrics({ values }: { values: [string, number][] }) {
  const { colors } = useTheme();
  return (
    <Card>
      <View style={styles.grid}>
        {values.map(([label, n]) => (
          <View key={label} style={styles.metric}>
            <Text style={[styles.number, { color: colors.text }]}>
              {n.toLocaleString()}
            </Text>
            <Body>{label}</Body>
          </View>
        ))}
      </View>
    </Card>
  );
}

export function DashboardScreen({ navigation }: Props) {
  const org = useOrg(),
    data = useWorkspace(),
    { profile } = useAuth();
  return (
    <Access org={org} navigation={navigation}>
      <Screen refreshing={data.loading} onRefresh={() => void data.refresh()}>
        <Body>INSTITUTION WORKSPACE</Body>
        <Title>{profile?.institution_name ?? "Your organisation"}</Title>
        <Body>Your official voice. Keep your readers informed.</Body>
        {data.error ? (
          <Notice message={data.error} retry={() => void data.refresh()} />
        ) : data.loading ? (
          <ActivityIndicator />
        ) : (
          <>
            <Metrics
              values={[
                [
                  "Published releases",
                  data.rows.filter((r) => r.status === "Published").length,
                ],
                ["Views", data.views],
                ["Followers", data.followers],
                ["Comments", data.comments],
              ]}
            />
            <Card>
              <Title>Latest releases</Title>
              {data.rows.length === 0 && (
                <Body>Your first release starts here.</Body>
              )}
              {data.rows.slice(0, 5).map((r) => (
                <View key={r.id} style={styles.wrap}>
                  <Body>
                    {r.type} · {r.status}
                  </Body>
                  <Button
                    title={r.heading}
                    variant="secondary"
                    onPress={() =>
                      navigation.navigate(
                        org.can.publish ? "Publish" : "Release",
                        { id: r.id },
                      )
                    }
                  />
                </View>
              ))}
            </Card>
          </>
        )}
        {org.can.publish && (
          <Button
            title="Create a release"
            onPress={() => navigation.navigate("Publish", { id: undefined })}
          />
        )}
        <Card>
          <Title>Workspace</Title>
          {[
            ["Releases", "Manage releases"],
            ["Analytics", "Analytics"],
            ["Audience", "Audience"],
            ["Team", "Team and invitations"],
            ["InstitutionProfile", "Organisation profile"],
            ["Settings", "Settings"],
          ].map(([name, label]) => (
            <Button
              key={name}
              title={label}
              variant="secondary"
              onPress={() => navigation.navigate(name)}
            />
          ))}
        </Card>
      </Screen>
    </Access>
  );
}

export function ReleasesScreen({ navigation }: Props) {
  const org = useOrg(),
    data = useWorkspace();
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("All"),
    [type, setType] = useState("All"),
    [busy, setBusy] = useState(false),
    [limit, setLimit] = useState(20);
  const mutate = async (
    row: ReleaseRow,
    action: "Archived" | "Draft" | "delete",
  ) => {
    if (!supabase || !org.can.publish || !org.slug || busy) return;
    setBusy(true);
    try {
      const q = supabase.from("releases");
      const result = await (
        action === "delete" ? q.delete() : q.update({ status: action })
      )
        .eq("id", row.id)
        .eq("institution_slug", org.slug)
        .select("id")
        .maybeSingle();
      if (result.error || !result.data?.id)
        throw new Error(
          "Your changes could not be saved. Check your access and try again.",
        );
      if (action === "delete")
        track("release_deleted", {
          releaseId: row.id,
          status: row.status,
          type: row.type,
        });
      await data.refresh();
    } catch (e) {
      Alert.alert(
        "Action failed",
        e instanceof Error ? e.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const visible = data.rows.filter(
    (r) =>
      (status === "All" || r.status === status) &&
      (type === "All" || r.type === type) &&
      `${r.heading} ${r.subheading ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <Access org={org} navigation={navigation}>
      <Screen refreshing={data.loading} onRefresh={() => void data.refresh()}>
        <Title>Releases</Title>
        <Body>Publish, refine, and manage your official updates.</Body>
        {org.can.publish && (
          <Button
            title="New release"
            onPress={() => navigation.navigate("Publish", { id: undefined })}
          />
        )}
        <Field
          label="Search releases"
          value={query}
          onChangeText={(v) => {
            setQuery(v);
            setLimit(20);
          }}
        />
        <Choice
          values={["All", "Published", "Draft", "Scheduled", "Archived"]}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setLimit(20);
          }}
        />
        <Choice
          values={["All", ...new Set(data.rows.map((r) => r.type))]}
          value={type}
          onChange={setType}
        />
        {data.error && (
          <Notice message={data.error} retry={() => void data.refresh()} />
        )}
        {!data.loading && !data.error && visible.length === 0 && (
          <Notice message="No releases match these filters." />
        )}
        {visible.slice(0, limit).map((r) => (
          <Card key={r.id}>
            <Body>
              {r.type} · {r.status}
            </Body>
            <Title>{r.heading}</Title>
            <Body>{r.subheading}</Body>
            <Body>
              {r.views ?? 0} views · {r.comments_count ?? 0} comments
            </Body>
            {r.status === "Published" && (
              <Button
                title="Read release"
                variant="secondary"
                onPress={() => navigation.navigate("Release", { id: r.id })}
              />
            )}
            {org.can.publish && (
              <>
                <Button
                  title="Edit or publish"
                  onPress={() => navigation.navigate("Publish", { id: r.id })}
                />
                <Button
                  disabled={busy}
                  title={
                    r.status === ("Archived" as string)
                      ? "Restore to drafts"
                      : "Archive"
                  }
                  variant="secondary"
                  onPress={() =>
                    Alert.alert(
                      r.status === ("Archived" as string)
                        ? "Restore release?"
                        : "Archive release?",
                      "The release will be hidden from public feeds until published again.",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Continue",
                          onPress: () =>
                            void mutate(
                              r,
                              r.status === ("Archived" as string)
                                ? "Draft"
                                : "Archived",
                            ),
                        },
                      ],
                    )
                  }
                />
                <Button
                  title="Delete permanently"
                  variant="danger"
                  disabled={busy}
                  onPress={() =>
                    Alert.alert(
                      "Delete this release?",
                      "This action cannot be undone.",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Delete",
                          style: "destructive",
                          onPress: () => void mutate(r, "delete"),
                        },
                      ],
                    )
                  }
                />
              </>
            )}
          </Card>
        ))}
        {visible.length > limit && (
          <Button
            title="Load more"
            variant="secondary"
            onPress={() => setLimit((n) => n + 20)}
          />
        )}
      </Screen>
    </Access>
  );
}

async function pickAndUpload(slug: string, purpose: "logo" | "cover") {
  if (!supabase) throw new Error("Reconnect your account.");
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted)
    throw new Error(
      "Allow photo library access in device settings to choose an image.",
    );
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: purpose === "logo",
    aspect: purpose === "logo" ? [1, 1] : undefined,
    quality: 0.9,
    base64: true,
  });
  if (result.canceled) return null;
  const asset = result.assets[0],
    mime = asset.mimeType ?? "image/jpeg";
  if (
    !/^image\/(png|jpeg|webp)$/.test(mime) ||
    (asset.fileSize ?? 0) > (purpose === "logo" ? 2 : 3) * 1024 * 1024
  )
    throw new Error(
      `Choose a PNG, JPEG or WebP under ${purpose === "logo" ? 2 : 3} MB.`,
    );
  // Native fetch(uri).blob() is not reliable for Supabase uploads; ArrayBuffer is.
  if (!asset.base64)
    throw new Error(
      "The image could not be read. Please choose another image.",
    );
  const binary = atob(asset.base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  if (bytes.byteLength > (purpose === "logo" ? 2 : 3) * 1024 * 1024)
    throw new Error("The selected image is too large.");
  const path = `${slug}/${purpose}-${Date.now()}.${mime.split("/")[1]}`;
  const { error } = await supabase.storage
    .from("org-media")
    .upload(path, bytes.buffer, {
      contentType: mime,
      cacheControl: "31536000",
      upsert: false,
    });
  if (error) throw new Error("Image upload failed. Please try again.");
  return supabase.storage.from("org-media").getPublicUrl(path).data.publicUrl;
}

export function PublishScreen({ navigation, route }: Props) {
  const org = useOrg(),
    { user, profile } = useAuth(),
    { width } = useWindowDimensions(),
    { colors } = useTheme();
  const editingId = route.params?.id as string | undefined;
  const [heading, setHeading] = useState(""),
    [summary, setSummary] = useState(""),
    [body, setBody] = useState(""),
    [type, setType] = useState("Announcement"),
    [scene, setScene] = useState("wind-farm");
  const [originalDate, setOriginalDate] = useState<string | null>(null),
    [types, setTypes] = useState<string[]>(TYPES),
    [covers, setCovers] = useState<{ label: string; url: string }[]>([]);
  const [loading, setLoading] = useState(!!editingId),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState(false),
    [saved, setSaved] = useState("");
  const allowLeave = useRef(false);
  const snapshot = JSON.stringify([heading, summary, body, type, scene]);
  const dirty =
    !loading && saved !== snapshot && !!(heading || summary || body);
  usePreventRemove(dirty, ({ data }) => {
    if (allowLeave.current) {
      navigation.dispatch(data.action);
      return;
    }
    Alert.alert("Discard unsaved changes?", "Save a draft to keep your work.", [
      { text: "Keep editing", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => {
          navigation.dispatch(data.action);
        },
      },
    ]);
  });
  useEffect(() => {
    if (!supabase || !org.slug) return;
    let active = true;
    void Promise.all([
      supabase
        .from("platform_release_types")
        .select("name")
        .order("created_at"),
      supabase.from("platform_covers").select("label,url").order("created_at"),
    ]).then(([t, c]) => {
      if (!active) return;
      if (t.data?.length) setTypes(t.data.map((v) => v.name));
      if (c.data) setCovers(c.data);
    });
    allowLeave.current = false;
    if (!editingId) {
      setHeading("");
      setSummary("");
      setBody("");
      setType("Announcement");
      setScene("wind-farm");
      setOriginalDate(null);
      setReview(false);
      setError(null);
      setSaved(JSON.stringify(["", "", "", "Announcement", "wind-farm"]));
      setLoading(false);
      return () => {
        active = false;
      };
    }
    void supabase
      .from("release_details")
      .select("*")
      .eq("id", editingId)
      .eq("institution_slug", org.slug)
      .maybeSingle()
      .then(({ data, error: e }) => {
        if (!active) return;
        if (e || !data) {
          setError("This release could not be loaded or is unavailable.");
          setLoading(false);
          return;
        }
        setHeading(data.heading);
        setSummary(data.subheading ?? "");
        setBody(data.body ?? "");
        setType(data.type);
        setScene(data.scene);
        setOriginalDate(data.published_at);
        setSaved(
          JSON.stringify([
            data.heading,
            data.subheading ?? "",
            data.body ?? "",
            data.type,
            data.scene,
          ]),
        );
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [editingId, org.slug]);
  const validate = (publishing: boolean) => {
    if (
      !heading.trim() ||
      heading.trim().length > 200 ||
      summary.length > 250 ||
      body.length > 200000
    ) {
      Alert.alert(
        "Check your release",
        "Add a heading and keep the heading, summary and body within their limits.",
      );
      return false;
    }
    if (
      publishing &&
      (!summary.trim() ||
        !body
          .replace(/<[^>]*>/g, " ")
          .replace(/&nbsp;/g, " ")
          .trim())
    ) {
      Alert.alert(
        "Complete the release",
        "A summary and full release body are required to publish.",
      );
      return false;
    }
    return true;
  };
  const save = async (status: "Published" | "Draft") => {
    if (
      busy ||
      !supabase ||
      !user ||
      !org.slug ||
      !org.can.publish ||
      (status === "Published" && !org.verified) ||
      !validate(status === "Published")
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const content = {
        heading: heading.trim(),
        subheading: summary.trim() || null,
        body: sanitizeRichText(body) || null,
        type,
        scene,
        status,
        published_at:
          status === "Published"
            ? (originalDate ?? new Date().toISOString())
            : null,
      };
      const result = editingId
        ? await supabase
            .from("releases")
            .update(content)
            .eq("id", editingId)
            .eq("institution_slug", org.slug)
            .select("id")
            .maybeSingle()
        : await supabase
            .from("releases")
            .insert({
              ...content,
              owner: user.id,
              institution_slug: org.slug,
              institution_name: profile?.institution_name ?? null,
            })
            .select("id")
            .single();
      if (result.error || !result.data?.id)
        throw new Error(
          "Could not save. Check your publishing access and try again.",
        );
      setSaved(snapshot);
      allowLeave.current = true;
      track(
        status === "Published" ? "release_published" : "release_draft_saved",
        { releaseId: result.data.id, status, type },
      );
      navigation.navigate("Releases");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Saving failed.");
    } finally {
      setBusy(false);
    }
  };
  const upload = async () => {
    if (!org.slug) return;
    setBusy(true);
    try {
      const url = await pickAndUpload(org.slug, "cover");
      if (url) setScene(url);
    } catch (e) {
      Alert.alert(
        "Upload unavailable",
        e instanceof Error ? e.message : "Try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Access org={org} navigation={navigation}>
      <Screen>
        <Title>{editingId ? "Edit release" : "Create a release"}</Title>
        {!org.can.publish ? (
          <Notice message="Your role has read-only access. Ask the owner for an editor role." />
        ) : loading ? (
          <ActivityIndicator />
        ) : error && !saved ? (
          <Notice message={error} />
        ) : (
          <>
            {error && <Notice message={error} />}
            <Body>{profile?.institution_name} · Official release</Body>
            {review ? (
              <Card>
                <Body>{type}</Body>
                <Title>{heading}</Title>
                <Body>{summary}</Body>
                {scene.startsWith("https://") && (
                  <Image source={{ uri: scene }} style={styles.cover} />
                )}
                <RenderHTML
                  contentWidth={width - 64}
                  source={{ html: sanitizeRichText(body) }}
                  baseStyle={{ color: colors.text }}
                />
                <Body>
                  Publishing makes this release available immediately.
                </Body>
                <Button
                  title={busy ? "Publishing…" : "Publish release"}
                  disabled={busy}
                  onPress={() => void save("Published")}
                />
                <Button
                  title="Back to edit"
                  variant="secondary"
                  disabled={busy}
                  onPress={() => setReview(false)}
                />
              </Card>
            ) : (
              <>
                <Card>
                  <Field
                    label="Heading"
                    value={heading}
                    onChangeText={setHeading}
                    maxLength={200}
                  />
                  <Field
                    label="Summary"
                    value={summary}
                    onChangeText={setSummary}
                    maxLength={250}
                    multiline
                  />
                  <RichComposer value={body} onChange={setBody} />
                </Card>
                <Card>
                  <Title>Release type</Title>
                  <Choice
                    values={Array.from(new Set([...types, type]))}
                    value={type}
                    onChange={setType}
                  />
                </Card>
                <Card>
                  <Title>Cover image</Title>
                  {scene.startsWith("https://") && (
                    <Image source={{ uri: scene }} style={styles.cover} />
                  )}
                  <Choice values={SCENES} value={scene} onChange={setScene} />
                  {covers.map((c) => (
                    <Button
                      key={c.url}
                      title={c.label}
                      variant={scene === c.url ? "primary" : "secondary"}
                      onPress={() => setScene(c.url)}
                    />
                  ))}
                  <Button
                    title={busy ? "Working…" : "Choose a photo"}
                    onPress={() => void upload()}
                    variant="secondary"
                    disabled={busy}
                  />
                  <Body>PNG, JPEG or WebP · up to 3 MB</Body>
                </Card>
                <Button
                  title="Review and publish"
                  disabled={busy || !org.canPublishNow}
                  onPress={() => {
                    if (validate(true)) setReview(true);
                  }}
                />
                <Button
                  title={originalDate ? "Unpublish to draft" : "Save draft"}
                  variant="secondary"
                  disabled={busy}
                  onPress={() =>
                    originalDate
                      ? Alert.alert(
                          "Unpublish this release?",
                          "The release will leave public feeds.",
                          [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Save as draft",
                              onPress: () => void save("Draft"),
                            },
                          ],
                        )
                      : void save("Draft")
                  }
                />
              </>
            )}
          </>
        )}
      </Screen>
    </Access>
  );
}

export function AnalyticsScreen({ navigation }: Props) {
  const org = useOrg(),
    [days, setDays] = useState(30),
    data = useWorkspace(days),
    { colors } = useTheme();
  const max = Math.max(1, ...data.series.map((v) => v.views));
  return (
    <Access org={org} navigation={navigation}>
      <Screen refreshing={data.loading} onRefresh={() => void data.refresh()}>
        <Title>Analytics</Title>
        <Body>Measured engagement with your official releases.</Body>
        <Choice
          values={["7 days", "30 days", "90 days"]}
          value={`${days} days`}
          onChange={(v) => setDays(parseInt(v, 10))}
        />
        {data.error ? (
          <Notice message={data.error} retry={() => void data.refresh()} />
        ) : data.loading ? (
          <ActivityIndicator />
        ) : (
          <>
            <Metrics
              values={[
                [
                  "Views in period",
                  data.series.reduce((n, v) => n + v.views, 0),
                ],
                ["All-time views", data.views],
                ["Comments", data.comments],
                ["Followers", data.followers],
              ]}
            />
            <Card>
              <Title>Daily views</Title>
              <View
                style={styles.chart}
                accessibilityLabel={data.series
                  .map((v) => `${v.day}: ${v.views} views`)
                  .join(". ")}
              >
                {data.series.map((v) => (
                  <View
                    key={v.day}
                    style={{
                      flex: 1,
                      minHeight: 2,
                      height: Math.max(2, (110 * v.views) / max),
                      backgroundColor: colors.primary,
                      borderRadius: 3,
                    }}
                  />
                ))}
              </View>
              <Body>
                {data.series[0]?.day} — {data.series.at(-1)?.day}
              </Body>
            </Card>
            <Card>
              <Title>Top releases</Title>
              {[...data.rows]
                .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
                .slice(0, 10)
                .map((r) => (
                  <View key={r.id}>
                    <Button
                      title={r.heading}
                      variant="secondary"
                      onPress={() =>
                        navigation.navigate("Release", { id: r.id })
                      }
                    />
                    <Body>
                      {r.views ?? 0} views · {r.comments_count ?? 0} comments
                    </Body>
                  </View>
                ))}
              {!data.rows.length && (
                <Body>
                  Publish your first release to start measuring engagement.
                </Body>
              )}
            </Card>
          </>
        )}
      </Screen>
    </Access>
  );
}
export function AudienceScreen({ navigation }: Props) {
  const org = useOrg(),
    data = useWorkspace();
  return (
    <Access org={org} navigation={navigation}>
      <Screen refreshing={data.loading} onRefresh={() => void data.refresh()}>
        <Title>Your audience</Title>
        {data.error ? (
          <Notice message={data.error} retry={() => void data.refresh()} />
        ) : data.loading ? (
          <ActivityIndicator />
        ) : (
          <>
            <Metrics
              values={[
                ["Followers", data.followers],
                ["Releases", data.rows.length],
                ["Views", data.views],
                ["Comments", data.comments],
                [
                  "Average views per release",
                  data.rows.length
                    ? Math.round(data.views / data.rows.length)
                    : 0,
                ],
              ]}
            />
            <Card>
              <Title>Audience insights</Title>
              <Body>
                Followers, views and comments reflect recorded activity.
                Location, age, gender and device demographics are not collected.
              </Body>
              {data.followers === 0 && data.views === 0 && (
                <Body>
                  No audience activity has been recorded yet. Share your
                  official releases to help readers discover your institution.
                </Body>
              )}
            </Card>
          </>
        )}
      </Screen>
    </Access>
  );
}

function ProfileForm({
  navigation,
  onboarding = false,
}: {
  navigation: any;
  onboarding?: boolean;
}) {
  const org = useOrg(),
    { profile, user, refreshProfile } = useAuth();
  const [website, setWebsite] = useState(profile?.org_website ?? ""),
    [location, setLocation] = useState(profile?.org_location ?? ""),
    [category, setCategory] = useState(profile?.org_category ?? ""),
    [description, setDescription] = useState(
      profile?.org_description ?? profile?.bio ?? "",
    );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const editable = org.active && org.role === "owner";
  const save = async () => {
    const url = website.trim() ? safeExternalUrl(website) : null;
    if (!editable || !supabase || !user || busy) return;
    if (
      (website.trim() && !url) ||
      (onboarding && (!category || !url)) ||
      description.length > 5000 ||
      location.length > 300 ||
      category.length > 100
    ) {
      setError("Enter a valid website and complete the organisation details.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data, error: e } = await supabase
        .from("profiles")
        .update({
          org_website: url,
          org_location: location.trim() || null,
          org_category: category.trim() || null,
          org_description: description.trim(),
          bio: description.trim(),
          ...(onboarding ? { onboarding_complete: true } : {}),
        })
        .eq("id", user.id)
        .select("id,onboarding_complete")
        .maybeSingle();
      if (e || !data?.id || (onboarding && !data.onboarding_complete))
        throw new Error(
          "Profile could not be saved. Check your access and try again.",
        );
      await refreshProfile();
      if (onboarding) navigation.navigate("Dashboard");
      else
        Alert.alert(
          "Profile updated",
          "Your organisation details have been saved.",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Saving failed.");
    } finally {
      setBusy(false);
    }
  };
  const logo = async () => {
    if (!org.slug || !editable || !user || !supabase) return;
    setBusy(true);
    try {
      const url = await pickAndUpload(org.slug, "logo");
      if (url) {
        const { data, error: e } = await supabase
          .from("profiles")
          .update({ avatar_url: url })
          .eq("id", user.id)
          .select("id")
          .maybeSingle();
        if (e || !data?.id) throw new Error("Could not save the logo.");
        await refreshProfile();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Access org={org} navigation={navigation}>
      <Screen>
        <Title>
          {onboarding ? "Set up your organisation" : "Organisation profile"}
        </Title>
        <Body>{profile?.institution_name}</Body>
        <Body>
          {org.verified ? "Verified institution" : "Awaiting verification"}
        </Body>
        {error && <Notice message={error} />}
        <Card>
          {profile?.avatar_url && (
            <Image source={{ uri: profile.avatar_url }} style={styles.logo} />
          )}
          <Body>
            Your verified institution name is managed by the platform
            administrator.
          </Body>
          {editable && (
            <Button
              title="Choose organisation logo"
              variant="secondary"
              onPress={() => void logo()}
              disabled={busy}
            />
          )}
          <Field
            label="Official website"
            value={website}
            onChangeText={setWebsite}
            editable={editable}
            keyboardType="url"
            autoCapitalize="none"
            maxLength={500}
          />
          <Field
            label="Location"
            value={location}
            onChangeText={setLocation}
            editable={editable}
            maxLength={300}
          />
          <Body>Organisation type</Body>
          <Choice
            values={CATEGORIES}
            value={category}
            onChange={setCategory}
            disabled={!editable}
          />
          <Field
            label="About your organisation"
            value={description}
            onChangeText={setDescription}
            editable={editable}
            multiline
            maxLength={5000}
          />
          {editable ? (
            <Button
              title={
                busy
                  ? "Saving…"
                  : onboarding
                    ? "Complete setup"
                    : "Save profile"
              }
              disabled={busy}
              onPress={() => void save()}
            />
          ) : (
            <Body>Only the organisation owner can edit this profile.</Body>
          )}
        </Card>
        {profile?.institution_slug && (
          <Button
            title="View public profile"
            variant="secondary"
            onPress={() =>
              navigation.navigate("Source", { slug: profile.institution_slug })
            }
          />
        )}
      </Screen>
    </Access>
  );
}
export function InstitutionProfileScreen({ navigation }: Props) {
  return <ProfileForm navigation={navigation} />;
}
export function OnboardingScreen({ navigation }: Props) {
  return <ProfileForm navigation={navigation} onboarding />;
}
export function SettingsScreen({ navigation }: Props) {
  const org = useOrg(),
    { profile, user, signOut } = useAuth(),
    { mode, setMode } = useTheme();
  const [busy, setBusy] = useState(false);
  return (
    <Access org={org} navigation={navigation} team>
      <Screen>
        <Title>Settings</Title>
        <Card>
          <Title>Organisation</Title>
          <Body>{profile?.institution_name}</Body>
          <Button
            title="Edit public profile"
            variant="secondary"
            onPress={() => navigation.navigate("InstitutionProfile")}
          />
        </Card>
        <Card>
          <Title>Appearance</Title>
          <Choice
            values={["system", "light", "dark"]}
            value={mode}
            onChange={(v) => setMode(v as "system" | "light" | "dark")}
          />
        </Card>
        <Card>
          <Title>Account</Title>
          <Body>{user?.email}</Body>
          <Body>Institution · {ROLE_LABEL[org.role ?? "viewer"]}</Body>
          <Button
            title={busy ? "Signing out…" : "Sign out"}
            variant="secondary"
            disabled={busy}
            onPress={() => {
              setBusy(true);
              void signOut().finally(() => setBusy(false));
            }}
          />
        </Card>
        <Button
          title="Help"
          variant="secondary"
          onPress={() => navigation.navigate("Help")}
        />
      </Screen>
    </Access>
  );
}
export function PendingReviewScreen({ navigation }: Props) {
  const org = useOrg(),
    { profile, signOut, refreshProfile } = useAuth();
  return (
    <Screen>
      <Title>Your institution is under review</Title>
      <Body>{profile?.institution_name}</Body>
      <Body>
        Platform approval unlocks your publishing workspace. Refresh to check
        the latest decision.
      </Body>
      {org.error && <Notice message={org.error} />}
      <Button
        title="Refresh status"
        disabled={org.loading}
        onPress={() => void Promise.all([org.refresh(), refreshProfile()])}
      />
      <Button
        title="Sign out"
        variant="secondary"
        onPress={() => void signOut()}
      />
    </Screen>
  );
}

export function TeamScreen({ navigation }: Props) {
  const org = useOrg();
  const [email, setEmail] = useState(""),
    [role, setRole] = useState<OrgRole>("editor"),
    [busy, setBusy] = useState(false),
    [lastLink, setLastLink] = useState<string | null>(null);
  const run = async (action: () => Promise<boolean>) => {
    if (busy) return;
    setBusy(true);
    try {
      if (!(await action()))
        Alert.alert("Action failed", "Refresh your team and try again.");
    } catch {
      Alert.alert("Action failed", "Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };
  const invite = async () => {
    if (busy || !org.can.invite || !org.seatsLeft) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      Alert.alert("Check the email", "Enter a valid email address.");
      return;
    }
    setBusy(true);
    try {
      const item = await org.createInvite(email.trim(), role);
      if (item?.token) {
        setEmail("");
        setLastLink(`presspaper://join/${encodeURIComponent(item.token)}`);
      } else
        Alert.alert(
          "Invite unavailable",
          "Review your seats and email address, then try again.",
        );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Access org={org} navigation={navigation} team>
      <Screen refreshing={org.loading} onRefresh={() => void org.refresh()}>
        <Title>Your team</Title>
        <Body>
          {org.seatsUsed} of {org.seatLimit} seats used · {org.seatsLeft}{" "}
          available
        </Body>
        {!org.active && (
          <Notice
            message={
              org.status === "pending"
                ? "Your membership is awaiting owner approval."
                : "Your organisation membership is inactive. Contact the owner."
            }
          />
        )}
        <Body>
          Owner approves members. Publishers and editors create releases;
          analysts have read-only access.
        </Body>
        {org.can.approve &&
          org.pendingMembers.map((m) => (
            <Card key={m.user_id}>
              <Title>{m.full_name || m.email}</Title>
              <Body>
                {m.email} · {ROLE_LABEL[m.role]} · Pending
              </Body>
              <Button
                title="Approve member"
                disabled={busy}
                onPress={() => void run(() => org.approve(m.user_id))}
              />
              <Button
                title="Decline"
                disabled={busy}
                variant="secondary"
                onPress={() => void run(() => org.decline(m.user_id))}
              />
            </Card>
          ))}
        {org.can.invite && (
          <Card>
            <Title>Invite a teammate</Title>
            <Field
              label="Email address"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              maxLength={320}
            />
            <Choice
              values={["Publisher", "Editor", "Analyst"]}
              value={ROLE_LABEL[role]}
              onChange={(v) =>
                setRole(
                  v === "Publisher"
                    ? "admin"
                    : v === "Editor"
                      ? "editor"
                      : "viewer",
                )
              }
            />
            <Button
              title={busy ? "Creating…" : "Create invitation"}
              onPress={() => void invite()}
              disabled={busy || org.seatsLeft === 0}
            />
            <Body>
              Invitations are email-locked. The owner approves the member after
              acceptance.
            </Body>
            {lastLink && (
              <Button
                title="Share invitation"
                variant="secondary"
                onPress={() => void Share.share({ message: lastLink })}
              />
            )}
          </Card>
        )}
        {org.invites.map((inv) => (
          <Card key={inv.id}>
            <Body>
              {inv.email} · {ROLE_LABEL[inv.role]} · Invited
            </Body>
            {org.can.invite && (
              <Button
                title="Revoke invitation"
                disabled={busy}
                variant="secondary"
                onPress={() => void run(() => org.revokeInvite(inv.id))}
              />
            )}
          </Card>
        ))}
        {org.activeMembers.map((m) => (
          <Card key={m.user_id}>
            <Title>{m.full_name || m.email}</Title>
            <Body>
              {m.email} · {ROLE_LABEL[m.role]}
            </Body>
            {org.can.approve && m.role !== "owner" && (
              <>
                <Choice
                  values={["Publisher", "Editor", "Analyst"]}
                  value={ROLE_LABEL[m.role]}
                  onChange={(v) =>
                    void run(() =>
                      org.setRole(
                        m.user_id,
                        v === "Publisher"
                          ? "admin"
                          : v === "Editor"
                            ? "editor"
                            : "viewer",
                      ),
                    )
                  }
                  disabled={busy}
                />
                <Button
                  title="Remove member"
                  disabled={busy}
                  variant="danger"
                  onPress={() =>
                    Alert.alert(
                      "Remove this member?",
                      "They will lose access to the organisation workspace.",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Remove",
                          style: "destructive",
                          onPress: () => void run(() => org.decline(m.user_id)),
                        },
                      ],
                    )
                  }
                />
              </>
            )}
          </Card>
        ))}
      </Screen>
    </Access>
  );
}
