import { useId } from "react";
import { initialsOf } from "@/lib/initials";

/** Individual user avatar — a premium gradient disc with initials. */
export function Avatar({
  initials,
  name,
  size = 32,
  ring = false,
}: {
  initials?: string;
  name?: string;
  size?: number;
  ring?: boolean;
}) {
  const id = useId().replace(/[:]/g, "");
  const label = initials ?? (name ? initialsOf(name) : "PB");
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="Your profile"
      style={{ flexShrink: 0, display: "block" }}
    >
      <defs>
        <linearGradient id={`av-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
        <linearGradient id={`avh-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.28)" />
          <stop offset="55%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="50" fill={`url(#av-${id})`} />
      <circle cx="50" cy="50" r="50" fill={`url(#avh-${id})`} />
      {ring && (
        <circle cx="50" cy="50" r="48" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" />
      )}
      <text
        x="50"
        y="52"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="var(--font-sans)"
        fontSize="38"
        fontWeight={600}
        letterSpacing="-1"
        fill="#fff"
      >
        {label}
      </text>
    </svg>
  );
}
