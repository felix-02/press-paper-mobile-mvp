// Stylised dotted world map. Continents are approximated by a handful of
// ellipses; we plot a dot wherever a grid point falls on "land". The result is
// an abstract, on-brand map — not a survey-grade projection, which is all the
// static analytics visuals require.

interface Ell {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

// Equirectangular space: x 0..360 (lon −180..180), y 0..180 (lat 90..−90).
const LAND: Ell[] = [
  // North America
  { cx: 78, cy: 46, rx: 30, ry: 26 },
  { cx: 66, cy: 30, rx: 30, ry: 16 },
  { cx: 96, cy: 58, rx: 12, ry: 14 },
  // South America
  { cx: 118, cy: 104, rx: 15, ry: 22 },
  { cx: 112, cy: 128, rx: 9, ry: 18 },
  // Europe
  { cx: 190, cy: 42, rx: 16, ry: 14 },
  // Africa
  { cx: 198, cy: 92, rx: 22, ry: 24 },
  { cx: 202, cy: 116, rx: 13, ry: 14 },
  // Asia
  { cx: 262, cy: 44, rx: 46, ry: 28 },
  { cx: 290, cy: 70, rx: 22, ry: 18 },
  // Australia
  { cx: 312, cy: 122, rx: 17, ry: 11 },
];

function onLand(x: number, y: number): boolean {
  return LAND.some(
    (e) => ((x - e.cx) / e.rx) ** 2 + ((y - e.cy) / e.ry) ** 2 <= 1
  );
}

export function WorldMap({
  height = 200,
  dot = "rgba(59,130,246,0.30)",
  dotActive = "rgba(96,165,250,0.95)",
  markers = [],
  gap = 4.4,
}: {
  height?: number;
  dot?: string;
  dotActive?: string;
  /** Highlighted points as [lon, lat]. */
  markers?: [number, number][];
  gap?: number;
}) {
  const W = 360;
  const H = 180;
  const dots: { x: number; y: number }[] = [];
  for (let y = 8; y < H - 6; y += gap) {
    for (let x = 4; x < W - 4; x += gap) {
      if (onLand(x, y)) dots.push({ x, y });
    }
  }
  const mk = markers.map(([lon, lat]) => ({
    x: ((lon + 180) / 360) * W,
    y: ((90 - lat) / 180) * H,
  }));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={height}
      role="img"
      aria-label="World map"
      style={{ display: "block" }}
    >
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r="1.35" fill={dot} />
      ))}
      {mk.map((m, i) => (
        <g key={i}>
          <circle cx={m.x} cy={m.y} r="6" fill={dotActive} opacity="0.18" />
          <circle cx={m.x} cy={m.y} r="2.4" fill={dotActive} />
        </g>
      ))}
    </svg>
  );
}
