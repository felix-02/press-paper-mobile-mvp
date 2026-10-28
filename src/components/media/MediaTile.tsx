import { useId } from "react";
import type { MediaScene } from "@/types";

// Which scenes are "video" (show a play affordance and can play a clip) vs a
// static background image (no play button). Deterministic per scene.
export const VIDEO_SCENES: ReadonlySet<MediaScene> = new Set<MediaScene>([
  "wind-farm",
  "city-solar",
  "cardiff-bay",
  "coast",
]);
export const isVideoScene = (s: MediaScene) => VIDEO_SCENES.has(s);

// ---------------------------------------------------------------------------
// Media is represented by lightweight, hand-built gradient + silhouette scenes.
// They render instantly without third-party asset dependencies while giving
// each publisher-selected cover a distinct visual character.
// ---------------------------------------------------------------------------

type Stop = [string, string]; // [color, offset%]

interface SceneDef {
  sky: Stop[];
  paint: () => React.ReactNode;
}

function hill(d: string, fill: string, opacity = 1) {
  return <path d={d} fill={fill} opacity={opacity} />;
}

function turbine(x: number, y: number, s: number, color: string, rot = 0) {
  const blades = [0, 120, 240].map((a) => {
    const ang = ((a + rot) * Math.PI) / 180;
    const x2 = x + Math.cos(ang) * 16 * s;
    const y2 = y + Math.sin(ang) * 16 * s;
    return (
      <line
        key={a}
        x1={x}
        y1={y}
        x2={x2}
        y2={y2}
        stroke={color}
        strokeWidth={1.6 * s}
        strokeLinecap="round"
      />
    );
  });
  return (
    <g key={`${x}-${y}`}>
      <line x1={x} y1={y} x2={x} y2={y + 30 * s} stroke={color} strokeWidth={1.8 * s} />
      {blades}
      <circle cx={x} cy={y} r={1.6 * s} fill={color} />
    </g>
  );
}

