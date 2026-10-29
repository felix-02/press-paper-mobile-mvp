import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/lib/supabase";
import {
  useAdminConsole,
  type AdminRelease,
  type AdminUser,
  type AccountStatus,
  type PostModerationStatus,
} from "@/lib/useAdminConsole";
import { Body, Button, Card, Field, Screen, Title, useTheme } from "@/ui";

type Section =
  | "overview"
  | "users"
  | "institutions"
  | "releases"
  | "activity"
  | "audit"
  | "review"
  | "invites";
type Account = Pick<
  AdminUser,
  "user_id" | "email" | "is_admin" | "account_status"
>;
type Moderation =
  | { kind: "account"; row: Account; status: AccountStatus }
  | { kind: "release"; row: AdminRelease; status: PostModerationStatus };
const sections: [Section, string][] = [
  ["overview", "Overview"],
  ["users", "Users"],
  ["institutions", "Institutions"],
  ["releases", "Posts"],
  ["activity", "Activity"],
  ["audit", "Audit log"],
  ["review", "Review"],
  ["invites", "Invitations"],
];
const date = (value: string | null | undefined) =>
  value && !Number.isNaN(new Date(value).getTime())
    ? new Date(value).toLocaleString()
    : "Not available";
const verbs: Record<string, string> = {
  active: "Recover",
  archived: "Archive",
  banned: "Ban",
  deleted: "Delete",
};
const verb = (status: string) => verbs[status] ?? status;
const matches = (query: string, values: unknown[]) =>
  !query ||
  values.some((value) =>
    String(value ?? "")
      .toLowerCase()
      .includes(query),
  );

