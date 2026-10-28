import { Link } from "react-router-dom";

/**
 * The Presspaper wordmark. Rendered as clean type (as drawn in every screen)
 * with a small geometric glyph. `to` makes it a link; omit for a plain mark.
 */
export function Logo({
  size = 20,
  to,
  onLight = false,
}: {
  size?: number;
  to?: string;
  onLight?: boolean;
}) {
  const color = onLight ? "#0a0a0a" : "var(--text)";
  const inner = (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 9,
        userSelect: "none",
      }}
    >
      <svg
        width={size * 1.05}
        height={size * 1.05}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
      >
        <rect
          x="3"
          y="3"
          width="18"
          height="18"
          rx="5"
          fill={onLight ? "#0a0a0a" : "var(--text)"}
        />
        <path
          d="M8 7.5h4.6a3.2 3.2 0 0 1 0 6.4H10.4V17"
          stroke={onLight ? "#fff" : "#0a0a0a"}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span
        style={{
          fontSize: size,
          fontWeight: 600,
          letterSpacing: "0",
          color,
        }}
      >
        Presspaper
      </span>
    </span>
  );

  if (to) {
    return (
      <Link to={to} aria-label="Presspaper home">
        {inner}
      </Link>
    );
  }
  return inner;
}
