import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

const base: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 11,
  padding: "9px 11px",
  borderRadius: "var(--r-sm)",
  fontSize: 14,
  fontWeight: 500,
  lineHeight: 1,
  transition: "background 0.14s ease, color 0.14s ease",
};

/** Active-aware navigation row backed by the router. */
export function NavItem({
  to,
  icon,
  label,
  end,
  trailing,
  collapsed = false,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  end?: boolean;
  trailing?: ReactNode;
  collapsed?: boolean;
}) {
  return (
    <NavLink to={to} end={end} style={{ display: "block" }} title={collapsed ? label : undefined} aria-label={label}>
      {({ isActive }) => (
        <div
          style={{
            ...base,
            justifyContent: collapsed ? "center" : undefined,
            padding: collapsed ? "9px 0" : base.padding,
            background: isActive ? "var(--surface-3)" : "transparent",
            color: isActive ? "var(--text)" : "var(--text-secondary)",
          }}
          onMouseEnter={(e) => {
            if (!isActive) e.currentTarget.style.background = "var(--surface-2)";
          }}
          onMouseLeave={(e) => {
            if (!isActive) e.currentTarget.style.background = "transparent";
          }}
        >
          <span style={{ display: "grid", placeItems: "center", color: isActive ? "var(--text)" : "var(--text-muted)" }}>
            {icon}
          </span>
          {!collapsed && <span style={{ flex: 1 }}>{label}</span>}
          {!collapsed && trailing}
        </div>
      )}
    </NavLink>
  );
}

/** Collapse/expand control pinned to the sidebar footer. */
export function SidebarToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      style={{
        ...base,
        width: "100%",
        justifyContent: collapsed ? "center" : undefined,
        padding: collapsed ? "9px 0" : base.padding,
        color: "var(--text-muted)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{ display: "grid", placeItems: "center" }}>
        {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
      </span>
      {!collapsed && <span style={{ flex: 1 }}>Collapse</span>}
    </button>
  );
}

/** Small uppercase caption above a sidebar group. */
export function SidebarCaption({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0",
        textTransform: "uppercase",
        color: "var(--text-faint)",
        padding: "0 11px",
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}
