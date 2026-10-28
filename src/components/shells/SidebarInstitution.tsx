import {
  LayoutDashboard,
  PenSquare,
  FileText,
  BarChart3,
  Users,
  UserCog,
  Building2,
  Settings,
  LifeBuoy,
} from "lucide-react";
import { NavItem, SidebarCaption, SidebarToggle } from "./NavItem";
import { useInstitutionStats } from "@/lib/useInstitutionStats";

export function SidebarInstitution({ collapsed = false, onToggle }: { collapsed?: boolean; onToggle?: () => void }) {
  const ic = 18;
  const stats = useInstitutionStats();
  const live = stats.live && stats.loaded && !stats.error;
  const PUBLISHING_STATUS: { label: string; value: string; color?: string }[] = !live
    ? [
        { label: "Drafts", value: "—" },
        { label: "Scheduled", value: "—" },
        { label: "Published", value: "—" },
        { label: "Total releases", value: "—" },
      ]
    : [
        { label: "Drafts", value: String(stats.draftCount) },
        { label: "Scheduled", value: String(stats.scheduledCount) },
        { label: "Published", value: String(stats.publishedCount), color: "var(--green)" },
        { label: "Total releases", value: String(stats.releaseCount) },
      ];
  return (
    <aside
      className="pp-sidebar pp-sidebar-shell"
      aria-label="Institution workspace"
      style={{
        width: "var(--sidebar-w)",
        flexShrink: 0,
        borderRight: "1px solid var(--border)",
        background: "var(--sidebar-bg)",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        padding: "16px 12px 14px",
      }}
    >
      <nav className="pp-sidebar-nav" aria-label="Institution navigation" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {!collapsed && <SidebarCaption>Publishing</SidebarCaption>}
        <NavItem collapsed={collapsed} to="/inst" end icon={<LayoutDashboard size={ic} />} label="Dashboard" />
        <NavItem collapsed={collapsed} to="/inst/publish" icon={<PenSquare size={ic} />} label="Publish" />
        <NavItem collapsed={collapsed} to="/inst/releases" icon={<FileText size={ic} />} label="Releases" />

        <div style={{ height: 12 }} />
        {!collapsed && <SidebarCaption>Insights</SidebarCaption>}
        <NavItem collapsed={collapsed} to="/inst/analytics" icon={<BarChart3 size={ic} />} label="Analytics" />
        <NavItem collapsed={collapsed} to="/inst/audience" icon={<Users size={ic} />} label="Audience" />

        <div style={{ height: 12 }} />
        {!collapsed && <SidebarCaption>Organisation</SidebarCaption>}
        <NavItem collapsed={collapsed} to="/inst/profile" icon={<Building2 size={ic} />} label="Profile" />
        <NavItem collapsed={collapsed} to="/inst/team" icon={<UserCog size={ic} />} label="Team" />
        <NavItem collapsed={collapsed} to="/inst/settings" icon={<Settings size={ic} />} label="Settings" />
      </nav>

      {!collapsed && (
        <>
          <div style={{ height: 1, background: "var(--border)", margin: "16px 4px" }} />
          <SidebarCaption>Publishing status</SidebarCaption>
          <div className="pp-sidebar-status" style={{ display: "flex", flexDirection: "column", gap: 9, padding: "0 11px" }}>
            {PUBLISHING_STATUS.map((s) => (
              <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{s.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: s.color ?? "var(--text)" }}>{s.value}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ marginTop: "auto", paddingTop: 16 }}>
        <NavItem collapsed={collapsed} to="/help" icon={<LifeBuoy size={18} />} label="Help Centre" />
        {onToggle && <SidebarToggle collapsed={collapsed} onToggle={onToggle} />}
      </div>
    </aside>
  );
}
