export interface DonutSegment {
  pct: number;
  color: string;
}

/** Donut / ring chart. Center holds a big value + small label. */
export function Donut({
  segments,
  size = 150,
  thickness = 22,
  centerTop,
  centerBottom,
  gap = 2,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  centerTop?: string;
  centerBottom?: string;
  gap?: number;
}) {
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const total = segments.reduce((a, s) => a + s.pct, 0) || 100;

  let offset = 0;
  const arcs = segments.map((s, i) => {
    const frac = s.pct / total;
    const len = frac * circ;
    const dash = `${Math.max(0, len - gap)} ${circ - Math.max(0, len - gap)}`;
    const el = (
      <circle
        key={i}
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={s.color}
        strokeWidth={thickness}
        strokeDasharray={dash}
        strokeDashoffset={-offset}
        strokeLinecap="butt"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
    );
    offset += len;
    return el;
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Donut chart">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={thickness} />
      {arcs}
      {(centerTop || centerBottom) && (
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
          {centerTop && (
            <tspan x={cx} dy="-0.15em" fontSize={size * 0.17} fontWeight="700" fill="var(--text)">
              {centerTop}
            </tspan>
          )}
          {centerBottom && (
            <tspan x={cx} dy="1.25em" fontSize={size * 0.085} fill="var(--text-muted)">
              {centerBottom}
            </tspan>
          )}
        </text>
      )}
    </svg>
  );
}
