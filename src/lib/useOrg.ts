import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";

export type OrgRole = "owner" | "admin" | "editor" | "viewer";

export interface OrgMember {
  user_id: string;
  role: OrgRole;
  status: "pending" | "active" | "declined";
  email: string;
  full_name: string | null;
  created_at: string;
}

export interface OrgInvite {
  id: string;
  email: string;
  role: OrgRole;
  token: string | null;
  status: string;
  created_at: string;
}

export function useOrg() {
  const { profile, user } = useAuth();
  const slug = profile?.institution_slug ?? null;
  const available = isSupabaseConfigured && !!supabase && profile?.role === "institution" && !!slug;

  const [members, setMembers] = useState<OrgMember[]>([]);
  const [invites, setInvites] = useState<OrgInvite[]>([]);
  const [verified, setVerified] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshId = useRef(0);

  const me = members.find((m) => m.user_id === user?.id) ?? null;
  const role: OrgRole | null = me?.role ?? null;
  const status = me?.status ?? null;
  const active = status === "active";

  const can = {
    publish: active && (role === "owner" || role === "admin" || role === "editor"),
    invite: active && (role === "owner" || role === "admin"),
    approve: active && role === "owner",
    manage: active && (role === "owner" || role === "admin"),
  };

  const refresh = useCallback(async () => {
    const requestId = ++refreshId.current;
    if (!available || !supabase || !slug) {
      setMembers([]);
      setInvites([]);
      setVerified(false);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const [memberResult, verificationResult, inviteResult] = await Promise.all([
      supabase.rpc("org_members_detail", { slug }),
      supabase.rpc("org_is_verified", { slug }),
      supabase.rpc("list_org_invites", { p_slug: slug }),
    ]);

    if (requestId !== refreshId.current) return;

    const firstError = memberResult.error ?? verificationResult.error ?? inviteResult.error;
    if (firstError) {
      setMembers([]);
      setInvites([]);
      setVerified(false);
      setError("We couldn't load your organisation access. Try again.");
      setLoading(false);
      return;
    }

    setMembers((memberResult.data as OrgMember[] | null) ?? []);
    setVerified(verificationResult.data === true);
    setInvites((inviteResult.data as OrgInvite[] | null) ?? []);
    setLoading(false);
  }, [available, slug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createInvite = async (email: string, inviteRole: OrgRole): Promise<OrgInvite | null> => {
    if (!supabase || !slug || !user) return null;
    setError(null);
    const { data, error: inviteError } = await supabase.rpc("create_org_invite", {
      p_slug: slug,
      p_email: email.trim().toLowerCase(),
      p_role: inviteRole,
    });
    if (inviteError) {
      setError(inviteError.message.includes("Seat limit")
        ? "This organisation has reached its seat limit."
        : "We couldn't create that invite. Check the address and try again.");
      return null;
    }
    const invite = (Array.isArray(data) ? data[0] : data) as OrgInvite | null;
    await refresh();
    return invite ?? null;
  };

  const revokeInvite = async (id: string): Promise<boolean> => {
    if (!supabase) return false;
    const { data, error: revokeError } = await supabase.rpc("revoke_org_invite", { p_id: id });
    if (revokeError || data !== "ok") {
      setError("We couldn't revoke that invite. Refresh and try again.");
      return false;
    }
    await refresh();
    return true;
  };

  const approve = async (target: string): Promise<boolean> => {
    if (!supabase || !slug) return false;
    const { data, error: approveError } = await supabase.rpc("set_member_status", { slug, target, new_status: "active" });
    if (approveError || data !== "ok") {
      setError(data === "seat_limit"
        ? "This organisation has reached its five-seat limit. Revoke an invite or remove a member first."
        : "We couldn't approve that member. Refresh and try again.");
      return false;
    }
    await refresh();
    return true;
  };

  const decline = async (target: string): Promise<boolean> => {
    if (!supabase || !slug) return false;
    const { data, error: declineError } = await supabase.rpc("set_member_status", { slug, target, new_status: "declined" });
    if (declineError || data !== "ok") {
      setError("We couldn't decline that member. Refresh and try again.");
      return false;
    }
    await refresh();
    return true;
  };

  const setRole = async (target: string, newRole: OrgRole): Promise<boolean> => {
    if (!supabase || !slug) return false;
    const { data, error: roleError } = await supabase.rpc("set_member_role", { slug, target, new_role: newRole });
    if (roleError || data !== "ok") {
      setError("We couldn't change that member's role. Refresh and try again.");
      return false;
    }
    await refresh();
    return true;
  };

  const activeMembers = members.filter((m) => m.status === "active");
  const pendingMembers = members.filter((m) => m.status === "pending");

  // 5-seat plan. Owner + active + pending invites all consume a seat.
  const SEAT_LIMIT = 5;
  const seatsUsed = members.filter((m) => m.status !== "declined").length + invites.length;
  const seatsLeft = Math.max(0, SEAT_LIMIT - seatsUsed);

  // Publishing additionally requires the org to have verified its domain.
  const canPublishNow = can.publish && verified;

  return { slug, role, status, active, verified, can, canPublishNow, members, activeMembers, pendingMembers, invites, loading, error, available, refresh, createInvite, revokeInvite, approve, decline, setRole, seatLimit: SEAT_LIMIT, seatsUsed, seatsLeft };
}
