import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Building2, ShieldCheck, AlertCircle, Clock } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { useAuth } from "@/auth/AuthProvider";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAppStore } from "@/store/useAppStore";
import { withNext } from "@/lib/redirect";

interface InviteInfo {
  institution_slug: string;
  email: string;
  role: string;
  org_name: string;
  status: string;
}

export function JoinOrg() {
  const { token = "" } = useParams();
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const pushToast = useAppStore((s) => s.pushToast);

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }
    let active = true;
    supabase.rpc("get_invite", { invite_token: token }).then(({ data, error: lookupError }) => {
      if (!active) return;
      if (lookupError) {
        setError("We couldn't load this invitation. Check your connection and try again.");
        setLoading(false);
        return;
      }
      const row = (data as InviteInfo[] | null)?.[0] ?? null;
      setInvite(row);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [token]);

  const accept = async () => {
    if (!supabase) return;
    setAccepting(true);
    setError(null);
    const { data, error: acceptError } = await supabase.rpc("accept_org_invite", { invite_token: token });
    setAccepting(false);
    if (acceptError) {
      setError("We couldn't accept this invitation. Please try again.");
      return;
    }
    const result = String(data ?? "error");
    if (result === "ok") {
      await refreshProfile();
      pushToast({ title: "Invite accepted", description: "Awaiting owner approval.", variant: "success" });
      navigate("/inst/team", { replace: true });
    } else if (result === "already_member") {
      await refreshProfile();
      navigate("/inst/team", { replace: true });
    } else if (result === "email_mismatch") {
      setError(`This invite is for ${invite?.email}. Sign in with the invited address to accept.`);
    } else if (result === "email_unconfirmed") {
      setError("Confirm your email address first, then try again.");
    } else if (result === "account_conflict") {
      setError("This account already belongs to another organisation. Use a separate account for this invitation.");
    } else if (result === "seat_limit") {
      setError("This organisation has no seats available. Ask its owner to free a seat.");
    } else if (result === "unauthenticated") {
      setError("Please sign in first.");
    } else {
      setError("This invite is no longer valid.");
    }
  };

  const Frame = ({ children }: { children: React.ReactNode }) => (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      <header style={{ padding: "18px 26px", borderBottom: "1px solid var(--border)" }}>
        <Logo />
      </header>
      <div style={{ flex: 1, display: "grid", placeItems: "center", padding: 24 }}>
        <div className="pp-card" style={{ width: "100%", maxWidth: 460, padding: 28, textAlign: "center" }}>
          {children}
        </div>
      </div>
    </div>
  );

  if (loading) return <Frame><div style={{ color: "var(--text-muted)" }}>Loading invite…</div></Frame>;

  if (!invite || invite.status !== "pending") {
    return (
      <Frame>
        <AlertCircle size={34} color="var(--text-muted)" style={{ marginBottom: 12 }} />
        <h1 style={{ fontSize: 19, fontWeight: 700, marginBottom: 8 }}>Invite unavailable</h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
          {error ?? (invite?.status === "accepted" ? "This invite has already been used." : invite?.status === "expired" ? "This invitation has expired." : "This invite link is invalid or has been revoked.")}
        </p>
        <Link to="/" className="pp-btn pp-btn-ghost" style={{ marginTop: 18, display: "inline-flex" }}>Back to home</Link>
      </Frame>
    );
  }

  return (
    <Frame>
      <span style={{ width: 52, height: 52, borderRadius: 14, background: "var(--surface-2)", display: "grid", placeItems: "center", margin: "0 auto 14px" }}>
        <Building2 size={26} color="var(--text-secondary)" />
      </span>
      <h1 style={{ fontSize: 21, fontWeight: 700, letterSpacing: "0" }}>Join {invite.org_name}</h1>
      <p style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 8 }}>
        You've been invited to join <strong>{invite.org_name}</strong> as <strong>{invite.role}</strong>.
      </p>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 14, fontSize: 12.5, color: "var(--text-muted)", background: "var(--surface-2)", padding: "6px 12px", borderRadius: "var(--r-pill)" }}>
        <ShieldCheck size={14} /> Invitation for {invite.email}
      </div>

      {error && (
        <div style={{ marginTop: 16, padding: "10px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "var(--r-md)", fontSize: 13, color: "var(--text)" }}>
          {error}
        </div>
      )}

      {user ? (
        <>
          <button type="button" onClick={accept} disabled={accepting} className="pp-btn pp-btn-primary" style={{ width: "100%", marginTop: 18, justifyContent: "center", opacity: accepting ? 0.7 : 1 }}>
            {accepting ? "Accepting…" : "Accept invitation"}
          </button>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Clock size={12} /> The owner will approve your access after you accept.
          </p>
        </>
      ) : (
        <>
          <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginTop: 18 }}>
            Sign in or create an account with the invited address <strong>{invite.email}</strong> to accept.
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <Link to={withNext("/login", `/join/${encodeURIComponent(token)}`)} className="pp-btn pp-btn-outline" style={{ flex: 1, justifyContent: "center" }}>Log in</Link>
            <Link to={withNext("/signup", `/join/${encodeURIComponent(token)}`)} className="pp-btn pp-btn-primary" style={{ flex: 1, justifyContent: "center" }}>Sign up</Link>
          </div>
        </>
      )}
    </Frame>
  );
}
