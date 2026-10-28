import { useState, type ReactNode } from "react";
import { LogOut, Moon, ShieldCheck, Sun } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Logo } from "@/components/brand/Logo";
import { Avatar } from "@/components/brand/Avatar";
import { useAuth } from "@/auth/AuthProvider";
import { useTheme } from "@/lib/useTheme";

/** Standalone platform-supervision frame. It deliberately has no product or organisation navigation. */
export function AdminShell({ children, maxWidth = 1320 }: { children: ReactNode; maxWidth?: number }) {
  const { profile, user, signOut } = useAuth();
  const { resolvedTheme, toggle } = useTheme();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const adminName = profile?.full_name?.trim() || user?.email?.split("@")[0] || "Administrator";

  const logout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      navigate("/admin/login", { replace: true });
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="pp-app-min pp-app-shell pp-admin-shell" data-theme={resolvedTheme}>
      <header className="pp-admin-topbar">
        <div className="pp-admin-brand">
          <Logo size={19} to="/admin" />
          <span className="pp-admin-brand-rule" aria-hidden />
          <span className="pp-admin-brand-mark"><ShieldCheck size={17} /></span>
          <span className="pp-admin-brand-copy">
            <strong>Platform Control</strong>
            <small>Global supervision</small>
          </span>
        </div>

        <div className="pp-admin-account">
          <span className="pp-admin-secure"><span aria-hidden /> Secured console</span>
          <button
            type="button"
            className="pp-shell-icon-btn"
            onClick={toggle}
            aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme`}
            title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme`}
          >
            {resolvedTheme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <div className="pp-admin-identity">
            <Avatar name={adminName} size={30} />
            <span><strong>{adminName}</strong><small>Global super admin</small></span>
          </div>
          <button type="button" className="pp-btn pp-btn-outline pp-admin-signout" onClick={() => void logout()} disabled={signingOut}>
            <LogOut size={15} /> <span>{signingOut ? "Signing out…" : "Sign out"}</span>
          </button>
        </div>
      </header>

      <main className="pp-admin-main">
        <div className="pp-admin-content" style={{ maxWidth }}>{children}</div>
      </main>
    </div>
  );
}