const SCENES: Record<MediaScene, SceneDef> = {
  "wind-farm": {
    sky: [
      ["#f6b66b", "0%"],
      ["#f3cd87", "34%"],
      ["#9fb46a", "70%"],
      ["#4f7a3f", "100%"],
    ],
    paint: () => (
      <g>
        <circle cx="78" cy="120" r="40" fill="rgba(255,244,214,0.55)" />
        {hill("M0 168 Q120 132 240 156 T480 150 V240 H0 Z", "#6f9150", 0.95)}
        {hill("M0 188 Q140 160 280 182 T520 176 V240 H0 Z", "#42632f")}
        {turbine(150, 150, 1.25, "rgba(250,250,245,0.92)", 20)}
        {turbine(208, 138, 1.55, "rgba(252,252,247,0.96)", 70)}
        {turbine(270, 156, 1.1, "rgba(245,245,238,0.85)", 140)}
        {turbine(330, 144, 1.35, "rgba(250,250,245,0.9)", 200)}
      </g>
    ),
  },
  "city-solar": {
    sky: [
      ["#3a6ea5", "0%"],
      ["#5b8bbf", "48%"],
      ["#8fb0cf", "100%"],
    ],
    paint: () => (
      <g>
        {[40, 80, 120, 165, 210, 250, 300, 350].map((x, i) => (
          <rect
            key={i}
            x={x}
            y={108 - (i % 3) * 16 - (i % 2) * 8}
            width="26"
            height={120}
            rx="2"
            fill="rgba(20,40,66,0.78)"
          />
        ))}
        <rect x="0" y="168" width="480" height="72" fill="#15263c" />
        {[0, 1, 2].map((r) =>
          [0, 1, 2, 3, 4, 5].map((c) => (
            <g key={`${r}-${c}`} transform={`translate(${20 + c * 78} ${182 + r * 20})`}>
              <path d="M0 12 L46 12 L40 0 L-6 0 Z" fill="#1b3a63" stroke="#2f5d96" strokeWidth="1" />
              <line x1="11" y1="0" x2="5" y2="12" stroke="#3f78bd" strokeWidth="0.7" />
              <line x1="28" y1="0" x2="22" y2="12" stroke="#3f78bd" strokeWidth="0.7" />
            </g>
          ))
        )}
      </g>
    ),
  },
  parliament: {
    sky: [
      ["#26344f", "0%"],
      ["#3f5170", "55%"],
      ["#c98a63", "100%"],
    ],
    paint: () => (
      <g fill="rgba(16,22,38,0.86)">
        <rect x="40" y="92" width="22" height="148" />
        <path d="M38 92 L51 64 L64 92 Z" />
        <rect x="48" y="56" width="6" height="10" />
        <rect x="80" y="120" width="320" height="120" />
        <g stroke="rgba(70,86,120,0.55)" strokeWidth="2">
          {[96, 128, 160, 192, 224, 256, 288, 320, 352, 384].map((x, i) => (
            <line key={i} x1={x} y1="124" x2={x} y2="236" />
          ))}
        </g>
        <rect x="80" y="112" width="320" height="10" />
        <rect x="196" y="78" width="44" height="42" />
        <path d="M194 78 L218 56 L242 78 Z" />
      </g>
    ),
  },
  coast: {
    sky: [
      ["#88b6c9", "0%"],
      ["#b9d4dd", "42%"],
      ["#6f9f76", "100%"],
    ],
    paint: () => (
      <g>
        <rect x="0" y="150" width="480" height="46" fill="#5e93b0" opacity="0.85" />
        {hill("M0 150 Q90 120 200 138 Q320 156 480 128 V196 H0 Z", "#3f6f4a")}
        {hill("M0 168 Q140 150 300 166 T480 158 V240 H0 Z", "#2c5235")}
        <path d="M0 150 Q90 120 200 138 Q320 156 480 128" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.4" />
        <rect x="0" y="196" width="480" height="44" fill="#244a2c" />
      </g>
    ),
  },
  "cardiff-bay": {
    sky: [
      ["#2c3e63", "0%"],
      ["#3f5c86", "50%"],
      ["#e2a06f", "100%"],
    ],
    paint: () => (
      <g>
        {[
          [40, 120, 30, 100],
          [76, 96, 26, 124],
          [108, 130, 34, 90],
          [150, 84, 30, 136],
          [186, 112, 40, 108],
          [232, 100, 28, 120],
          [266, 132, 36, 88],
          [308, 90, 30, 130],
          [344, 118, 42, 102],
        ].map(([x, y, w, h], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} fill="rgba(18,28,52,0.85)" />
        ))}
        <g fill="rgba(240,200,150,0.85)">
          {[50, 90, 160, 200, 240, 318].map((x, i) => (
            <rect key={i} x={x} y={120 - (i % 3) * 10} width="4" height="4" />
          ))}
        </g>
        <rect x="0" y="170" width="480" height="70" fill="#1c3357" />
        <g stroke="rgba(226,160,111,0.4)" strokeWidth="2">
          {[60, 120, 200, 280, 340].map((x, i) => (
            <line key={i} x1={x} y1="172" x2={x} y2="206" />
          ))}
        </g>
      </g>
    ),
  },
  town: {
    sky: [
      ["#c9b89c", "0%"],
      ["#d8cab0", "45%"],
      ["#a89274", "100%"],
    ],
    paint: () => (
      <g fill="rgba(74,58,46,0.82)">
        {[
          [30, 150, 60],
          [96, 132, 54],
          [156, 158, 50],
          [212, 128, 64],
          [282, 150, 56],
          [344, 138, 60],
        ].map(([x, y, w], i) => (
          <g key={i}>
            <rect x={x} y={y} width={w} height={240 - (y as number)} />
            <path d={`M${(x as number) - 4} ${y} L${(x as number) + (w as number) / 2} ${(y as number) - 18} L${(x as number) + (w as number) + 4} ${y} Z`} />
          </g>
        ))}
        <g fill="rgba(216,202,176,0.7)">
          {[44, 112, 172, 232, 300, 360].map((x, i) => (
            <rect key={i} x={x} y={166 + (i % 2) * 14} width="8" height="10" />
          ))}
        </g>
      </g>
    ),
  },
  skyline: {
    sky: [
      ["#1f2a4a", "0%"],
      ["#33457a", "55%"],
      ["#5e7bb0", "100%"],
    ],
    paint: () => (
      <g>
        {[
          [24, 96, 30],
          [60, 64, 26],
          [92, 120, 24],
          [122, 40, 30],
          [158, 100, 26],
          [190, 72, 34],
          [230, 110, 24],
          [260, 52, 30],
          [296, 92, 28],
          [330, 70, 32],
          [368, 116, 28],
        ].map(([x, y, w], i) => (
          <rect key={i} x={x} y={y} width={w} height={240 - (y as number)} rx="1.5" fill="rgba(14,22,44,0.8)" />
        ))}
        <g fill="rgba(150,180,225,0.5)">
          {Array.from({ length: 40 }, (_, i) => (
            <rect key={i} x={28 + (i * 37) % 360} y={70 + ((i * 53) % 130)} width="3.5" height="5" />
          ))}
        </g>
      </g>
    ),
  },
  flags: {
    sky: [
      ["#4a6178", "0%"],
      ["#6e879e", "50%"],
      ["#9fb3c4", "100%"],
    ],
    paint: () => (
      <g>
        <rect x="0" y="172" width="480" height="68" fill="#3c4a5a" />
        {[60, 130, 200, 270, 340, 410].map((x, i) => {
          const colors = ["#d65745", "#4f86c6", "#54a06a", "#e0a94e", "#9b6fc0", "#46b0a8"];
          return (
            <g key={i}>
              <line x1={x} y1="70" x2={x} y2="178" stroke="rgba(220,224,230,0.85)" strokeWidth="2.4" />
              <path d={`M${x} 74 Q${x + 18} 80 ${x + 36} 74 L${x + 36} 100 Q${x + 18} 106 ${x} 100 Z`} fill={colors[i]} opacity="0.9" />
            </g>
          );
        })}
      </g>
    ),
  },
  ecb: {
    sky: [
      ["#16234a", "0%"],
      ["#26407e", "55%"],
      ["#3f63b0", "100%"],
    ],
    paint: () => (
      <g>
        <g transform="translate(150 70)">
          <path d="M40 0 L96 14 L96 170 L40 170 Z" fill="rgba(20,40,86,0.9)" />
          <path d="M40 0 L96 14 L96 170 L40 170 Z" fill="none" stroke="rgba(110,150,220,0.5)" strokeWidth="1.5" />
          <g stroke="rgba(120,160,230,0.45)" strokeWidth="1">
            {Array.from({ length: 9 }, (_, i) => (
              <line key={i} x1="40" y1={16 + i * 18} x2="96" y2={16 + i * 18 + 4} />
            ))}
          </g>
        </g>
        <g stroke="#f5c542" strokeWidth="3" fill="none" opacity="0.92">
          <path d="M60 150 Q44 168 60 186" />
          <line x1="50" y1="160" x2="70" y2="160" />
          <line x1="48" y1="176" x2="68" y2="176" />
        </g>
        <rect x="0" y="196" width="480" height="44" fill="#10203f" />
      </g>
    ),
  },
  imf: {
    sky: [
      ["#1c2c50", "0%"],
      ["#324a82", "52%"],
      ["#d2966a", "100%"],
    ],
    paint: () => (
      <g>
        <rect x="120" y="78" width="240" height="162" fill="rgba(18,30,58,0.88)" />
        <path d="M118 78 L240 50 L362 78 Z" fill="rgba(22,36,68,0.92)" />
        <g stroke="rgba(90,120,180,0.5)" strokeWidth="2">
          {[140, 172, 204, 236, 268, 300, 332].map((x, i) => (
            <line key={i} x1={x} y1="82" x2={x} y2="236" />
          ))}
        </g>
        <rect x="120" y="70" width="240" height="10" fill="rgba(28,44,80,0.95)" />
        <rect x="0" y="236" width="480" height="4" fill="#0e1c38" />
      </g>
    ),
  },
};

