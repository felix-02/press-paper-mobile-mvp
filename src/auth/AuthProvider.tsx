import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAppStore } from "@/store/useAppStore";
import { identifyUser, resetAnalytics, track } from "@/lib/analytics";

export type Role = "individual" | "institution";
export type AccountStatus = "active" | "archived" | "banned";

export interface Profile {
  id: string;
  role: Role;
  full_name: string | null;
  institution_slug: string | null;
  institution_name: string | null;
  bio?: string | null;
  verification_status?: "unverified" | "pending" | "verified" | "rejected";
  verification_domain?: string | null;
  verified_at?: string | null;
  is_admin?: boolean;
  onboarding_complete?: boolean;
  org_website?: string | null;
  org_location?: string | null;
  org_description?: string | null;
  org_category?: string | null;
  avatar_url?: string | null;
  account_status?: AccountStatus;
  status_reason?: string | null;
  status_changed_at?: string | null;
}

interface SignUpArgs {
  email: string;
  password: string;
  role: Role;
  fullName: string;
  emailRedirectTo?: string;
}

interface AuthValue {
  /** true when Supabase env vars are present (LIVE mode). */
  configured: boolean;
  /** true once the initial session check has finished. */
  ready: boolean;
  user: User | null;
  profile: Profile | null;
  profileReady: boolean;
  profileError: string | null;
  role: Role | null;
  signUp: (args: SignUpArgs) => Promise<{ error: string | null; needsConfirmation: boolean; role: Role | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null; role: Role | null; isAdmin: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

async function fetchRole(userId: string): Promise<{ role: Role | null; error: string | null; isAdmin: boolean }> {
  if (!supabase) return { role: null, error: "Supabase is not configured.", isAdmin: false };
  const { data, error } = await supabase.from("profiles").select("role, is_admin, account_status").eq("id", userId).maybeSingle();
  if (error) return { role: null, error: "We couldn't load your account profile. Try again.", isAdmin: false };
  if (!data?.role) return { role: null, error: "Your account profile is missing. Contact support before trying again.", isAdmin: false };
  const status = (data.account_status as AccountStatus | null) ?? "active";
  if (status !== "active") {
    return {
      role: null,
      isAdmin: false,
      error: status === "banned"
        ? "This account has been suspended by a platform administrator."
        : "This account is archived. Contact support if it should be restored.",
    };
  }
  return { role: data.role as Role, error: null, isAdmin: data.is_admin === true };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Tests run without a client; every runtime environment waits for Supabase.
  const [ready, setReady] = useState(!isSupabaseConfigured);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileReady, setProfileReady] = useState(!isSupabaseConfigured);
  const [profileError, setProfileError] = useState<string | null>(null);
  const profileRequest = useRef(0);

  // Initial session + auth state subscription.
  useEffect(() => {
    if (!supabase) return;
    let active = true;

    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      if (!active) return;
      setUser(data.session?.user ?? null);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const loadProfile = useCallback(async (uid: string) => {
    if (!supabase) return;
    const request = ++profileRequest.current;
    setProfileReady(false);
    setProfileError(null);
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, role, full_name, institution_slug, institution_name, bio, verification_status, verification_domain, verified_at, is_admin, onboarding_complete, org_website, org_location, org_description, org_category, avatar_url, account_status, status_reason, status_changed_at"
      )
      .eq("id", uid)
      .maybeSingle();
    if (request !== profileRequest.current) return;
    if (error) {
      setProfile(null);
      setProfileError("We couldn't load your account profile. Check your connection and try again.");
      setProfileReady(true);
      return;
    }
    const p = (data as Profile) ?? null;
    setProfile(p);
    setProfileError(p ? null : "Your account profile is missing. Contact support before continuing.");
    setProfileReady(true);
    if (p) identifyUser(p.id, { role: p.role });
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user.id);
  }, [user, loadProfile]);

  // Load the profile (role + institution) whenever the user changes.
  useEffect(() => {
    if (!supabase || !user) {
      profileRequest.current += 1;
      setProfile(null);
      setProfileError(null);
      setProfileReady(true);
      return;
    }
    setProfile(null);
    void loadProfile(user.id);
  }, [user, loadProfile]);

  // Reflect administrator moderation while the affected account is online.
  // Database policies enforce the block immediately; realtime updates the UI.
  useEffect(() => {
    if (!supabase || !user) return;
    const client = supabase;
    const channel = client
      .channel(`profile-status:${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
        () => void loadProfile(user.id)
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [user, loadProfile]);

  // Hydrate the in-memory store (saved + followed) from the database so the rest
  // of the app — which reads the store — reflects this user's real data.
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const store = useAppStore.getState();
    if (!user) {
      store.setUserId(null);
      store.hydrate({ saved: [], followed: [] });
      store.setWatchlistData([], {});
      return;
    }
    let active = true;
    store.setUserId(user.id);
    store.hydrate({ saved: [], followed: [] });
    store.setWatchlistData([], {});
    Promise.all([
      supabase.from("saved_releases").select("release_id").eq("user_id", user.id),
      supabase.from("follows").select("institution_slug").eq("follower", user.id),
    ]).then(([s, f]) => {
      if (!active || useAppStore.getState().userId !== user.id) return;
      if (s.error || f.error) {
        useAppStore.getState().pushToast({ title: "Couldn't load your saved items", description: "Refresh the page to try again.", variant: "error" });
        return;
      }
      const saved = ((s.data as { release_id: string }[] | null) ?? []).map((r) => r.release_id);
      const followed = ((f.data as { institution_slug: string }[] | null) ?? []).map((r) => r.institution_slug);
      useAppStore.getState().hydrate({ saved, followed });
    });
    return () => {
      active = false;
    };
  }, [user]);

  const signUp: AuthValue["signUp"] = async ({ email, password, role, fullName, emailRedirectTo }) => {
    if (!supabase) return { error: "Supabase is not configured.", needsConfirmation: false, role: null };
    if (role !== "individual") {
      return { error: "Institution accounts require an invitation.", needsConfirmation: false, role: null };
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { role: "individual", full_name: fullName },
        emailRedirectTo,
      },
    });
    if (error) return { error: "We couldn't create the account. Check the details and try again.", needsConfirmation: false, role: null };

    // Preserve Supabase's enumeration protection by returning the same outcome
    // for existing and newly registered addresses.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return { error: null, needsConfirmation: true, role };
    }

    // If email confirmation is enabled, there is no session yet.
    const needsConfirmation = !data.session;
    track("signed_up", { role });
    return { error: null, needsConfirmation, role };
  };

  const signIn: AuthValue["signIn"] = async (email, password) => {
    if (!supabase) return { error: "Supabase is not configured.", role: null, isAdmin: false };
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: "The email or password is incorrect, or the account is not ready yet.", role: null, isAdmin: false };
    const result = data.user ? await fetchRole(data.user.id) : { role: null, error: "Sign-in did not return a user.", isAdmin: false };
    if (result.error) {
      await supabase.auth.signOut();
      return { error: result.error, role: null, isAdmin: false };
    }
    track("logged_in", { role: result.role });
    return { error: null, role: result.role, isAdmin: result.isAdmin };
  };

  const signOut: AuthValue["signOut"] = async () => {
    track("logged_out", { role: profile?.role ?? null });
    if (supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) await supabase.auth.signOut({ scope: "local" });
    }
    useAppStore.getState().reset();
    setUser(null);
    setProfile(null);
    setProfileError(null);
    setProfileReady(true);
    resetAnalytics();
  };

  const value: AuthValue = {
    configured: isSupabaseConfigured,
    ready,
    user,
    profile,
    profileReady,
    profileError,
    role: profile?.role ?? null,
    signUp,
    signIn,
    signOut,
    refreshProfile,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within <AuthProvider>");
  return v;
}
