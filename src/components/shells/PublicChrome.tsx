import { Link } from "react-router-dom";
import { Logo } from "@/components/brand/Logo";

/** Top bar for the pure-black public pages (landing, sources). */
export function PublicHeader() {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 30,
        borderBottom: "1px solid var(--border-faint)",
        background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(10px)",
      }}
    >
      <div
        className="pp-public-header-inner"
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          height: 66,
          padding: "0 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Logo size={20} to="/" />
        <nav className="pp-public-nav" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link
            className="pp-public-secondary"
            to="/sources"
            style={{ fontSize: 14, color: "var(--text-secondary)", padding: "8px 12px" }}
          >
            Explore sources
          </Link>
          <a
            className="pp-public-secondary"
            href="mailto:hello@presspaper.ai?subject=Institution%20access%20request"
            style={{ fontSize: 14, color: "var(--text-secondary)", padding: "8px 12px" }}
          >
            For institutions
          </a>
          <Link to="/login" className="pp-btn pp-btn-ghost" style={{ marginLeft: 6 }}>
            Log in
          </Link>
          <Link to="/signup" className="pp-btn pp-btn-primary">
            Sign up
          </Link>
        </nav>
      </div>
    </header>
  );
}

const FOOTER_COLS: { title: string; links: { label: string; to?: string; href?: string }[] }[] = [
  {
    title: "Platform",
    links: [
      { label: "Explore sources", to: "/sources" },
      { label: "Create account", to: "/signup" },
      { label: "Log in", to: "/login" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Help Centre", to: "/help" },
      { label: "Institution access", href: "mailto:hello@presspaper.ai?subject=Institution%20access%20request" },
      { label: "Contact", href: "mailto:hello@presspaper.ai" },
    ],
  },
];

/** Footer for the public pages with only routes and contact actions that work. */
export function PublicFooter() {
  return (
    <footer style={{ borderTop: "1px solid var(--border-faint)", background: "#000" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 28px 28px" }}>
        <div
          className="pp-footer-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "1.6fr repeat(2, 1fr)",
            gap: 32,
          }}
        >
          <div>
            <Logo size={20} />
            <p
              style={{
                marginTop: 14,
                fontSize: 13.5,
                color: "var(--text-muted)",
                lineHeight: 1.6,
                maxWidth: 280,
              }}
            >
              The home for verified public information. Read official releases
              straight from the institutions that issue them.
            </p>
          </div>

          {FOOTER_COLS.map((col) => (
            <div key={col.title}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0",
                  textTransform: "uppercase",
                  color: "var(--text-faint)",
                  marginBottom: 14,
                }}
              >
                {col.title}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {col.links.map((link) => link.to ? (
                  <Link key={link.label} to={link.to} style={{ textAlign: "left", fontSize: 13.5, color: "var(--text-secondary)" }}>{link.label}</Link>
                ) : (
                  <a key={link.label} href={link.href} style={{ textAlign: "left", fontSize: 13.5, color: "var(--text-secondary)" }}>{link.label}</a>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 40,
            paddingTop: 22,
            borderTop: "1px solid var(--border-faint)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 12.5,
            color: "var(--text-faint)",
          }}
        >
          <span>© {new Date().getFullYear()} Presspaper. All rights reserved.</span>
          <span>Verified public information.</span>
        </div>
      </div>
    </footer>
  );
}
