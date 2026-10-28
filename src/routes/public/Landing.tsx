import { Link } from "react-router-dom";
import {
  BadgeCheck,
  Sparkles,
  Languages,
  Bell,
  ArrowRight,
  Building2,
  Users,
  ShieldCheck,
  UserPlus,
  Compass,
  BookOpenCheck,
} from "lucide-react";
import { PublicHeader, PublicFooter } from "@/components/shells/PublicChrome";
import { GlobeArt, TempleArt } from "@/components/brand/Illustrations";

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="pp-landing-feature">
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: "rgba(59,130,246,0.12)",
          color: "var(--blue)",
          display: "grid",
          placeItems: "center",
          marginBottom: 14,
        }}
      >
        {icon}
      </div>
      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{title}</h3>
      <p style={{ fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.6 }}>{body}</p>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5 }}>
      <BadgeCheck size={17} className="pp-verified" style={{ marginTop: 1 }} />
      <span>{children}</span>
    </li>
  );
}

function Step({ n, icon, title, body }: { n: number; icon: React.ReactNode; title: string; body: string }) {
  return (
    <div style={{ position: "relative", padding: "26px 22px", background: "var(--surface-public)", border: "1px solid var(--border-faint)", borderRadius: "var(--r-lg)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <span style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(59,130,246,0.12)", color: "var(--blue)", display: "grid", placeItems: "center" }}>
          {icon}
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-faint)", letterSpacing: "0.08em" }}>STEP {n}</span>
      </div>
      <h3 style={{ fontSize: 16.5, fontWeight: 600 }}>{title}</h3>
      <p style={{ fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.6, marginTop: 7 }}>{body}</p>
    </div>
  );
}

