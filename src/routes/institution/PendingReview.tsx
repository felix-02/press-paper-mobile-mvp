import { useState } from "react";
import { Clock, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { useAuth } from "@/auth/AuthProvider";
import { usePageTitle } from "@/lib/usePageTitle";

/**
 * Holding screen for institution accounts that accepted an invite but have
 * not been approved by a platform administrator yet. Until approval, the
 * organisation workspace is completely inaccessible.
 */
export function PendingReview({ onRefresh }: { onRefresh?: () => Promise<void> | void }) {
  usePageTitle("Account under review");
  const { profile, user, signOut } = useAuth();
  const [checking, setChecking] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const checkAgain = async () => {
    if (checking) return;
    setChecking(true);
    try {
      await onRefresh?.();
    } finally {
      setChecking(false);
    }
  };

  const logout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 26px", borderBottom: "1px solid var(--border)" }}>
        <Logo />
        <button type="button" onClick={() => void logout()} disabled={signingOut} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: "var(--text-muted)" }}>
          <LogOut size={14} /> {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </header>

      <div style={{ flex: 1, display: "grid", placeItems: "center", padding: 24 }}>
        <div className="pp-card pp-rise" style={{ width: "100%", maxWidth: 480, padding: 32, textAlign: "center" }}>
          <span style={{ width: 56, height: 56, borderRadius: 16, background: "rgba(245,158,11,0.12)", display: "grid", placeItems: "center", margin: "0 auto 18px" }}>
            <Clock size={26} color="var(--amber)" />
          </span>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "0" }}>Your account is under review</h1>
          <p style={{ fontSize: 14.5, color: "var(--text-secondary)", lineHeight: 1.65, marginTop: 12 }}>
            Thanks for setting up <strong style={{ color: "var(--text)" }}>{profile?.institution_name || "your organisation"}</strong>.
            The Presspaper team will run through your account and grant you access soon.
          </p>
          <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, marginTop: 10 }}>
            You'll be able to enter the publishing workspace as soon as a platform administrator approves the organisation.
            We review every institution to keep the platform impersonation-free.
          </p>

          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 18, fontSize: 12.5, color: "var(--text-muted)", background: "var(--surface-2)", padding: "6px 12px", borderRadius: "var(--r-pill)" }}>
            <ShieldCheck size={14} /> Signed in as {user?.email ?? "your invited email"}
          </div>

          <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 22 }}>
            <button type="button" className="pp-btn pp-btn-primary" onClick={() => void checkAgain()} disabled={checking}>
              <RefreshCw size={15} style={checking ? { animation: "pp-spin 0.8s linear infinite" } : undefined} />
              {checking ? "Checking…" : "Check approval status"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
