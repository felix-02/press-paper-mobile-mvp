import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Home,
  Compass,
  Bookmark,
  Plus,
  ListChecks,
  LifeBuoy,
} from "lucide-react";
import { NavItem, SidebarCaption, SidebarToggle } from "./NavItem";
import { InstitutionMark } from "@/components/brand/InstitutionMark";
import { Verified } from "@/components/primitives/Bits";
import { useAppStore } from "@/store/useAppStore";
import { useWatchlists } from "@/lib/useWatchlists";
import { usePublicInstitutions } from "@/lib/usePublicInstitutions";
import type { Institution } from "@/types";

function FollowedRow({ institution: i }: { institution: Institution }) {
  return (
    <NavLink to={`/institution/${i.slug}`} style={{ display: "block" }}>
      {({ isActive }) => (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "7px 11px",
            borderRadius: "var(--r-sm)",
            background: isActive ? "var(--surface-3)" : "transparent",
          }}
          onMouseEnter={(e) => {
            if (!isActive) e.currentTarget.style.background = "var(--surface-2)";
          }}
          onMouseLeave={(e) => {
            if (!isActive) e.currentTarget.style.background = "transparent";
          }}
        >
          <InstitutionMark institution={i} size={22} />
          <span
            style={{
              flex: 1,
              fontSize: 13,
              color: isActive ? "var(--text)" : "var(--text-secondary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {i.name}
          </span>
          {i.verified && <Verified size={12} />}
        </div>
      )}
    </NavLink>
  );
}

export function SidebarIndividual({ collapsed = false, onToggle }: { collapsed?: boolean; onToggle?: () => void }) {
  const ic = 18;
  const followed = useAppStore((s) => s.followedSlugs);
  const { lists, available, create } = useWatchlists();
  const directory = usePublicInstitutions();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  // Only institutions that actually exist in the live directory are shown.
  // Stale follow rows (an institution that was removed or unverified) are
  // never fabricated into fake entries.
  const followedInstitutions: Institution[] = directory.institutions.filter((institution) => followed.has(institution.slug));

  const submitCreate = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    const wl = await create(n);
    setBusy(false);
    setName("");
    setCreating(false);
    if (wl) navigate(`/watchlist/${wl.id}`);
  };
  return (
    <aside
      className="pp-sidebar pp-sidebar-shell"
      aria-label="Personal workspace"
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
      <nav className="pp-sidebar-nav" aria-label="Personal navigation" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <NavItem collapsed={collapsed} to="/home" end icon={<Home size={ic} />} label="Home" />
        <NavItem collapsed={collapsed} to="/explore" icon={<Compass size={ic} />} label="Explore" />
        <NavItem collapsed={collapsed} to="/saved" icon={<Bookmark size={ic} />} label="Saved" />
      </nav>

      {!collapsed && (
        <>
      <div style={{ height: 1, background: "var(--border)", margin: "16px 4px" }} />

      <SidebarCaption>Followed institutions</SidebarCaption>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {directory.loading && followed.size > 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--text-faint)", padding: "4px 11px" }}>Loading…</div>
        ) : followedInstitutions.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--text-faint)", padding: "4px 11px", lineHeight: 1.5 }}>
            You're not following anyone yet. Follow institutions to see them here.
          </div>
        ) : (
          followedInstitutions.map((institution) => <FollowedRow key={institution.slug} institution={institution} />)
        )}
      </div>

      <div style={{ height: 1, background: "var(--border)", margin: "16px 4px" }} />

      <SidebarCaption>Watchlists</SidebarCaption>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {!available ? (
          <div style={{ fontSize: 12.5, color: "var(--text-faint)", padding: "4px 11px", lineHeight: 1.5 }}>
            Sign in to create watchlists.
          </div>
        ) : lists.length === 0 && !creating ? (
          <div style={{ fontSize: 12.5, color: "var(--text-faint)", padding: "4px 11px", lineHeight: 1.5 }}>
            No watchlists yet.
          </div>
        ) : (
          lists.map((w) => (
            <NavLink key={w.id} to={`/watchlist/${w.id}`} style={{ display: "block" }}>
              {({ isActive }) => (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 11px",
                    borderRadius: "var(--r-md)",
                    fontSize: 13.5,
                    color: isActive ? "var(--text)" : "var(--text-secondary)",
                    background: isActive ? "var(--surface-2)" : "transparent",
                  }}
                >
                  <ListChecks size={ic} style={{ flexShrink: 0, opacity: 0.8 }} />
                  <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{w.name}</span>
                  <span style={{ fontSize: 12, color: "var(--text-faint)" }}>{w.count}</span>
                </div>
              )}
            </NavLink>
          ))
        )}

        {available && creating ? (
          <div style={{ display: "flex", gap: 6, padding: "6px 8px" }}>
            <input
              autoFocus
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitCreate();
                if (e.key === "Escape") {
                  setCreating(false);
                  setName("");
                }
              }}
              placeholder="List name"
              className="pp-input"
              style={{ padding: "6px 9px", fontSize: 13 }}
            />
            <button type="button" onClick={submitCreate} disabled={!name.trim() || busy} className="pp-btn pp-btn-blue" style={{ padding: "6px 10px", fontSize: 12.5, flexShrink: 0, opacity: name.trim() && !busy ? 1 : 0.6 }}>
              Add
            </button>
          </div>
        ) : (
          available && (
            <button
              type="button"
              className="pp-sidebar-create"
              onClick={() => setCreating(true)}
              style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "8px 11px", borderRadius: "var(--r-md)", fontSize: 13.5, color: "var(--text-secondary)", background: "transparent" }}
            >
              <Plus size={ic} style={{ flexShrink: 0 }} /> Create watchlist
            </button>
          )
        )}
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