export function Landing() {
  return (
    <div style={{ background: "#000", minHeight: "100vh", color: "var(--text)" }}>
      <PublicHeader />

      {/* hero */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "64px 28px 40px" }}>
        <div className="pp-public-split" style={{ display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 40, alignItems: "center" }}>
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
                borderRadius: 999,
                padding: "6px 13px",
                marginBottom: 22,
              }}
            >
              <ShieldCheck size={14} className="pp-verified" />
              Verified institutions only
            </div>
            <h1 className="pp-landing-title" style={{ fontSize: 52, fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.02em" }}>
              The home for <span className="pp-hero-accent">verified</span> public information
            </h1>
            <p style={{ fontSize: 17, color: "var(--text-secondary)", lineHeight: 1.6, marginTop: 20, maxWidth: 520 }}>
              Read official announcements, consultations and reports straight from
              the institutions that issue them — with AI summaries, translation and
              watchlists built in.
            </p>
            <div style={{ display: "flex", gap: 12, marginTop: 30, flexWrap: "wrap" }}>
              <Link to="/signup" className="pp-btn pp-btn-primary" style={{ padding: "12px 22px", fontSize: 15 }}>
                Get started
                <ArrowRight size={17} />
              </Link>
              <Link to="/sources" className="pp-btn pp-btn-outline" style={{ padding: "12px 22px", fontSize: 15 }}>
                Explore sources
              </Link>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-faint)", marginTop: 18 }}>
              Free for readers · No feeds of unverified noise · Sources you can cite
            </p>
          </div>
          <div className="pp-public-art" style={{ display: "grid", placeItems: "center" }}>
            <GlobeArt size={460} />
          </div>
        </div>
      </section>

      {/* features */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 28px 20px" }}>
        <div className="pp-feature-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          <Feature icon={<BadgeCheck size={20} />} title="Verified sources" body="Every publisher is a verified institution. No noise, no impersonation — only official information." />
          <Feature icon={<Sparkles size={20} />} title="AI summaries" body="Understand releases faster with plain-language summaries generated from the official text." />
          <Feature icon={<Languages size={20} />} title="Instant translation" body="Read releases in your language, including full Welsh and English bilingual support." />
          <Feature icon={<Bell size={20} />} title="Watchlists & alerts" body="Follow the institutions and topics you care about and never miss an important update." />
        </div>
      </section>

      {/* how it works */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "56px 28px 8px" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <h2 style={{ fontSize: 30, fontWeight: 700, letterSpacing: "0" }}>Up and running in a minute</h2>
          <p style={{ fontSize: 15, color: "var(--text-secondary)", marginTop: 10 }}>
            Three steps between you and a feed you can actually trust.
          </p>
        </div>
        <div className="pp-feature-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          <Step n={1} icon={<UserPlus size={19} />} title="Create your free account" body="Sign up in seconds — no credit card, no unverifiable publishers, no ads." />
          <Step n={2} icon={<Compass size={19} />} title="Follow the sources that matter" body="Governments, regulators, universities — pick the institutions whose word you need first-hand." />
          <Step n={3} icon={<BookOpenCheck size={19} />} title="Read with superpowers" body="AI summaries, instant translation, watchlists and discussion on every official release." />
        </div>
      </section>

      {/* split: institutions */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "56px 28px" }}>
        <div className="pp-public-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center" }}>
          <div className="pp-public-art" style={{ display: "grid", placeItems: "center", padding: 24 }}>
            <TempleArt width={320} />
          </div>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--blue)", fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
              <Building2 size={16} /> FOR INSTITUTIONS
            </div>
            <h2 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "0", lineHeight: 1.15 }}>
              Publish directly to the public
            </h2>
            <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.6, marginTop: 14 }}>
              Reach citizens without intermediaries. Publish releases, track
              performance and understand your audience — all from one studio.
            </p>
            <ul style={{ display: "flex", flexDirection: "column", gap: 12, listStyle: "none", padding: 0, marginTop: 22 }}>
              <Bullet>A verified profile that citizens can trust</Bullet>
              <Bullet>Real analytics on reach and engagement — measured, never estimated</Bullet>
              <Bullet>Role-based access for your communications team</Bullet>
            </ul>
            <a href="mailto:hello@presspaper.ai?subject=Institution%20access%20request" className="pp-btn pp-btn-blue" style={{ marginTop: 26, padding: "11px 20px" }}>
              Request institution access <ArrowRight size={16} />
            </a>
          </div>
        </div>
      </section>

      {/* split: individuals */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "0 28px 64px" }}>
        <div className="pp-public-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center" }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--green)", fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
              <Users size={16} /> FOR INDIVIDUALS
            </div>
            <h2 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "0", lineHeight: 1.15 }}>
              Stay informed, effortlessly
            </h2>
            <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.6, marginTop: 14 }}>
              Build a personal feed of the institutions that matter to you and cut
              through the noise with AI that does the reading for you.
            </p>
            <ul style={{ display: "flex", flexDirection: "column", gap: 12, listStyle: "none", padding: 0, marginTop: 22 }}>
              <Bullet>One clean feed of official, verified releases</Bullet>
              <Bullet>AI summaries and instant translation on every release</Bullet>
              <Bullet>Save releases and organise them into watchlists</Bullet>
            </ul>
            <Link to="/signup" className="pp-btn pp-btn-primary" style={{ marginTop: 26, padding: "11px 20px" }}>
              Create your feed <ArrowRight size={16} />
            </Link>
          </div>
          <div className="pp-public-art" style={{ display: "grid", placeItems: "center", padding: 24 }}>
            <GlobeArt size={360} />
          </div>
        </div>
      </section>

      {/* cta band */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "0 28px 72px" }}>
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-2xl)",
            padding: "48px 32px",
            textAlign: "center",
            background: "radial-gradient(ellipse at 50% -40%, rgba(59,130,246,0.16), transparent 62%), linear-gradient(180deg, rgba(59,130,246,0.05), rgba(0,0,0,0))",
          }}
        >
          <h2 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "0" }}>Ready to get started?</h2>
          <p style={{ fontSize: 15, color: "var(--text-secondary)", marginTop: 12 }}>
            Join Presspaper and bring trusted public information into focus.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 26, flexWrap: "wrap" }}>
            <Link to="/signup" className="pp-btn pp-btn-primary" style={{ padding: "12px 24px", fontSize: 15 }}>
              Create free account
            </Link>
            <Link to="/login" className="pp-btn pp-btn-outline" style={{ padding: "12px 24px", fontSize: 15 }}>
              Log in
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