/**
 * Release cover. Custom uploads (any http(s) URL in the `scene` column) render
 * as an image; the built-in scene names render as generated SVG stills. Covers
 * never show a play affordance anywhere in the product.
 */
export function MediaTile({
  scene,
  radius = 12,
  className,
  style,
}: {
  scene: MediaScene | string;
  radius?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const id = useId().replace(/[:]/g, "");
  const isImageUrl = typeof scene === "string" && /^https:\/\//.test(scene);
  const def = SCENES[scene as MediaScene] ?? SCENES["wind-farm"];

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        borderRadius: radius,
        overflow: "hidden",
        background: "var(--surface-3)",
        ...style,
      }}
    >
      {isImageUrl ? (
        <img
          src={scene}
          alt=""
          loading="lazy"
          style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <svg
          viewBox="0 0 480 240"
          preserveAspectRatio="xMidYMid slice"
          width="100%"
          height="100%"
          style={{ display: "block" }}
          aria-hidden
        >
          <defs>
            <linearGradient id={`sky-${id}`} x1="0" y1="0" x2="0" y2="1">
              {def.sky.map(([c, o], i) => (
                <stop key={i} offset={o} stopColor={c} />
              ))}
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="480" height="240" fill={`url(#sky-${id})`} />
          {def.paint()}
          <rect x="0" y="0" width="480" height="240" fill="rgba(0,0,0,0.06)" />
        </svg>
      )}
    </div>
  );
}

