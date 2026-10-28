import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export type AccountStatus = "active" | "archived" | "banned";
export type PostModerationStatus = "active" | "archived" | "deleted";

export interface AdminUser {
  user_id: string;
  email: string;
  full_name: string | null;
  role: "individual" | "institution";
  institution_slug: string | null;
  institution_name: string | null;
  verification_status: string | null;
  is_admin: boolean;
  account_status: AccountStatus;
  status_reason: string | null;
  status_changed_at: string | null;
  created_at: string;
  last_sign_in_at: string | null;
}

export interface AdminInstitution {
  owner_id: string;
  owner_email: string;
  institution_slug: string;
  institution_name: string | null;
  verification_status: string;
  account_status: AccountStatus;
  status_reason: string | null;
  member_count: number;
  release_count: number;
  published_count: number;
  created_at: string;
}

export interface AdminRelease {
  release_id: string;
  heading: string;
  release_type: string;
  publication_status: string;
  moderation_status: PostModerationStatus;
  moderation_reason: string | null;
  moderation_changed_at: string | null;
  institution_slug: string;
  institution_name: string | null;
  author_id: string;
  author_email: string | null;
  views: number;
  comments_count: number;
  published_at: string | null;
  created_at: string;
}

export interface AdminActivityEvent {
  event_id: string;
  actor_id: string;
  actor_email: string | null;
  actor_name: string | null;
  actor_role: string | null;
  event_type: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AdminAuditEvent {
  audit_id: string;
  actor_id: string;
  actor_email: string | null;
  action: string;
  target_type: string;
  target_id: string;
  reason: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  created_at: string;
}

export interface PendingInstitution {
  user_id: string;
  institution_name: string | null;
  institution_slug: string | null;
  email: string;
  domain: string | null;
  created_at: string;
  status: string;
}

export interface PlatformInvite {
  id: string;
  email: string;
  org_name: string;
  org_slug: string;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
}

type PageName = "users" | "institutions" | "releases" | "activity" | "audit";
const PAGE_SIZE = 200;

function appendUnique<T>(current: T[], incoming: T[], key: (row: T) => string): T[] {
  const seen = new Set(current.map(key));
  return [...current, ...incoming.filter((row) => !seen.has(key(row)))];
}

export function useAdminConsole() {
  const { profile } = useAuth();
  const isAdmin = profile?.is_admin === true && profile.account_status !== "archived" && profile.account_status !== "banned";
  const available = isSupabaseConfigured && !!supabase && isAdmin;

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [institutions, setInstitutions] = useState<AdminInstitution[]>([]);
  const [releases, setReleases] = useState<AdminRelease[]>([]);
  const [activity, setActivity] = useState<AdminActivityEvent[]>([]);
  const [audit, setAudit] = useState<AdminAuditEvent[]>([]);
  const [pendingInstitutions, setPendingInstitutions] = useState<PendingInstitution[]>([]);
  const [invites, setInvites] = useState<PlatformInvite[]>([]);
  const [hasMore, setHasMore] = useState<Record<PageName, boolean>>({
    users: false,
    institutions: false,
    releases: false,
    activity: false,
    audit: false,
  });
  const [loading, setLoading] = useState(available);
  const [loadingMore, setLoadingMore] = useState<PageName | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++requestId.current;
    if (!available || !supabase) {
      setUsers([]);
      setInstitutions([]);
      setReleases([]);
      setActivity([]);
      setAudit([]);
      setPendingInstitutions([]);
      setInvites([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    const client = supabase;
    const [userResult, institutionResult, releaseResult, activityResult, auditResult, pendingResult, inviteResult] = await Promise.all([
      client.rpc("admin_list_users", { p_limit: PAGE_SIZE, p_offset: 0 }),
      client.rpc("admin_list_institutions", { p_limit: PAGE_SIZE, p_offset: 0 }),
      client.rpc("admin_list_releases", { p_limit: PAGE_SIZE, p_offset: 0 }),
      client.rpc("admin_list_activity", { p_limit: PAGE_SIZE, p_offset: 0 }),
      client.rpc("admin_list_audit", { p_limit: PAGE_SIZE, p_offset: 0 }),
      client.rpc("pending_institutions"),
      client.rpc("platform_invites_list"),
    ]);
    if (request !== requestId.current) return;

    const firstError = userResult.error
      ?? institutionResult.error
      ?? releaseResult.error
      ?? activityResult.error
      ?? auditResult.error
      ?? pendingResult.error
      ?? inviteResult.error;
    if (firstError) {
      setLoading(false);
      setError("We couldn't load the administration console. Check that migration 0016 is applied, then retry.");
      return;
    }

    const nextUsers = (userResult.data as AdminUser[] | null) ?? [];
    const nextInstitutions = (institutionResult.data as AdminInstitution[] | null) ?? [];
    const nextReleases = (releaseResult.data as AdminRelease[] | null) ?? [];
    const nextActivity = (activityResult.data as AdminActivityEvent[] | null) ?? [];
    const nextAudit = (auditResult.data as AdminAuditEvent[] | null) ?? [];
    setUsers(nextUsers);
    setInstitutions(nextInstitutions);
    setReleases(nextReleases);
    setActivity(nextActivity);
    setAudit(nextAudit);
    setPendingInstitutions((pendingResult.data as PendingInstitution[] | null) ?? []);
    setInvites((inviteResult.data as PlatformInvite[] | null) ?? []);
    setHasMore({
      users: nextUsers.length === PAGE_SIZE,
      institutions: nextInstitutions.length === PAGE_SIZE,
      releases: nextReleases.length === PAGE_SIZE,
      activity: nextActivity.length === PAGE_SIZE,
      audit: nextAudit.length === PAGE_SIZE,
    });
    setLoading(false);
  }, [available]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Profiles/releases are in the Supabase Realtime publication. RLS allows a
  // super-admin to receive these changes and lets a moderated user receive only
  // their own profile state so the blocked-account screen updates immediately.
  useEffect(() => {
    if (!available || !supabase || !profile?.id) return;
    let timer: number | null = null;
    const scheduleRefresh = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => void refresh(), 180);
    };
    const channel = supabase
      .channel(`admin-console:${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "releases" }, scheduleRefresh)
      .subscribe();
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      void supabase?.removeChannel(channel);
    };
  }, [available, profile?.id, refresh]);

  const loadMore = useCallback(async (page: PageName) => {
    if (!available || !supabase || loadingMore || !hasMore[page]) return;
    const offsets: Record<PageName, number> = {
      users: users.length,
      institutions: institutions.length,
      releases: releases.length,
      activity: activity.length,
      audit: audit.length,
    };
    const rpcNames: Record<PageName, string> = {
      users: "admin_list_users",
      institutions: "admin_list_institutions",
      releases: "admin_list_releases",
      activity: "admin_list_activity",
      audit: "admin_list_audit",
    };
    setLoadingMore(page);
    const result = await supabase.rpc(rpcNames[page], { p_limit: PAGE_SIZE, p_offset: offsets[page] });
    setLoadingMore(null);
    if (result.error) {
      setError("The next administration page couldn't be loaded.");
      return;
    }
    const rows = (result.data as unknown[] | null) ?? [];
    setHasMore((current) => ({ ...current, [page]: rows.length === PAGE_SIZE }));
    if (page === "users") setUsers((current) => appendUnique(current, rows as AdminUser[], (row) => row.user_id));
    if (page === "institutions") setInstitutions((current) => appendUnique(current, rows as AdminInstitution[], (row) => row.owner_id));
    if (page === "releases") setReleases((current) => appendUnique(current, rows as AdminRelease[], (row) => row.release_id));
    if (page === "activity") setActivity((current) => appendUnique(current, rows as AdminActivityEvent[], (row) => row.event_id));
    if (page === "audit") setAudit((current) => appendUnique(current, rows as AdminAuditEvent[], (row) => row.audit_id));
  }, [activity.length, audit.length, available, hasMore, institutions.length, loadingMore, releases.length, users.length]);

  const setAccountStatus = useCallback(async (target: string, status: AccountStatus, reason: string) => {
    if (!available || !supabase) return { ok: false, result: "forbidden" };
    const { data, error: actionError } = await supabase.rpc("admin_set_account_status", {
      p_target: target,
      p_status: status,
      p_reason: reason,
    });
    const result = String(data ?? "error");
    if (!actionError && result === "ok") await refresh();
    return { ok: !actionError && result === "ok", result: actionError ? "error" : result };
  }, [available, refresh]);

  const setReleaseModeration = useCallback(async (releaseId: string, status: PostModerationStatus, reason: string) => {
    if (!available || !supabase) return { ok: false, result: "forbidden" };
    const { data, error: actionError } = await supabase.rpc("admin_set_release_moderation", {
      p_release: releaseId,
      p_status: status,
      p_reason: reason,
    });
    const result = String(data ?? "error");
    if (!actionError && result === "ok") await refresh();
    return { ok: !actionError && result === "ok", result: actionError ? "error" : result };
  }, [available, refresh]);

  const setInstitutionVerification = useCallback(async (target: string, approved: boolean) => {
    if (!available || !supabase) return false;
    const { data, error: actionError } = await supabase.rpc(approved ? "approve_institution" : "reject_institution", { target });
    const ok = !actionError && String(data) === "ok";
    if (ok) await refresh();
    return ok;
  }, [available, refresh]);

  const createInstitutionInvite = useCallback(async (email: string, orgName: string) => {
    if (!available || !supabase) return { token: null, error: "Admin access unavailable." };
    const { data, error: actionError } = await supabase.rpc("create_platform_invite", {
      p_email: email,
      p_org_name: orgName,
    });
    if (actionError) {
      // The RPC raises human-readable messages ("An active institution invite
      // already exists for this email.", "Invalid email address.") — show them
      // instead of a generic failure so the admin knows what to change.
      const message = actionError.message?.trim();
      if (message && /forbidden/i.test(message)) {
        return { token: null, error: "Your account doesn't have platform admin access. Grant is_admin in the database first." };
      }
      return { token: null, error: message || "The invitation couldn't be created." };
    }
    if (typeof data !== "string" || !data) {
      return { token: null, error: "The invitation couldn't be created. Check that the latest migrations are applied and your account has platform admin access." };
    }
    await refresh();
    return { token: data, error: null };
  }, [available, refresh]);

  const revokeInstitutionInvite = useCallback(async (id: string) => {
    if (!available || !supabase) return false;
    const { data, error: actionError } = await supabase.rpc("revoke_platform_invite", { p_id: id });
    const ok = !actionError && String(data) === "ok";
    if (ok) await refresh();
    return ok;
  }, [available, refresh]);

  return {
    available,
    users,
    institutions,
    releases,
    activity,
    audit,
    pendingInstitutions,
    invites,
    hasMore,
    loading,
    loadingMore,
    error,
    refresh,
    loadMore,
    setAccountStatus,
    setReleaseModeration,
    setInstitutionVerification,
    createInstitutionInvite,
    revokeInstitutionInvite,
  };
}

