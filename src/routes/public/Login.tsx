import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, AlertCircle, MailCheck } from "lucide-react";
import { AuthLayout, AuthField, PasswordField } from "@/components/shells/AuthLayout";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/lib/supabase";
import { safeRedirectTarget } from "@/lib/redirect";
import { usePageTitle } from "@/lib/usePageTitle";

export function Login() {
  usePageTitle("Log in");
  const { ready, user, profile, profileReady, signIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeRedirectTarget(params.get("next"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    if (!ready || !profileReady || !user || !profile) return;
    navigate(next ?? (profile.is_admin ? "/admin" : profile.role === "institution" ? "/inst" : "/home"), { replace: true });
  }, [ready, profileReady, user, profile, next, navigate]);

  // LIVE: real Supabase sign-in.
  const submit = async () => {
    if (loading) return;
    setError(null);
    if (!email.trim() || email.trim().length > 320 || !password || password.length > 128) {
      setError("Enter your email and password.");
      return;
    }
    setLoading(true);
    const { error: err, role, isAdmin } = await signIn(email.trim(), password);
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    navigate(next ?? (isAdmin ? "/admin" : role === "institution" ? "/inst" : "/home"), { replace: true });
  };

  const requestReset = async () => {
    const address = email.trim();
    setError(null);
    setResetSent(false);
    if (!address || address.length > 320) {
      setError("Enter your email address first.");
      return;
    }
    if (!supabase) return;
    setResetting(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(address, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetting(false);
    if (resetError) {
      setError("We couldn't send the reset email. Please try again.");
      return;
    }
    setResetSent(true);
  };

  return (
    <AuthLayout
      headline={<>Welcome back to<br />trusted information.</>}
      sub="Official releases, AI summaries and your watchlists — right where you left them."
    >
      <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "0" }}>Welcome back</h1>
      <p style={{ fontSize: 14.5, color: "var(--text-secondary)", marginTop: 8 }}>Log in to your Presspaper account.</p>

      {error && (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            fontSize: 13,
            color: "var(--red)",
            background: "rgba(248,113,113,0.1)",
            border: "1px solid rgba(248,113,113,0.25)",
            borderRadius: "var(--r-sm)",
            padding: "10px 12px",
            marginTop: 18,
          }}
        >
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {resetSent && (
        <div role="status" style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: "var(--green)", background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.25)", borderRadius: "var(--r-sm)", padding: "10px 12px", marginTop: 18 }}>
          <MailCheck size={15} /> If an account exists for that address, a reset link is on its way.
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 22 }}>
          <AuthField label="Email" type="email" autoComplete="email" maxLength={320} placeholder="you@example.com" value={email} onChange={setEmail} autoFocus />
          <PasswordField
            placeholder="Enter your password"
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
            labelEnd={
              <button type="button" onClick={() => void requestReset()} disabled={resetting} style={{ fontSize: 12.5, color: "var(--blue)", opacity: resetting ? 0.7 : 1 }}>
                {resetting ? "Sending…" : "Forgot password?"}
              </button>
            }
          />
        </div>

        <button type="submit" className="pp-btn pp-btn-primary" style={{ width: "100%", marginTop: 22, padding: "12px" }} disabled={loading}>
          {loading ? "Logging in…" : "Log in"} <ArrowRight size={16} />
        </button>
      </form>

      <p style={{ fontSize: 13.5, color: "var(--text-muted)", textAlign: "center", marginTop: 20 }}>
        New to Presspaper?{" "}
        <Link to={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"} style={{ color: "var(--blue)", fontWeight: 500 }}>
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}
