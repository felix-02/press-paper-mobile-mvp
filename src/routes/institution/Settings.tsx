import { useState } from "react";
import { Settings as SettingsIcon, LogOut, Building2, Monitor, Moon, Sun } from "lucide-react";
import { AppShell } from "@/components/shells/AppShell";
import { useAuth } from "@/auth/AuthProvider";
import { useNavigate } from "react-router-dom";
import { useTheme, type ThemePreference } from "@/lib/useTheme";
import { usePageTitle } from "@/lib/usePageTitle";

const THEME_OPTIONS: { value: ThemePreference; label: string; description: string; icon: typeof Monitor }[] = [
  { value: "system", label: "System", description: "Match this device", icon: Monitor },
  { value: "light", label: "Light", description: "Bright workspace", icon: Sun },
  { value: "dark", label: "Dark", description: "Low-light workspace", icon: Moon },
];

export function InstitutionSettings() {
  usePageTitle("Settings");
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();
  const { preference, setPreference } = useTheme();
  const [signingOut, setSigningOut] = useState(false);

  const logout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      navigate("/", { replace: true });
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <AppShell kind="institution" maxWidth={720}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
        <span style={{ width: 44, height: 44, borderRadius: 12, background: "var(--surface-2)", display: "grid", placeItems: "center" }}>
          <SettingsIcon size={22} color="var(--text-secondary)" />
        </span>
        <h1 style={{ fontSize: 25, fontWeight: 700, letterSpacing: "0" }}>Settings</h1>
      </div>

      <section className="pp-card" style={{ padding: 22, marginBottom: 16 }}>
        <h2 style={{ fontSize: 15.5, fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <Building2 size={17} /> Organisation
        </h2>
        <label style={{ display: "block", fontSize: 13, color: "var(--text-secondary)", marginBottom: 6 }}>Organisation name</label>
        <input className="pp-input" value={profile?.institution_name ?? ""} readOnly style={{ color: "var(--text-secondary)", background: "var(--surface-2)" }} />
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 8 }}>The verified name is fixed to the platform-issued invitation. Contact a platform administrator to change it.</p>
      </section>

      <section className="pp-card" style={{ padding: 22, marginBottom: 16 }}>
        <h2 id="appearance-heading" style={{ fontSize: 15.5, fontWeight: 700, marginBottom: 6 }}>Appearance</h2>
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 16 }}>
          Choose how the Presspaper workspace looks on this device.
        </p>
        <div className="pp-theme-options" role="radiogroup" aria-labelledby="appearance-heading">
          {THEME_OPTIONS.map(({ value, label, description, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={preference === value}
              className="pp-theme-option"
              onClick={() => setPreference(value)}
            >
              <Icon size={18} />
              <span>
                <strong>{label}</strong>
                <small>{description}</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="pp-card" style={{ padding: 22, marginBottom: 16 }}>
        <h2 style={{ fontSize: 15.5, fontWeight: 700, marginBottom: 14 }}>Account</h2>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", rowGap: 10, columnGap: 18, fontSize: 14 }}>
          <span style={{ color: "var(--text-muted)", fontSize: 13 }}>Signed in as</span>
          <span>{user?.email ?? "Unavailable"}</span>
          <span style={{ color: "var(--text-muted)", fontSize: 13 }}>Account type</span>
          <span>Institution</span>
        </div>
        <div className="pp-settings-signout">
          <span>
            <strong>Sign out of Presspaper</strong>
            <small>You’ll return to the public homepage.</small>
          </span>
          <button type="button" className="pp-btn pp-btn-outline" disabled={signingOut} onClick={() => void logout()}>
            <LogOut size={15} /> {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </section>
    </AppShell>
  );
}
