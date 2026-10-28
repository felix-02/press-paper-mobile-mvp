import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, LifeBuoy, Mail, ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/shells/AppShell";
import { useAuth } from "@/auth/AuthProvider";
import { PublicFooter, PublicHeader } from "@/components/shells/PublicChrome";
import { useReaderShellKind } from "@/lib/useReaderShellKind";
import { usePageTitle } from "@/lib/usePageTitle";

const FAQS: { q: string; a: string }[] = [
  {
    q: "What is Presspaper?",
    a: "Presspaper is a home for verified public information. Official institutions — governments, agencies, regulators, universities — publish their announcements, publications and data directly, and individuals can read, save, follow and get plain-language AI summaries of those official releases.",
  },
  {
    q: "How does institution verification work?",
    a: "Institution accounts are invitation-only. A platform administrator sends a single-use invitation to an official, confirmed work email and reviews the organisation before approving its verified badge and publishing access. Verification cannot be self-assigned from the browser.",
  },
  {
    q: "How do I publish a release?",
    a: "Sign in with an institution account, open the publishing studio from the sidebar, choose a release type, write your heading and body, and publish. Your release appears instantly in readers' feeds and on your public profile, and is included in search and the sitemap.",
  },
  {
    q: "Are AI summaries reliable?",
    a: "Summaries are generated from the official release text only and are meant to aid understanding, not replace the source. The full official release is always one tap away, and we encourage reading it for anything important.",
  },
  {
    q: "How do follows, saves and comments work?",
    a: "Follow institutions to get their new releases in your feed and notifications. Save any release to revisit later from your Saved tab. You can comment on releases and reply to other readers — all tied to your account.",
  },
  {
    q: "How is my data handled?",
    a: "Supabase authentication protects account sessions, and database row-level security limits personal saves, follows, watchlists and profile changes to the signed-in account. Optional product analytics disables autocapture and session recording.",
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pp-card" style={{ padding: 0, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", textAlign: "left", padding: "16px 18px", fontSize: 15, fontWeight: 600 }}
      >
        {q}
        <ChevronDown size={18} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .18s", color: "var(--text-muted)", flexShrink: 0 }} />
      </button>
      {open && <p style={{ padding: "0 18px 18px", fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.65 }}>{a}</p>}
    </div>
  );
}

export function Help() {
  usePageTitle("Help Centre");
  const { user } = useAuth();
  const navigate = useNavigate();
  const kind = useReaderShellKind();

  const content = (
    <>
      <button type="button" onClick={() => navigate(-1)} className="pp-link-muted" style={{ marginBottom: 16, fontSize: 13.5 }}>
        <ArrowLeft size={15} /> Back
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <span style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(59,130,246,0.12)", display: "grid", placeItems: "center" }}>
          <LifeBuoy size={22} color="var(--blue)" />
        </span>
        <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "0" }}>Help Centre</h1>
      </div>
      <p style={{ fontSize: 14.5, color: "var(--text-secondary)", marginBottom: 24 }}>
        Answers to common questions about using Presspaper.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {FAQS.map((f) => (
          <FaqItem key={f.q} q={f.q} a={f.a} />
        ))}
      </div>

      <div className="pp-card" style={{ padding: 22, marginTop: 22, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15.5, fontWeight: 700 }}>Still need help?</div>
          <div style={{ fontSize: 13.5, color: "var(--text-secondary)", marginTop: 3 }}>Our team usually replies within one business day.</div>
        </div>
        <a href="mailto:hello@presspaper.ai?subject=Presspaper%20support" className="pp-btn pp-btn-primary">
          <Mail size={15} /> Contact support
        </a>
      </div>
    </>
  );

  if (!user) {
    return (
      <div style={{ minHeight: "100vh", background: "#000" }}>
        <PublicHeader />
        <main style={{ width: "100%", maxWidth: 816, margin: "0 auto", padding: "42px 28px 64px" }}>{content}</main>
        <PublicFooter />
      </div>
    );
  }

  return <AppShell kind={kind} maxWidth={760}>{content}</AppShell>;
}
