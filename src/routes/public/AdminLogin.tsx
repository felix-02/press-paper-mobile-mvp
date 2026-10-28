import { useEffect, useState } from "react";
import { ArrowRight, AlertCircle, KeyRound, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Logo } from "@/components/brand/Logo";
import { GlobeArt } from "@/components/brand/Illustrations";
import { useAuth } from "@/auth/AuthProvider";
import { usePageTitle } from "@/lib/usePageTitle";

export function AdminLogin() {
  usePageTitle("Admin sign in");
  const { ready, user, profile, profileReady, signIn, signOut } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (ready && profileReady && user && profile?.is_admin) navigate("/admin", { replace: true });
  }, [ready, profileReady, user, profile, navigate]);

  const submit = async () => {
    if (loading) return;
    setError(null);
    const address = email.trim();
    if (!address || address.length > 320 || !password || password.length > 128) {
      setError("Enter your administrator email and password.");
      return;
    }
    setLoading(true);
    const result = await signIn(address, password);
    if (result.error) {
      setLoading(false);
      setError(result.error);
      return;
    }
    if (!result.isAdmin) {
      await signOut();
      setLoading(false);
      setError("This account does not have global platform administrator access.");
      return;
    }
    navigate("/admin", { replace: true });
  };

  const signedInWithoutAdmin = ready && profileReady && !!user && !!profile && !profile.is_admin;

  return (
    <div className="pp-admin-login-page">
      <div className="pp-admin-login-globe pp-admin-login-globe-left"><GlobeArt size={500} /></div>
      <div className="pp-admin-login-globe pp-admin-login-globe-right"><GlobeArt size={420} /></div>
      <div className="pp-admin-login-logo"><Logo size={20} to="/" /></div>

      <main className="pp-admin-login-card">
        <div className="pp-admin-login-emblem"><ShieldCheck size={24} /></div>
        <div className="pp-admin-login-kicker">Restricted platform access</div>
        <h1>Platform Control</h1>
        <p>Global supervision for Presspaper accounts, institutions, posts, and audit activity.</p>

        {error && <div className="pp-admin-login-alert" role="alert"><AlertCircle size={15} /> {error}</div>}

        {signedInWithoutAdmin ? (
          <div className="pp-admin-login-existing">
            <KeyRound size={20} />
            <strong>This signed-in account is not a global administrator.</strong>
            <span>Use a separately authorized platform account to continue.</span>
            <button type="button" className="pp-btn pp-btn-primary" onClick={() => void signOut()}>Use another account</button>
          </div>
        ) : (
          <>
            <div className="pp-admin-login-fields">
              <label>
                <span>Administrator email</span>
                <input className="pp-input" type="email" autoComplete="username" maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void submit()} placeholder="admin@example.org" />
              </label>
              <label>
                <span>Password</span>
                <input className="pp-input" type="password" autoComplete="current-password" maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void submit()} placeholder="Enter your password" />
              </label>
            </div>
            <button type="button" className="pp-btn pp-btn-primary pp-admin-login-submit" onClick={() => void submit()} disabled={loading}>
              {loading ? "Verifying access…" : "Enter Platform Control"} <ArrowRight size={16} />
            </button>
          </>
        )}

        <div className="pp-admin-login-footnote"><ShieldCheck size={13} /> Access is independently verified by server-side policy.</div>
      </main>
    </div>
  );
}
