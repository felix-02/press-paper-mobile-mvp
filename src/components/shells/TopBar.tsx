import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bell,
  Building2,
  ChevronDown,
  FileText,
  LogOut,
  Moon,
  Search,
  Settings as SettingsIcon,
  Sun,
  UserRound,
  X,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { InstitutionMark } from "@/components/brand/InstitutionMark";
import { Avatar } from "@/components/brand/Avatar";
import { Verified } from "@/components/primitives/Bits";
import { useAuth } from "@/auth/AuthProvider";
import { useSearch } from "@/lib/useSearch";
import { useNotifications } from "@/lib/useNotifications";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useTheme } from "@/lib/useTheme";
import type { Institution } from "@/types";

interface LiveInstitutionIdentity {
  name: string;
  verified: boolean;
}

export function TopBar({ kind }: { kind: "institution" | "individual" }) {
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();
  const { resolvedTheme, toggle: toggleTheme } = useTheme();
  const [liveIdentity, setLiveIdentity] = useState<LiveInstitutionIdentity | null>(null);
  const institution: Institution = {
    slug: profile?.institution_slug ?? "institution",
    name: liveIdentity?.name ?? profile?.institution_name ?? "Institution",
    category: "Institution",
    verified: liveIdentity?.verified ?? profile?.verification_status === "verified",
    color: "#2563eb",
    color2: "#4338ca",
    mark: "generic",
  };
  const orgName = institution.name;
  const personName = profile?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "You";

  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const results = useSearch(query);
  const notifications = useNotifications();
  const hasSearchResults = results.institutions.length > 0 || results.releases.length > 0;
  const wrapRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Global search shortcut: "/" or ⌘K / Ctrl+K focuses the search box.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const slug = profile?.institution_slug;
    if (kind !== "institution" || !slug || !isSupabaseConfigured || !supabase) {
      setLiveIdentity(null);
      return;
    }
    let active = true;
    void supabase.rpc("public_institution", { p_slug: slug }).then(({ data }) => {
      if (!active) return;
      const row = ((data as LiveInstitutionIdentity[] | null) ?? [])[0] ?? null;
      setLiveIdentity(row);
    });
    return () => {
      active = false;
    };
  }, [kind, profile?.institution_slug]);

  // Unread tracking: a notification is unread if it's newer than the last time
  // the user opened-then-closed the notifications popup (persisted locally).
  const LAST_SEEN_KEY = `pp_notif_last_seen:${user?.id ?? "signed-out"}`;
  const [lastSeen, setLastSeen] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(LAST_SEEN_KEY) || 0);
    } catch {
      return 0;
    }
  });
  const hasUnread = notifications.some((n) => n.ts > lastSeen);
  const wasNotifOpen = useRef(false);
  useEffect(() => {
    try {
      setLastSeen(Number(localStorage.getItem(LAST_SEEN_KEY) || 0));
    } catch {
      setLastSeen(0);
    }
  }, [LAST_SEEN_KEY]);

  useEffect(() => {
    // When the popup transitions open -> closed, mark everything seen.
    if (wasNotifOpen.current && !notifOpen) {
      const now = Date.now();
      try {
        localStorage.setItem(LAST_SEEN_KEY, String(now));
      } catch {
        /* ignore */
      }
      setLastSeen(now);
    }
    wasNotifOpen.current = notifOpen;
  }, [notifOpen]);

  // close menus on outside click / escape
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
        setNotifOpen(false);
        setAccountOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSearchOpen(false);
        setNotifOpen(false);
        setAccountOpen(false);
        if (accountOpen) accountButtonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [accountOpen]);

  const go = (to: string) => {
    setSearchOpen(false);
    setNotifOpen(false);
    setAccountOpen(false);
    setQuery("");
    navigate(to);
  };

  const logout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setAccountOpen(false);
    try {
      await signOut();
      navigate("/", { replace: true });
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <header
      className="pp-topbar"
      ref={wrapRef}
      style={{
        height: "var(--topbar-h)",
        display: "flex",
        alignItems: "center",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg)",
        flexShrink: 0,
        position: "relative",
        zIndex: 30,
      }}
    >
      <div className="pp-topbar-brand" style={{ width: "var(--sidebar-w)", paddingLeft: 22, display: "flex", alignItems: "center", flexShrink: 0 }}>
        <Logo size={19} to={kind === "institution" ? "/inst" : "/home"} />
      </div>

      {/* search */}
      <div className="pp-topbar-search" style={{ flex: 1, display: "flex", justifyContent: "center", padding: "0 24px", position: "relative" }}>
        <div style={{ width: "100%", maxWidth: 540, position: "relative" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "var(--surface-2)",
              border: `1px solid ${searchOpen ? "var(--blue)" : "var(--border)"}`,
              borderRadius: "var(--r-pill)",
              padding: "9px 16px",
              color: "var(--text-faint)",
            }}
          >
            <Search size={16} />
            <input
              ref={searchInputRef}
              value={query}
              maxLength={100}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchOpen(true);
                setNotifOpen(false);
                setAccountOpen(false);
              }}
              onFocus={() => {
                setSearchOpen(true);
                setAccountOpen(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setSearchOpen(false);
                  e.currentTarget.blur();
                }
              }}
              placeholder="Search institutions, topics or issues…"
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--text)", fontSize: 13.5 }}
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear" style={{ color: "var(--text-muted)", display: "grid", placeItems: "center" }}>
                <X size={15} />
              </button>
            ) : (
              <kbd className="pp-kbd" aria-hidden>/</kbd>
            )}
          </div>

          {searchOpen && query.trim() && (
            <div
              className="pp-search-popover"
              aria-busy={results.loading}
              aria-live="polite"
              style={{
                position: "absolute",
                top: "calc(100% + 8px)",
                left: 0,
                right: 0,
                background: "var(--surface-1)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-lg)",
                boxShadow: "var(--shadow-lg)",
                padding: 8,
                maxHeight: 440,
                overflowY: "auto",
                zIndex: 40,
              }}
            >
              {results.loading && (
                <div
                  role="status"
                  style={{ padding: "11px 14px", color: "var(--text-muted)", fontSize: 13, borderBottom: hasSearchResults || !!results.error ? "1px solid var(--border)" : "none" }}
                >
                  Searching…
                </div>
              )}

              {results.error && (
                <div
                  role="alert"
                  style={{ padding: "11px 14px", color: "var(--red)", fontSize: 13, borderBottom: hasSearchResults ? "1px solid var(--border)" : "none" }}
                >
                  {results.error}{hasSearchResults ? " Showing the results that are available." : ""}
                </div>
              )}

              {results.empty && (
                <div style={{ padding: "20px 14px", textAlign: "center", color: "var(--text-muted)", fontSize: 13.5 }}>
                  No results for “{query}”.
                </div>
              )}

              {hasSearchResults && (
                <>
                  {results.institutions.length > 0 && (
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0", padding: "6px 10px 4px" }}>
                      Institutions
                    </div>
                  )}
                  {results.institutions.map((i) => (
                    <button
                      key={i.slug}
                      type="button"
                      onClick={() => go(`/institution/${i.slug}`)}
                      style={rowStyle}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <InstitutionMark institution={i} size={30} />
                      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 0 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13.5, fontWeight: 600 }}>
                          {i.name} {i.verified && <Verified size={11} />}
                        </span>
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{i.category}</span>
                      </span>
                    </button>
                  ))}

                  {results.releases.length > 0 && (
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0", padding: "10px 10px 4px" }}>
                      Releases
                    </div>
                  )}
                  {results.releases.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => go(`/release/${r.id}`)}
                      style={rowStyle}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <span style={{ width: 30, height: 30, borderRadius: 8, background: "var(--surface-3)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                        <FileText size={15} color="var(--text-muted)" />
                      </span>
                      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 0 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 420 }}>{r.heading}</span>
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{r.institutionName ?? "Institution"} · {r.type}</span>
                      </span>
                    </button>
                  ))}

                  {kind === "individual" && (
                    <button
                      type="button"
                      onClick={() => go(`/explore?q=${encodeURIComponent(query.trim())}`)}
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", marginTop: 4, padding: "10px 10px", borderTop: "1px solid var(--border)", fontSize: 13, fontWeight: 600, color: "var(--blue)" }}
                    >
                      See everything matching “{query.trim().slice(0, 40)}” in Explore
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* right cluster */}
      <div className="pp-topbar-actions" style={{ display: "flex", alignItems: "center", gap: 14, paddingRight: 22, flexShrink: 0, position: "relative" }}>
        <button
          type="button"
          className="pp-shell-icon-btn pp-theme-shortcut"
          aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme`}
          title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme`}
          onClick={() => {
            toggleTheme();
            setSearchOpen(false);
            setNotifOpen(false);
            setAccountOpen(false);
          }}
        >
          {resolvedTheme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        <div style={{ position: "relative" }}>
          <button
            type="button"
            className="pp-shell-icon-btn"
            aria-label="Notifications"
            aria-expanded={notifOpen}
            aria-controls="pp-notifications"
            onClick={() => {
              setNotifOpen((v) => !v);
              setSearchOpen(false);
              setAccountOpen(false);
            }}
            style={{
              position: "relative",
              width: 38,
              height: 38,
              borderRadius: 999,
              display: "grid",
              placeItems: "center",
              color: "var(--text-secondary)",
              border: `1px solid ${notifOpen ? "var(--blue)" : "var(--border)"}`,
              background: "var(--surface-1)",
            }}
          >
            <Bell size={17} />
            {hasUnread && (
              <span style={{ position: "absolute", top: 9, right: 10, width: 7, height: 7, borderRadius: 999, background: "var(--blue)", border: "1.5px solid var(--bg)" }} />
            )}
          </button>

          {notifOpen && (
            <div
              id="pp-notifications"
              className="pp-notification-popover"
              style={{
                position: "absolute",
                top: "calc(100% + 8px)",
                right: 0,
                width: 360,
                background: "var(--surface-1)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-lg)",
                boxShadow: "var(--shadow-lg)",
                overflow: "hidden",
                zIndex: 40,
              }}
            >
              <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--border)", fontSize: 14, fontWeight: 700 }}>Notifications</div>
              <div style={{ maxHeight: 420, overflowY: "auto" }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: "28px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 13.5 }}>
                    You're all caught up. Follow institutions to get notified of new releases.
                  </div>
                ) : (
                  notifications.map((n) => {
                    const i: Institution = {
                      slug: n.slug,
                      name: n.institutionName,
                      category: "Institution",
                      verified: n.institutionVerified,
                      color: "#2563eb",
                      color2: "#4338ca",
                      mark: "generic",
                    };
                    const unread = n.ts > lastSeen;
                    return (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => go(`/release/${n.id}`)}
                        style={{
                          display: "flex",
                          gap: 11,
                          alignItems: "flex-start",
                          width: "100%",
                          textAlign: "left",
                          padding: "12px 16px",
                          borderBottom: "1px solid var(--border)",
                          borderLeft: `3px solid ${unread ? "var(--blue)" : "transparent"}`,
                          background: unread ? "rgba(59,130,246,0.05)" : "transparent",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = unread ? "rgba(59,130,246,0.05)" : "transparent")}
                      >
                        <InstitutionMark institution={i} size={32} />
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                            <strong style={{ color: "var(--text)" }}>{i.name}</strong> published a new {n.type.toLowerCase()}
                          </span>
                          <span style={{ display: "block", fontSize: 13, fontWeight: 600, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.heading}</span>
                          <span style={{ display: "block", fontSize: 11.5, color: "var(--text-muted)", marginTop: 3 }}>{n.time}</span>
                        </span>
                        {unread && <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--blue)", flexShrink: 0, marginTop: 5 }} />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <div className="pp-account-wrap">
          <button
            type="button"
            ref={accountButtonRef}
            className="pp-account-pill"
            style={pillStyle}
            aria-label={`Open account options for ${kind === "institution" ? orgName : personName}`}
            aria-expanded={accountOpen}
            aria-controls="pp-account-menu"
            onClick={() => {
              setAccountOpen((open) => !open);
              setSearchOpen(false);
              setNotifOpen(false);
            }}
          >
            {kind === "institution" ? (
              <>
                <InstitutionMark institution={institution} size={28} />
                <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13.5, fontWeight: 500 }}>
                  {orgName}
                  {institution.verified && <Verified size={13} />}
                </span>
              </>
            ) : (
              <>
                <Avatar size={28} name={personName} />
                <span style={{ fontSize: 13.5, fontWeight: 500 }}>{personName}</span>
              </>
            )}
            <ChevronDown
              size={15}
              color="var(--text-muted)"
              style={{ transform: accountOpen ? "rotate(180deg)" : "none", transition: "transform 150ms ease" }}
            />
          </button>

          {accountOpen && (
            <div id="pp-account-menu" className="pp-account-menu pp-rise" role="region" aria-label="Account options">
              <div className="pp-account-menu-header">
                <strong>{kind === "institution" ? orgName : personName}</strong>
                <span>{user?.email ?? (kind === "institution" ? "Institution account" : "Individual account")}</span>
              </div>

              {kind === "institution" ? (
                <>
                  <Link to="/inst/profile" className="pp-account-menu-row" onClick={() => setAccountOpen(false)}>
                    <Building2 size={16} />
                    <span>Organisation profile</span>
                  </Link>
                  <Link to="/inst/settings" className="pp-account-menu-row" onClick={() => setAccountOpen(false)}>
                    <SettingsIcon size={16} />
                    <span>Settings</span>
                  </Link>
                </>
              ) : (
                <Link to="/me" className="pp-account-menu-row" onClick={() => setAccountOpen(false)}>
                  <UserRound size={16} />
                  <span>Your profile</span>
                </Link>
              )}

              <button type="button" className="pp-account-menu-row" onClick={toggleTheme}>
                {resolvedTheme === "dark" ? <Moon size={16} /> : <Sun size={16} />}
                <span>Appearance</span>
                <small>{resolvedTheme === "dark" ? "Dark" : "Light"}</small>
              </button>

              <div className="pp-account-menu-divider" />
              <button
                type="button"
                className="pp-account-menu-row pp-account-menu-danger"
                disabled={signingOut}
                onClick={() => void logout()}
              >
                <LogOut size={16} />
                <span>{signingOut ? "Signing out…" : "Sign out"}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 11,
  width: "100%",
  textAlign: "left",
  padding: "9px 10px",
  borderRadius: "var(--r-md)",
  background: "transparent",
};

const pillStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  padding: "4px 10px 4px 4px",
  borderRadius: "var(--r-pill)",
  border: "1px solid var(--border)",
  background: "var(--surface-1)",
};
