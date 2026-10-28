import { useId } from "react";
import type { Institution } from "@/types";

// ---------------------------------------------------------------------------
// Institution emblems.
//
// DESIGN DECISION (documented in DOCUMENTATION.md): real institutions own
// trademarked logos we cannot reproduce. Instead every institution is rendered
// as an *original* branded emblem — a gradient disc with a clean monogram
// derived from the database name. This keeps the set coherent, premium and
// unambiguous without maintaining an embedded catalogue of organisations.
// ---------------------------------------------------------------------------

/** Darken / lighten a hex colour by amt (−1..1). */
function shade(hex: string, amt: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h,
    16
  );
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  const f = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v + (amt < 0 ? v : 255 - v) * amt)));
  r = f(r);
  g = f(g);
  b = f(b);
  return `rgb(${r}, ${g}, ${b})`;
}

function initials(institution: Institution): string {
  const stop = new Set(["the", "of", "for", "and", "a"]);
  const letters = institution.name
    .split(/\s+/)
    .filter((w) => !stop.has(w.toLowerCase()))
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return letters.slice(0, 3) || institution.name.slice(0, 2).toUpperCase();
}

export function InstitutionMark({
  institution,
  size = 40,
  shape = "circle",
}: {
  institution: Institution;
  size?: number;
  shape?: "circle" | "square";
}) {
  const id = useId().replace(/[:]/g, "");

  // Institutions that uploaded a logo show it instead of the generated emblem.
  if (institution.avatarUrl && /^https:\/\//.test(institution.avatarUrl)) {
    return (
      <img
        src={institution.avatarUrl}
        alt={institution.name}
        width={size}
        height={size}
        loading="lazy"
        style={{
          flexShrink: 0,
          display: "block",
          width: size,
          height: size,
          borderRadius: shape === "circle" ? "50%" : Math.round(size * 0.26),
          objectFit: "cover",
          background: "var(--surface-3)",
        }}
      />
    );
  }

  const c1 = institution.color;
  const c2 = institution.color2 ?? shade(institution.color, -0.34);
  const text = initials(institution);
  const radius = shape === "circle" ? 50 : 26;

  // Monogram sizing tuned to letter count so 1–3 letters all sit nicely.
  const fontSize = text.length >= 3 ? 30 : text.length === 2 ? 38 : 46;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={institution.name}
      style={{ flexShrink: 0, display: "block" }}
    >
      <defs>
        <linearGradient id={`mk-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={shade(c1, 0.12)} />
          <stop offset="100%" stopColor={c2} />
        </linearGradient>
        <linearGradient id={`hl-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.22)" />
          <stop offset="55%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>

      <rect
        x="0"
        y="0"
        width="100"
        height="100"
        rx={radius}
        fill={`url(#mk-${id})`}
      />
      <rect
        x="0"
        y="0"
        width="100"
        height="100"
        rx={radius}
        fill={`url(#hl-${id})`}
      />
      <rect
        x="1"
        y="1"
        width="98"
        height="98"
        rx={radius - 1}
        fill="none"
        stroke="rgba(255,255,255,0.16)"
        strokeWidth="1.5"
      />

      <text
        x="50"
        y="50"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="var(--font-sans)"
        fontSize={fontSize}
        fontWeight={700}
        letterSpacing="-1"
        fill="#fff"
      >
        {text}
      </text>
    </svg>
  );
}
