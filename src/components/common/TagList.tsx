import { useEffect, useRef, useState } from "react";
import { Tag } from "@/components/primitives/Bits";

/** Renders up to `max` tags inline; the rest collapse into a "+N" chip that
 *  opens a small popover listing every tag. */
export function TagList({ tags, max = 2, extra = 0 }: { tags: string[]; max?: number; extra?: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (tags.length === 0 && extra === 0) return null;
  const shown = tags.slice(0, max);
  const hidden = tags.slice(max);
  const hiddenCount = hidden.length + extra;

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap", position: "relative" }} ref={ref}>
      {shown.map((t) => (
        <Tag key={t}>{t}</Tag>
      ))}
      {hiddenCount > 0 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setOpen((v) => !v);
            }}
            style={{
              fontSize: 11.5,
              fontWeight: 600,
              color: "var(--text-secondary)",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 999,
              padding: "3px 9px",
              cursor: "pointer",
            }}
          >
            +{hiddenCount}
          </button>
          {open && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                left: 0,
                zIndex: 50,
                background: "var(--surface-1)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-md)",
                boxShadow: "var(--shadow-lg)",
                padding: 10,
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                maxWidth: 280,
                minWidth: 140,
              }}
            >
              {tags.map((t) => (
                <Tag key={t}>{t}</Tag>
              ))}
              {extra > 0 && <span style={{ fontSize: 11.5, color: "var(--text-muted)", alignSelf: "center" }}>+{extra} additional topics</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
