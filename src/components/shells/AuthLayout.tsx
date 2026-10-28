import { useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { GlobeArt } from "@/components/brand/Illustrations";

/**
 * Shared frame for the auth screens: brand panel on the left, form on the
 * right. Login and sign-up use the same layout so switching between them
 * feels like flipping a card, not landing on a different site.
 */
export function AuthLayout({ headline, sub, children }: { headline: ReactNode; sub: string; children: ReactNode }) {
  return (
    <div className="pp-auth-split" style={{ background: "#000", minHeight: "100vh", display: "flex" }}>
      <div
        className="pp-auth-brand-panel"
        style={{ width: "44%", borderRight: "1px solid var(--border-faint)", padding: "40px 48px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}
      >
        <Logo size={20} to="/" />
        <div style={{ display: "grid", placeItems: "center", flex: 1 }}>
          <GlobeArt size={400} />
        </div>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "0", lineHeight: 1.25 }}>{headline}</h2>
          <p style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 10, maxWidth: 360, lineHeight: 1.6 }}>{sub}</p>
        </div>
      </div>

      <div style={{ flex: 1, display: "grid", placeItems: "center", padding: "40px 28px", overflowY: "auto", position: "relative" }}>
        <span className="pp-auth-mobile-logo" style={{ position: "absolute", top: 24, left: 22 }}>
          <Logo size={19} to="/" />
        </span>
        <div style={{ width: "100%", maxWidth: 420 }}>{children}</div>
      </div>
    </div>
  );
}

/** Labelled text input for auth forms. */
export function AuthField({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  maxLength,
  autoComplete,
  autoFocus,
}: {
  label: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  autoComplete?: string;
  autoFocus?: boolean;
}) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 13, color: "var(--text-secondary)", marginBottom: 6 }}>{label}</span>
      <input
        className="pp-input"
        type={type}
        placeholder={placeholder}
        value={value}
        maxLength={maxLength}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/** Password input with a show/hide toggle. */
export function PasswordField({
  label = "Password",
  placeholder,
  value,
  onChange,
  autoComplete,
  labelEnd,
}: {
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  labelEnd?: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{label}</span>
        {labelEnd}
      </div>
      <div style={{ position: "relative" }}>
        <input
          className="pp-input"
          type={visible ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          maxLength={128}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          style={{ paddingRight: 42 }}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          style={{ position: "absolute", top: 0, bottom: 0, right: 6, display: "grid", placeItems: "center", width: 32, color: "var(--text-muted)" }}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}
