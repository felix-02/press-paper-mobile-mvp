import { useEffect, useRef, useState } from "react";
import { Languages, Check, Search } from "lucide-react";
import { LANGUAGES } from "@/data/languages";

export function LanguageMenu({
  value,
  onChange,
  busy,
  languages = LANGUAGES,
}: {
  value: string;
  onChange: (lang: string) => void;
  busy?: boolean;
  languages?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = languages.filter((l) => l.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="pp-btn pp-btn-outline"
        style={{ fontWeight: 500 }}
      >
        <Languages size={15} />
        {busy ? "Translating…" : value === "English" ? "Translate" : value.replace(/\s*\(.*\)$/, "")}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 268,
            background: "var(--surface-1)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-lg)",
            boxShadow: "var(--shadow-lg)",
            zIndex: 60,
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--border)", color: "var(--text-faint)" }}>
            <Search size={15} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search languages…"
              autoFocus
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--text)", fontSize: 13.5 }}
            />
          </div>
          <div style={{ maxHeight: 280, overflowY: "auto", padding: 6 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: "16px 12px", fontSize: 13, color: "var(--text-muted)", textAlign: "center" }}>No match</div>
            ) : (
              filtered.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => {
                    onChange(l);
                    setOpen(false);
                    setQ("");
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 10px",
                    borderRadius: "var(--r-md)",
                    fontSize: 13.5,
                    color: "var(--text)",
                    background: l === value ? "var(--surface-2)" : "transparent",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = l === value ? "var(--surface-2)" : "transparent")}
                >
                  {l}
                  {l === value && <Check size={14} color="var(--blue)" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
