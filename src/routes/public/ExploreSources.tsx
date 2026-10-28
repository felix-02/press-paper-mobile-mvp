import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Search, ArrowRight } from "lucide-react";
import { PublicHeader, PublicFooter } from "@/components/shells/PublicChrome";
import { InstitutionMark } from "@/components/brand/InstitutionMark";
import { Verified } from "@/components/primitives/Bits";
import { optionFromSearchParam, searchParamValue } from "@/lib/urlState";
import { usePublicInstitutions } from "@/lib/usePublicInstitutions";
import { usePageTitle } from "@/lib/usePageTitle";
import type { Institution } from "@/types";

const CATEGORIES = ["All", "Government", "Local Authority", "University", "Health", "Regulator"] as const;
type SourceCategory = (typeof CATEGORIES)[number];

function blurb(i: Institution): string {
  const map: Record<string, string> = {
    Government: "Official announcements, consultations and policy from the national government.",
    "Local Authority": "Local services, council decisions and community updates.",
    University: "Research, admissions and institutional news.",
    "Health Board": "Public health guidance, statistics and service updates.",
    Regulator: "Standards, guidance and regulatory decisions.",
    "Education Inspectorate": "Inspection reports and education standards.",
  };
  return map[i.category] ?? "Verified official information published directly to the public.";
}

function SourceCard({ institution: i }: { institution: Institution }) {
  const navigate = useNavigate();
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => navigate(`/institution/${i.slug}`)}
      onKeyDown={(e) => e.key === "Enter" && navigate(`/institution/${i.slug}`)}
      style={{
        background: "var(--surface-public)",
        border: "1px solid var(--border-faint)",
        borderRadius: "var(--r-lg)",
        padding: 20,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        transition: "border-color 0.15s ease, background 0.15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--border-strong)";
        e.currentTarget.style.background = "var(--surface-public-2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border-faint)";
        e.currentTarget.style.background = "var(--surface-public)";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
        <InstitutionMark institution={i} size={52} />
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 15.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {i.name}
            </span>
            {i.verified && <Verified size={14} />}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 }}>{i.category}</div>
        </div>
      </div>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55, marginTop: 14, flex: 1 }}>
        {blurb(i)}
      </p>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
        <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Verified source</span>
        <Link
          to={`/institution/${i.slug}`}
          onClick={(e) => e.stopPropagation()}
          className="pp-btn pp-btn-ghost"
          style={{ padding: "6px 14px", fontSize: 13 }}
        >
          View source
        </Link>
      </div>
    </div>
  );
}

function matchesCategory(category: string, selected: SourceCategory): boolean {
  if (selected === "All") return true;
  if (selected === "Health") return category.toLowerCase().includes("health");
  return category.toLowerCase() === selected.toLowerCase();
}

export function ExploreSources() {
  usePageTitle("Explore sources");
  const [query, setQuery] = useState("");
  const directory = usePublicInstitutions();
  const [params, setParams] = useSearchParams();
  const category = optionFromSearchParam(CATEGORIES, params.get("category"), "All");
  const setCategory = (nextCategory: SourceCategory) => {
    const p = new URLSearchParams(params);
    p.set("category", searchParamValue(nextCategory));
    setParams(p);
  };
  const normalizedQuery = query.trim().toLowerCase();
  const institutions = directory.institutions.filter((institution) => {
    return matchesCategory(institution.category, category)
      && (!normalizedQuery || institution.name.toLowerCase().includes(normalizedQuery) || institution.category.toLowerCase().includes(normalizedQuery));
  });

  return (
    <div style={{ background: "#000", minHeight: "100vh", color: "var(--text)" }}>
      <PublicHeader />

      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "52px 28px 24px" }}>
        <h1 style={{ fontSize: 40, fontWeight: 700, letterSpacing: "0" }}>Explore Verified Sources</h1>
        <p style={{ fontSize: 16, color: "var(--text-secondary)", marginTop: 12, maxWidth: 600 }}>
          Browse the institutions publishing official information on Presspaper.
          Follow the ones that matter to you.
        </p>

        <div style={{ display: "flex", gap: 12, marginTop: 26, alignItems: "center", flexWrap: "wrap" }}>
          <label
            aria-label="Search institutions"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "var(--surface-public)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-pill)",
              padding: "10px 16px",
              color: "var(--text-faint)",
              fontSize: 14,
              minWidth: 280,
              flex: 1,
              maxWidth: 380,
            }}
          >
            <Search size={16} />
            <input value={query} maxLength={100} onChange={(event) => setQuery(event.target.value)} placeholder="Search institutions…" style={{ flex: 1, minWidth: 0, border: 0, outline: 0, color: "var(--text)", background: "transparent" }} />
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {CATEGORIES.map((c) => {
              const active = category === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  style={{
                    fontSize: 13,
                    padding: "7px 14px",
                    borderRadius: "var(--r-pill)",
                    border: `1px solid ${active ? "transparent" : "var(--border)"}`,
                    background: active ? "#fff" : "var(--surface-public)",
                    color: active ? "#0a0a0a" : "var(--text-secondary)",
                    fontWeight: active ? 600 : 500,
                  }}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "8px 28px 64px" }}>
        {directory.loading ? (
          <div style={{ padding: "48px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>Loading verified sources…</div>
        ) : directory.error ? (
          <div role="alert" style={{ padding: "48px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
            <p>{directory.error}</p>
            <button type="button" onClick={directory.refresh} className="pp-btn pp-btn-outline" style={{ marginTop: 14 }}>Retry</button>
          </div>
        ) : institutions.length === 0 ? (
          <div style={{ padding: "48px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
            {normalizedQuery ? `No verified sources match “${query.trim()}”.` : `No verified sources in ${category} yet.`}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
              {institutions.length} verified {institutions.length === 1 ? "source" : "sources"}
            </div>
            <div className="pp-source-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>
              {institutions.map((institution) => (
                <SourceCard key={institution.slug} institution={institution} />
              ))}
            </div>
          </>
        )}
        <div style={{ textAlign: "center", marginTop: 36 }}>
          <Link to="/signup" className="pp-btn pp-btn-outline" style={{ padding: "11px 22px" }}>
            Create an account to follow <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
