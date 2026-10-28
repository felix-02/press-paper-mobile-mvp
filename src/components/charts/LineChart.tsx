import { useId } from "react";

function smoothPath(points: [number, number][]): string {
  if (points.length < 2) return "";
  let d = `M ${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const cx = (x0 + x1) / 2;
    d += ` C ${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  return d;
}

/** Tiny inline trend line for metric cards. */
export function Sparkline({
  data,
  color = "var(--series-1)",
  width = 220,
  height = 40,
  fill = true,
}: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
  fill?: boolean;
}) {
  const id = useId().replace(/[:]/g, "");
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 3;
  const pts: [number, number][] = data.map((v, i) => [
    (i / (data.length - 1)) * (width - pad * 2) + pad,
    height - pad - ((v - min) / range) * (height - pad * 2),
  ]);
  const line = smoothPath(pts);
  const area = `${line} L ${pts[pts.length - 1][0]},${height} L ${pts[0][0]},${height} Z`;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#spark-${id})`} />}
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export interface LineSeries {
  data: number[];
  color: string;
  dots?: boolean;
}

/** Full line chart with y-grid, axis labels and optional markers. */
export function LineChart({
  series,
  xLabels,
  yMax,
  yTicks = 4,
  height = 220,
  formatY = (n: number) => `${n}`,
  showDots = false,
}: {
  series: LineSeries[];
  xLabels: string[];
  yMax: number;
  yTicks?: number;
  height?: number;
  formatY?: (n: number) => string;
  showDots?: boolean;
}) {
  const W = 760;
  const H = height;
  const padL = 42;
  const padR = 12;
  const padT = 12;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const x = (i: number, len: number) => padL + (i / (len - 1)) * plotW;
  const y = (v: number) => padT + plotH - (v / yMax) * plotH;

  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => (yMax / yTicks) * i);

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Line chart" style={{ display: "block" }}>
      {/* y grid + labels */}
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
          <text x={padL - 8} y={y(t) + 3} textAnchor="end" fontSize="10.5" fill="var(--text-faint)">
            {formatY(t)}
          </text>
        </g>
      ))}
      {/* x labels */}
      {xLabels.map((label, i) => (
        <text
          key={i}
          x={x(i, xLabels.length)}
          y={H - 6}
          textAnchor="middle"
          fontSize="10.5"
          fill="var(--text-faint)"
        >
          {label}
        </text>
      ))}
      {/* series */}
      {series.map((s, si) => {
        const pts: [number, number][] = s.data.map((v, i) => [x(i, s.data.length), y(v)]);
        return (
          <g key={si}>
            <path d={smoothPath(pts)} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" />
            {(showDots || s.dots) &&
              pts.map(([px, py], i) => <circle key={i} cx={px} cy={py} r="2.4" fill={s.color} />)}
          </g>
        );
      })}
    </svg>
  );
}
