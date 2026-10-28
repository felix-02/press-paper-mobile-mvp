/**
 * Shared underline tab row (Saved, Profile, public institution pages…).
 * One implementation so spacing, weight and the active indicator never drift.
 */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  style,
}: {
  tabs: readonly T[];
  active: T;
  onChange: (tab: T) => void;
  style?: React.CSSProperties;
}) {
  return (
    <div role="tablist" style={{ display: "flex", gap: 26, borderBottom: "1px solid var(--border)", ...style }}>
      {tabs.map((tab) => {
        const selected = active === tab;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab)}
            style={{
              fontSize: 14,
              fontWeight: selected ? 600 : 500,
              padding: "10px 2px",
              color: selected ? "var(--text)" : "var(--text-muted)",
              borderBottom: `2px solid ${selected ? "var(--text)" : "transparent"}`,
              marginBottom: -1,
              transition: "color 140ms ease, border-color 140ms ease",
            }}
          >
            {tab}
          </button>
        );
      })}
    </div>
  );
}
