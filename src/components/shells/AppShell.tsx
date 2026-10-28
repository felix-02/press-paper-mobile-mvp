import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { BarChart3, Bookmark, Building2, Compass, FileText, Home, LayoutDashboard, PenSquare, UserCog } from "lucide-react";
import { TopBar } from "./TopBar";
import { SidebarInstitution } from "./SidebarInstitution";
import { SidebarIndividual } from "./SidebarIndividual";
import { useTheme } from "@/lib/useTheme";
import { useSidebarCollapsed } from "@/lib/useSidebarCollapsed";

const MOBILE_LINKS = {
  institution: [
    { to: "/inst", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/inst/publish", label: "Publish", icon: PenSquare },
    { to: "/inst/releases", label: "Releases", icon: FileText },
    { to: "/inst/analytics", label: "Analytics", icon: BarChart3 },
    { to: "/inst/team", label: "Team", icon: UserCog },
  ],
  individual: [
    { to: "/home", label: "Home", icon: Home, end: true },
    { to: "/explore", label: "Explore", icon: Compass },
    { to: "/saved", label: "Saved", icon: Bookmark },
    { to: "/me", label: "Profile", icon: Building2 },
  ],
} as const;

function MobileNav({ kind }: { kind: "institution" | "individual" }) {
  const links = MOBILE_LINKS[kind];
  return (
    <nav className="pp-mobile-nav" aria-label="Primary navigation">
      {links.map(({ to, label, icon: Icon, ...link }) => (
        <NavLink key={to} to={to} end={"end" in link ? link.end : undefined}>
          {({ isActive }) => (
            <span className={isActive ? "pp-mobile-nav-active" : undefined}>
              <Icon size={18} />
              <small>{label}</small>
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

/**
 * Frame for every logged-in screen: a fixed top bar, a fixed sidebar (chosen by
 * `kind`) and a scrollable content column. `maxWidth` constrains the content so
 * wide screens stay readable; pass a custom value or `false` to fill.
 */
export function AppShell({
  kind,
  children,
  maxWidth = 1320,
  contentPad = 28,
}: {
  kind: "institution" | "individual";
  children: ReactNode;
  maxWidth?: number | false;
  contentPad?: number;
}) {
  const { resolvedTheme } = useTheme();
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();

  return (
    <div
      className="pp-app-min pp-app-shell"
      data-theme={resolvedTheme}
      style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)", ...({ "--sidebar-w": collapsed ? "64px" : "248px" } as React.CSSProperties) }}
    >
      <TopBar kind={kind} />
      <div className="pp-app-body" style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {kind === "institution"
          ? <SidebarInstitution collapsed={collapsed} onToggle={toggleCollapsed} />
          : <SidebarIndividual collapsed={collapsed} onToggle={toggleCollapsed} />}
        <main className="pp-app-main" style={{ flex: 1, overflowY: "auto" }}>
          <div
            className="pp-app-content"
            style={{
              maxWidth: maxWidth === false ? "none" : maxWidth,
              margin: "0 auto",
              padding: contentPad,
            }}
          >
            {children}
          </div>
        </main>
      </div>
      <MobileNav kind={kind} />
    </div>
  );
}
