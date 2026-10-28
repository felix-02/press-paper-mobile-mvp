import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, KeyRound } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";
import { usePageTitle } from "@/lib/usePageTitle";

export function ResetPassword() {
  usePageTitle("Reset password");
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError(null);
    if (password.length < 8 || password.length > 128) {
      setError("Use a password between 8 and 128 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The passwords do not match.");
      return;
    }
    if (!supabase) {
      setError("Password recovery is not configured.");
      return;
    }
    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      setError("This recovery link is invalid or has expired. Request a new one.");
      return;
    }
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <div style={{ minHeight: "100vh", background: "#000", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ position: "absolute", top: 28, left: 28 }}><Logo size={20} to="/" /></div>
      <div className="pp-card" style={{ width: "100%", maxWidth: 420, padding: 32 }}>
        <span style={{ width: 48, height: 48, display: "grid", placeItems: "center", borderRadius: 8, background: "var(--surface-2)", margin: "0 auto 16px" }}><KeyRound size={22} /></span>
        <h1 style={{ fontSize: 24, fontWeight: 700, textAlign: "center" }}>Set a new password</h1>
        <p style={{ marginTop: 8, color: "var(--text-secondary)", fontSize: 14, textAlign: "center" }}>Choose a new password for your Presspaper account.</p>

        {error && (
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 18, padding: "10px 12px", color: "var(--red)", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: "var(--r-sm)", fontSize: 13 }}>
            <AlertCircle size={15} /> {error}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 22 }}>
          <label><span style={{ display: "block", fontSize: 13, color: "var(--text-secondary)", marginBottom: 6 }}>New password</span><input className="pp-input" type="password" autoComplete="new-password" maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void submit()} autoFocus /></label>
          <label><span style={{ display: "block", fontSize: 13, color: "var(--text-secondary)", marginBottom: 6 }}>Confirm password</span><input className="pp-input" type="password" autoComplete="new-password" maxLength={128} value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void submit()} /></label>
        </div>
        <button type="button" className="pp-btn pp-btn-primary" disabled={saving} onClick={() => void submit()} style={{ width: "100%", marginTop: 22, padding: 12, opacity: saving ? 0.7 : 1 }}>
          {saving ? "Updating…" : "Update password"} <ArrowRight size={16} />
        </button>
        <p style={{ textAlign: "center", marginTop: 18, fontSize: 13 }}><Link to="/login" style={{ color: "var(--blue)" }}>Back to log in</Link></p>
      </div>
    </div>
  );
}
