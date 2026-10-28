import { useId } from "react";

// ---------------------------------------------------------------------------
// Decorative line-art for the public (pure-black) marketing pages.
// Both are pure SVG so they render instantly and work fully offline.
// ---------------------------------------------------------------------------

function mulberry(seed: number) {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Dotted wireframe globe with constellation nodes (PUB-01 / PUB-02 / PUB-03). */
export function GlobeArt({ size = 520 }: { size?: number }) {
  const id = useId().replace(/[:]/g, "");
  const R = 200;
  const C = 250;
  const rand = mulberry(42);

  // Dotted "landmass" texture — points kept inside the sphere.
  const dots: { x: number; y: number; o: number }[] = [];
  for (let i = 0; i < 460; i++) {
    const a = rand() * Math.PI * 2;
    const rr = Math.sqrt(rand()) * R;
    const x = C + Math.cos(a) * rr;
    const y = C + Math.sin(a) * rr * 0.99;
    // perspective fade toward the rim
    const edge = rr / R;
    if (rand() > 0.34 + edge * 0.4) {
      dots.push({ x, y, o: 0.1 + (1 - edge) * 0.5 });
    }
  }

  // A few brighter connection nodes + links.
  const nodes = Array.from({ length: 7 }, () => {
    const a = rand() * Math.PI * 2;
    const rr = (0.35 + rand() * 0.55) * R;
    return { x: C + Math.cos(a) * rr, y: C + Math.sin(a) * rr * 0.96 };
  });
  const links: [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [0, 5],
    [5, 6],
  ];

  const meridians = [0.32, 0.62, 0.86, 1].map((k) => k * R);
  const parallels = [-0.6, -0.3, 0, 0.3, 0.6].map((k) => k * R);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 500 500"
      fill="none"
      aria-hidden
      style={{ maxWidth: "100%", display: "block" }}
    >
      <defs>
        <radialGradient id={`glow-${id}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.05)" />
          <stop offset="70%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        <clipPath id={`clip-${id}`}>
          <circle cx={C} cy={C} r={R} />
        </clipPath>
      </defs>

      <circle cx={C} cy={C} r={R + 30} fill={`url(#glow-${id})`} />
      <circle
        cx={C}
        cy={C}
        r={R}
        stroke="rgba(255,255,255,0.16)"
        strokeWidth="1"
      />

      <g clipPath={`url(#clip-${id})`} stroke="rgba(255,255,255,0.085)" strokeWidth="1">
        {meridians.map((rx, i) => (
          <ellipse key={`m${i}`} cx={C} cy={C} rx={rx} ry={R} />
        ))}
        {parallels.map((dy, i) => {
          const ry = Math.sqrt(Math.max(0, R * R - dy * dy)) * 0.34;
          return <ellipse key={`p${i}`} cx={C} cy={C + dy} rx={R} ry={ry} />;
        })}
      </g>

      <g>
        {dots.map((d, i) => (
          <circle
            key={i}
            cx={d.x}
            cy={d.y}
            r="1.5"
            fill={`rgba(255,255,255,${d.o.toFixed(2)})`}
          />
        ))}
      </g>

      <g>
        {links.map(([a, b], i) => (
          <line
            key={i}
            x1={nodes[a].x}
            y1={nodes[a].y}
            x2={nodes[b].x}
            y2={nodes[b].y}
            stroke="rgba(255,255,255,0.22)"
            strokeWidth="0.8"
          />
        ))}
        {nodes.map((n, i) => (
          <g key={i}>
            <circle cx={n.x} cy={n.y} r="4.5" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
            <circle cx={n.x} cy={n.y} r="2" fill="#fff" />
          </g>
        ))}
      </g>
    </svg>
  );
}

/** Classical institution / temple line-art (PUB-01 institutions block, PUB-04). */
export function TempleArt({
  width = 300,
  flag = true,
  stroke = "rgba(255,255,255,0.8)",
}: {
  width?: number;
  flag?: boolean;
  stroke?: string;
}) {
  const cols = [40, 78, 116, 154, 192, 230];
  return (
    <svg
      width={width}
      height={width * 0.72}
      viewBox="0 0 270 196"
      fill="none"
      stroke={stroke}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ maxWidth: "100%", display: "block" }}
    >
      {/* pediment */}
      <path d="M18 64 L135 18 L252 64 Z" />
      {/* architrave */}
      <line x1="30" y1="64" x2="240" y2="64" />
      <line x1="26" y1="76" x2="244" y2="76" />
      {/* columns */}
      {cols.map((x, i) => (
        <g key={i}>
          <line x1={x} y1="80" x2={x} y2="156" />
          <line x1={x + 14} y1="80" x2={x + 14} y2="156" />
          <line x1={x - 2} y1="80" x2={x + 16} y2="80" />
          <line x1={x - 3} y1="156" x2={x + 17} y2="156" />
        </g>
      ))}
      {/* steps */}
      <line x1="18" y1="166" x2="252" y2="166" />
      <line x1="10" y1="178" x2="260" y2="178" />
      {/* flag */}
      {flag && (
        <>
          <line x1="135" y1="18" x2="135" y2="2" />
          <path d="M135 4 L156 9 L135 14 Z" />
        </>
      )}
    </svg>
  );
}
