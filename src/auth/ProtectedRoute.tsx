import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth, type Role } from "./AuthProvider";
import { withNext } from "@/lib/redirect";

function FullScreenLoader() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg)" }}>
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 999,
          border: "3px solid var(--surface-3)",
          borderTopColor: "var(--blue)",
          animation: "pp-spin 0.8s linear infinite",
        }}
      />
    </div>
  );
}

/** Requires a live session and optionally a role or platform-admin grant. */
export function ProtectedRoute({ children, role, admin = false }: { children: ReactNode; role?: Role; admin?: boolean }) {
  const { configured, ready, user, profile, profileReady, profileError, refreshProfile, signOut } = useAuth();
  const location = useLocation();
  if (!configured) return <FullScreenLoader />;
  if (!ready) return <FullScreenLoader />;
  if (!user) {
    const next = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={admin ? "/admin/login" : withNext("/login", next)} replace />;
  }

  if (!profileReady) return <FullScreenLoader />;

  if (profileError || !profile) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg)", padding: 24 }}>
        <div className="pp-card" style={{ width: "100%", maxWidth: 460, padding: 28, textAlign: "center" }}>
          <h1 style={{ fontSize: 19, fontWeight: 700 }}>Account unavailable</h1>
          <p style={{ marginTop: 8, color: "var(--text-secondary)", fontSize: 14 }}>{profileError ?? "We couldn't load your account profile."}</p>
          <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 20 }}>
            <button type="button" className="pp-btn pp-btn-primary" onClick={() => void refreshProfile()}>Try again</button>
            <button type="button" className="pp-btn pp-btn-ghost" onClick={() => void signOut()}>Sign out</button>
          </div>
        </div>
      </div>
    );
  }

  if (profile.account_status && profile.account_status !== "active") {
    const banned = profile.account_status === "banned";
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg)", padding: 24 }}>
        <div className="pp-card" role="alert" style={{ width: "100%", maxWidth: 480, padding: 30, textAlign: "center" }}>
          <h1 style={{ fontSize: 21, fontWeight: 750 }}>{banned ? "Account suspended" : "Account archived"}</h1>
          <p style={{ marginTop: 10, color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.6 }}>
            {banned
              ? "A platform administrator has suspended this account. Access to protected data and actions is disabled."
              : "This account is archived and cannot access the application until a platform administrator restores it."}
          </p>
          {profile.status_reason && <p style={{ marginTop: 10, color: "var(--text-muted)", fontSize: 13 }}>Reason: {profile.status_reason}</p>}
          <button type="button" className="pp-btn pp-btn-primary" onClick={() => void signOut()} style={{ marginTop: 20 }}>Sign out</button>
        </div>
      </div>
    );
  }

  if (admin && !profile.is_admin) {
    return <Navigate to={profile.role === "institution" ? "/inst" : "/home"} replace />;
  }

  // A global administrator is a platform identity while authenticated. Even
  // though profiles retain a base role for schema compatibility, never mount a
  // reader or organisation workspace for an administrator session.
  if (role && profile.is_admin) {
    return <Navigate to="/admin" replace />;
  }

  if (role && profile && profile.role !== role) {
    return <Navigate to={profile.role === "institution" ? "/inst" : "/home"} replace />;
  }

  return <>{children}</>;
}