function Badge({ value }: { value?: string | null }) {
  const label = (value || "unknown").toLowerCase();
  const positive = ["active", "verified", "published", "accepted"].includes(
    label,
  );
  const negative = ["banned", "rejected", "deleted"].includes(label);
  const foreground = positive ? "#047857" : negative ? "#b91c1c" : "#92400e";
  const background = positive ? "#d1fae5" : negative ? "#fee2e2" : "#fef3c7";
  return (
    <View style={[styles.badge, { backgroundColor: background }]}>
      <Text
        style={{
          color: foreground,
          fontSize: 12,
          fontWeight: "700",
          textTransform: "capitalize",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/** Separate platform console; every read and mutation is also authorized by a checked RPC. */
export function AdminScreen() {
  const { profile, signOut } = useAuth();
  const admin = useAdminConsole();
  const { colors, mode, setMode } = useTheme();
  const [section, setSection] = useState<Section>("overview");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [request, setRequest] = useState<Moderation | null>(null);
  const [reason, setReason] = useState("");
  const [email, setEmail] = useState("");
  const [orgName, setOrgName] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [newType, setNewType] = useState("");
  const [coverLabel, setCoverLabel] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const query = search.trim().toLowerCase();

  // A ref prevents duplicate submissions even before the next React render.
  async function action(work: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await work();
    } catch {
      setMessage(
        "The action could not be completed. Check your connection and try again.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function openModeration(next: Moderation) {
    setReason("");
    setMessage(null);
    setRequest(next);
  }
  function verify(id: string, approved: boolean) {
    Alert.alert(
      `${approved ? "Approve" : "Reject"} institution?`,
      approved
        ? "This enables verified publishing for this institution."
        : "This removes verified publishing access.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: approved ? "Approve" : "Reject",
          style: approved ? "default" : "destructive",
          onPress: () =>
            void action(async () => {
              const ok = await admin.setInstitutionVerification(id, approved);
              setMessage(
                ok
                  ? `Institution ${approved ? "approved" : "rejected"}.`
                  : "The verification action failed.",
              );
            }),
        },
      ],
    );
  }
  async function confirmModeration() {
    if (!request || reason.trim().length < 3 || reason.trim().length > 1000)
      return;
    const current = request;
    await action(async () => {
      const result =
        current.kind === "account"
          ? await admin.setAccountStatus(
              current.row.user_id,
              current.status,
              reason.trim(),
            )
          : await admin.setReleaseModeration(
              current.row.release_id,
              current.status,
              reason.trim(),
            );
      if (result.ok) {
        setRequest(null);
        setReason("");
        setMessage(
          `${current.kind === "account" ? "Account" : "Post"} ${current.status === "active" ? "recovered" : current.status}.`,
        );
      } else {
        const messages: Record<string, string> = {
          protected_admin: "Platform admin accounts are protected.",
          cannot_self: "You cannot moderate your own account.",
          no_change: "This record already has the requested status.",
          forbidden: "Your account does not have permission for this action.",
        };
        Alert.alert(
          "Action not applied",
          messages[result.result] ??
            "The moderation action failed. Your reason is preserved so you can retry.",
        );
      }
    });
  }
  async function issueInvite() {
    if (
      orgName.trim().length < 2 ||
      orgName.trim().length > 160 ||
      email.length > 320 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      setMessage("Enter an organisation name and a valid official email.");
      return;
    }
    await action(async () => {
      const result = await admin.createInstitutionInvite(
        email.trim().toLowerCase(),
        orgName.trim(),
      );
      if (!result.token) {
        setMessage(result.error || "The invitation could not be created.");
        return;
      }
      setInviteLink(
        `presspaper://institution-invite/${encodeURIComponent(result.token)}`,
      );
      setEmail("");
      setOrgName("");
      setMessage(
        "Invitation created. Share this single-use link with the invited person.",
      );
    });
  }
  function revoke(id: string) {
    Alert.alert(
      "Revoke invitation?",
      "The recipient will no longer be able to accept this invitation.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Revoke",
          style: "destructive",
          onPress: () =>
            void action(async () => {
              const ok = await admin.revokeInstitutionInvite(id);
              setMessage(
                ok
                  ? "Invitation revoked."
                  : "The invitation could not be revoked.",
              );
            }),
        },
      ],
    );
  }
  async function catalogue(kind: "type" | "cover") {
    if (!supabase) return;
    const name = newType.trim(),
      label = coverLabel.trim(),
      url = coverUrl.trim();
    if (kind === "type" && name.length < 2) {
      setMessage("Enter a release type of at least two characters.");
      return;
    }
    if (kind === "cover") {
      try {
        const parsed = new URL(url);
        if (
          label.length < 2 ||
          parsed.protocol !== "https:" ||
          parsed.username ||
          parsed.password
        )
          throw new Error("invalid");
      } catch {
        setMessage("Enter a cover label and a valid HTTPS image URL.");
        return;
      }
    }
    await action(async () => {
      const result =
        kind === "type"
          ? await supabase!.rpc("admin_add_release_type", { p_name: name })
          : await supabase!.rpc("admin_add_platform_cover", {
              p_label: label,
              p_url: url,
            });
      const ok = !result.error && result.data === "ok";
      setMessage(
        ok ? "Publishing catalogue updated." : "The catalogue update failed.",
      );
      if (ok) {
        if (kind === "type") setNewType("");
        else {
          setCoverLabel("");
          setCoverUrl("");
        }
      }
    });
  }
  const accountActions = (row: Account) =>
    row.is_admin || row.user_id === profile?.id ? (
      <Body>Protected platform administrator</Body>
    ) : (
      <View style={styles.actions}>
        {row.account_status === "active" ? (
          <>
            <Button
              title="Archive"
              variant="secondary"
              disabled={busy}
              onPress={() =>
                openModeration({ kind: "account", row, status: "archived" })
              }
            />
            <Button
              title="Ban"
              variant="danger"
              disabled={busy}
              onPress={() =>
                openModeration({ kind: "account", row, status: "banned" })
              }
            />
          </>
        ) : (
          <Button
            title="Recover account"
            variant="secondary"
            disabled={busy}
            onPress={() =>
              openModeration({ kind: "account", row, status: "active" })
            }
          />
        )}
      </View>
    );
  const more = (
    name: "users" | "institutions" | "releases" | "activity" | "audit",
  ) =>
    admin.hasMore[name] ? (
      <Button
        title={admin.loadingMore === name ? "Loading…" : "Load more"}
        variant="secondary"
        disabled={!!admin.loadingMore}
        onPress={() => void admin.loadMore(name)}
      />
    ) : null;
  const empty = (
    <Card>
      <Body>
        {query
          ? "No matching records in the loaded pages. Load more or change your search."
          : "No records yet."}
      </Body>
    </Card>
  );

  if (!profile?.is_admin || !admin.available)
    return (
      <Screen>
        <Title>Platform administrators only</Title>
        <Body>
          Administration requires an active platform administrator account.
        </Body>
      </Screen>
    );
  const pending = admin.pendingInstitutions.filter(
    (item) => item.status === "pending",
  );
  const users = admin.users.filter((item) =>
    matches(query, [
      item.email,
      item.full_name,
      item.role,
      item.institution_name,
      item.account_status,
    ]),
  );
  const institutions = admin.institutions.filter((item) =>
    matches(query, [
      item.owner_email,
      item.institution_name,
      item.institution_slug,
      item.verification_status,
      item.account_status,
    ]),
  );
  const releases = admin.releases.filter((item) =>
    matches(query, [
      item.heading,
      item.institution_name,
      item.institution_slug,
      item.author_email,
      item.publication_status,
      item.moderation_status,
    ]),
  );
  const activity = admin.activity.filter((item) =>
    matches(query, [
      item.actor_email,
      item.actor_name,
      item.event_type,
      item.target_id,
    ]),
  );
  const audit = admin.audit.filter((item) =>
    matches(query, [
      item.actor_email,
      item.action,
      item.target_id,
      item.reason,
    ]),
  );

  return (
    <>
      <Screen refreshing={admin.loading} onRefresh={() => void admin.refresh()}>
        <Title>Platform console</Title>
        <Body>
          Supervise Presspaper, review institutions, and manage publishing.
        </Body>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}
        >
          {sections.map(([id, label]) => (
            <Pressable
              key={id}
              accessibilityRole="tab"
              accessibilityState={{ selected: section === id }}
              onPress={() => {
                setSection(id);
                setSearch("");
              }}
              style={[
                styles.tab,
                {
                  backgroundColor: section === id ? "#2563eb" : "transparent",
                  borderColor: section === id ? "#2563eb" : "#64748b",
                },
              ]}
            >
              <Text
                style={{
                  color: section === id ? "#ffffff" : colors.text,
                  fontWeight: "600",
                }}
              >
                {label}
                {id === "review" && pending.length
                  ? ` (${pending.length})`
                  : ""}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        {message && (
          <Card>
            <Body>{message}</Body>
          </Card>
        )}
        {admin.error && (
          <Card>
            <Body>{admin.error}</Body>
            <Button title="Retry" onPress={() => void admin.refresh()} />
          </Card>
        )}
        {admin.loading ? (
          <ActivityIndicator
            accessibilityLabel="Loading administration"
            size="large"
          />
        ) : (
          <>
            {section === "overview" && (
              <>
                <View style={styles.metrics}>
                  {[
                    ["Users loaded", admin.users.length],
                    ["Institutions loaded", admin.institutions.length],
                    ["Posts loaded", admin.releases.length],
                    ["Pending review", pending.length],
                    ["Activity loaded", admin.activity.length],
                    ["Audit entries loaded", admin.audit.length],
                  ].map(([label, value]) => (
                    <View key={label} style={styles.metric}>
                      <Card>
                        <Title>{String(value)}</Title>
                        <Body>{label}</Body>
                      </Card>
                    </View>
                  ))}
                </View>
                <Body>
                  Counts reflect the pages loaded in this console. Open a
                  section to load further records.
                </Body>
                <Title>Recent activity</Title>
                {admin.activity.slice(0, 5).map((event) => (
                  <Card key={event.event_id}>
                    <Body>
                      {event.actor_email || event.actor_name || "Unknown user"}
                    </Body>
                    <Body>{event.event_type}</Body>
                    <Body>{date(event.created_at)}</Body>
                  </Card>
                ))}
                {!admin.activity.length && (
                  <Body>No user activity recorded yet.</Body>
                )}
                <Title>Recent admin actions</Title>
                {admin.audit.slice(0, 5).map((event) => (
                  <Card key={event.audit_id}>
                    <Body>
                      {event.actor_email || "Administrator"} · {event.action}
                    </Body>
                    <Body>{event.reason || "No reason supplied"}</Body>
                    <Body>{date(event.created_at)}</Body>
                  </Card>
                ))}
                {!admin.audit.length && (
                  <Body>No privileged actions recorded yet.</Body>
                )}
              </>
            )}
            {[
              "users",
              "institutions",
              "releases",
              "activity",
              "audit",
            ].includes(section) && (
              <Field
                label="Search loaded records"
                value={search}
                onChangeText={setSearch}
                maxLength={100}
                placeholder="Search by name, email, or status"
                autoCapitalize="none"
              />
            )}
            {section === "users" && (
              <>
                {!users.length && empty}
                {users.map((user) => (
                  <Card key={user.user_id}>
                    <Title>{user.full_name || user.email}</Title>
                    <Body>{user.email}</Body>
                    <Body>
                      {user.role}
                      {user.institution_name
                        ? ` · ${user.institution_name}`
                        : ""}
                    </Body>
                    <Badge value={user.account_status} />
                    <Body>
                      Created {date(user.created_at)} · Last sign-in{" "}
                      {date(user.last_sign_in_at)}
                    </Body>
                    {user.status_reason && user.account_status !== "active" && (
                      <Body>{user.status_reason}</Body>
                    )}
                    {accountActions(user)}
                  </Card>
                ))}
                {more("users")}
              </>
            )}
            {section === "institutions" && (
              <>
                {!institutions.length && empty}
                {institutions.map((institution) => (
                  <Card key={institution.owner_id}>
                    <Title>
                      {institution.institution_name ||
                        institution.institution_slug}
                    </Title>
                    <Body>{institution.owner_email}</Body>
                    <Body>
                      {institution.member_count} members ·{" "}
                      {institution.release_count} posts ·{" "}
                      {institution.published_count} published
                    </Body>
                    <View style={styles.actions}>
                      <Badge value={institution.account_status} />
                      <Badge value={institution.verification_status} />
                    </View>
                    {institution.status_reason && (
                      <Body>{institution.status_reason}</Body>
                    )}
                    <View style={styles.actions}>
                      {institution.verification_status !== "verified" && (
                        <Button
                          title="Approve"
                          disabled={busy}
                          onPress={() => verify(institution.owner_id, true)}
                        />
                      )}
                      {institution.verification_status !== "rejected" && (
                        <Button
                          title="Reject"
                          variant="danger"
                          disabled={busy}
                          onPress={() => verify(institution.owner_id, false)}
                        />
                      )}
                    </View>
                    {accountActions({
                      user_id: institution.owner_id,
                      email: institution.owner_email,
                      account_status: institution.account_status,
                      is_admin: false,
                    })}
                  </Card>
                ))}
                {more("institutions")}
              </>
            )}
            {section === "releases" && (
              <>
                {!releases.length && empty}
                {releases.map((release) => (
                  <Card key={release.release_id}>
                    <Title>{release.heading}</Title>
                    <Body>
                      {release.institution_name || release.institution_slug} ·{" "}
                      {release.release_type}
                    </Body>
                    <Body>{release.author_email || release.author_id}</Body>
                    <Body>
                      {release.views} views · {release.comments_count} comments
                      · {date(release.published_at || release.created_at)}
                    </Body>
                    <View style={styles.actions}>
                      <Badge value={release.publication_status} />
                      <Badge value={release.moderation_status} />
                    </View>
                    {release.moderation_reason &&
                      release.moderation_status !== "active" && (
                        <Body>{release.moderation_reason}</Body>
                      )}
                    <View style={styles.actions}>
                      {release.moderation_status !== "active" && (
                        <Button
                          title="Recover"
                          variant="secondary"
                          disabled={busy}
                          onPress={() =>
                            openModeration({
                              kind: "release",
                              row: release,
                              status: "active",
                            })
                          }
                        />
                      )}
                      {release.moderation_status === "active" && (
                        <Button
                          title="Archive"
                          variant="secondary"
                          disabled={busy}
                          onPress={() =>
                            openModeration({
                              kind: "release",
                              row: release,
                              status: "archived",
                            })
                          }
                        />
                      )}
                      {release.moderation_status !== "deleted" && (
                        <Button
                          title="Delete"
                          variant="danger"
                          disabled={busy}
                          onPress={() =>
                            openModeration({
                              kind: "release",
                              row: release,
                              status: "deleted",
                            })
                          }
                        />
                      )}
                    </View>
                  </Card>
                ))}
                {more("releases")}
              </>
            )}
            {section === "activity" && (
              <>
                {!activity.length && empty}
                {activity.map((event) => (
                  <Card key={event.event_id}>
                    <Title>{event.event_type}</Title>
                    <Body>
                      {event.actor_email || event.actor_name || "Unknown user"}{" "}
                      · {event.actor_role || "Unknown role"}
                    </Body>
                    <Body>
                      {event.target_type || "Event"}
                      {event.target_id ? ` · ${event.target_id}` : ""}
                    </Body>
                    <Text
                      selectable
                      style={{
                        color: colors.text,
                        fontFamily:
                          Platform.OS === "ios" ? "Menlo" : "monospace",
                        fontSize: 12,
                      }}
                    >
                      {JSON.stringify(event.metadata, null, 2)}
                    </Text>
                    <Body>{date(event.created_at)}</Body>
                  </Card>
                ))}
                {more("activity")}
              </>
            )}
            {section === "audit" && (
              <>
                <Body>
                  This immutable history records each privileged database
                  mutation.
                </Body>
                {!audit.length && empty}
                {audit.map((event) => (
                  <Card key={event.audit_id}>
                    <Title>{event.action}</Title>
                    <Body>{event.actor_email || event.actor_id}</Body>
                    <Body>
                      {event.target_type} · {event.target_id}
                    </Body>
                    <Body>{event.reason || "No reason supplied"}</Body>
                    <Body>{date(event.created_at)}</Body>
                  </Card>
                ))}
                {more("audit")}
              </>
            )}
            {section === "review" && (
              <>
                {!pending.length && (
                  <Card>
                    <Body>No institutions are awaiting verification.</Body>
                  </Card>
                )}
                {pending.map((institution) => (
                  <Card key={institution.user_id}>
                    <Title>
                      {institution.institution_name ||
                        institution.institution_slug ||
                        "Unnamed institution"}
                    </Title>
                    <Body>{institution.email}</Body>
                    <Body>
                      {institution.domain || "No domain supplied"} ·{" "}
                      {date(institution.created_at)}
                    </Body>
                    <View style={styles.actions}>
                      <Button
                        title="Approve institution"
                        disabled={busy}
                        onPress={() => verify(institution.user_id, true)}
                      />
                      <Button
                        title="Reject"
                        variant="danger"
                        disabled={busy}
                        onPress={() => verify(institution.user_id, false)}
                      />
                    </View>
                  </Card>
                ))}
              </>
            )}
            {section === "invites" && (
              <>
                <Card>
                  <Title>Invite an institution</Title>
                  <Body>
                    Invitations are locked to the recipient email, expire after
                    30 minutes, and can be accepted once.
                  </Body>
                  <Field
                    label="Organisation name"
                    value={orgName}
                    onChangeText={setOrgName}
                    maxLength={160}
                  />
                  <Field
                    label="Official email"
                    value={email}
                    onChangeText={setEmail}
                    maxLength={320}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Button
                    title={busy ? "Working…" : "Create invitation"}
                    disabled={busy}
                    onPress={() => void issueInvite()}
                  />
                  {inviteLink && (
                    <>
                      <Text selectable style={{ color: colors.text }}>
                        {inviteLink}
                      </Text>
                      <Button
                        title="Share invitation"
                        variant="secondary"
                        onPress={() =>
                          void Share.share({ message: inviteLink }).catch(() =>
                            setMessage(
                              "Could not open the share sheet. Long-press the link to copy it.",
                            ),
                          )
                        }
                      />
                    </>
                  )}
                </Card>
                <Card>
                  <Title>Publishing catalogue</Title>
                  <Body>
                    Release types and cover images become available to all
                    publishers.
                  </Body>
                  <Field
                    label="New release type"
                    value={newType}
                    onChangeText={setNewType}
                    maxLength={60}
                    placeholder="e.g. Speech"
                  />
                  <Button
                    title="Add release type"
                    variant="secondary"
                    disabled={busy}
                    onPress={() => void catalogue("type")}
                  />
                  <Field
                    label="Cover label"
                    value={coverLabel}
                    onChangeText={setCoverLabel}
                    maxLength={60}
                  />
                  <Field
                    label="HTTPS image URL"
                    value={coverUrl}
                    onChangeText={setCoverUrl}
                    maxLength={500}
                    keyboardType="url"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Button
                    title="Add cover"
                    variant="secondary"
                    disabled={busy}
                    onPress={() => void catalogue("cover")}
                  />
                </Card>
                <Title>Issued invitations</Title>
                {!admin.invites.length && (
                  <Body>No invitations issued yet.</Body>
                )}
                {admin.invites.map((invite) => (
                  <Card key={invite.id}>
                    <Title>{invite.org_name}</Title>
                    <Body>{invite.email}</Body>
                    <Badge
                      value={
                        invite.consumed_at
                          ? "accepted"
                          : new Date(invite.expires_at).getTime() <= Date.now()
                            ? "expired"
                            : "pending"
                      }
                    />
                    <Body>Expires {date(invite.expires_at)}</Body>
                    {!invite.consumed_at && (
                      <Button
                        title="Revoke invitation"
                        variant="danger"
                        disabled={busy}
                        onPress={() => revoke(invite.id)}
                      />
                    )}
                  </Card>
                ))}
              </>
            )}
          </>
        )}
        <Card>
          <Body>Appearance</Body>
          <View style={styles.actions}>
            {(["system", "light", "dark"] as const).map((value) => (
              <Button
                key={value}
                title={`${value === mode ? "✓ " : ""}${value.charAt(0).toUpperCase() + value.slice(1)}`}
                variant="secondary"
                onPress={() => setMode(value)}
              />
            ))}
          </View>
        </Card>
        <Button
          title="Sign out"
          variant="secondary"
          disabled={busy}
          onPress={() => void signOut()}
        />
      </Screen>
      <Modal
        visible={!!request}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          if (!busy) setRequest(null);
        }}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Screen>
            <Title>
              {request
                ? `${verb(request.status)} ${request.kind === "account" ? "account" : "post"}`
                : "Moderation"}
            </Title>
            <Body>
              {request?.kind === "account"
                ? request.row.email
                : request?.row.heading}
            </Body>
            <Field
              label="Audit reason"
              value={reason}
              onChangeText={setReason}
              maxLength={1000}
              multiline
              numberOfLines={5}
              autoFocus
              placeholder="Explain why this action is required"
            />
            <Body>
              {reason.length}/1000 · A reason of at least three characters is
              required and will be written to the immutable audit log.
            </Body>
            {message && <Body>{message}</Body>}
            <Button
              title={
                busy
                  ? "Applying…"
                  : `${request ? verb(request.status) : "Apply"} now`
              }
              variant={request?.status === "active" ? "primary" : "danger"}
              disabled={busy || reason.trim().length < 3}
              onPress={() => void confirmModeration()}
            />
            <Button
              title="Cancel"
              variant="secondary"
              disabled={busy}
              onPress={() => setRequest(null)}
            />
          </Screen>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  tabs: { gap: 8, paddingVertical: 8 },
  tab: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 24,
    borderWidth: 1,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metric: { width: "48%", flexGrow: 1 },
});
