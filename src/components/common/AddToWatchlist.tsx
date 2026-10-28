import { useEffect, useRef, useState } from "react";
import { ListPlus, Plus, Check } from "lucide-react";
import { useWatchlists } from "@/lib/useWatchlists";
import { useAppStore } from "@/store/useAppStore";

export function AddToWatchlist({ releaseId }: { releaseId: string }) {
  const { lists, available, create, addItem, inList } = useWatchlists();
  const pushToast = useAppStore((s) => s.pushToast);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (!available) return null; // watchlists require the backend

  const add = async (id: string, listName: string, already: boolean) => {
    if (already) {
      pushToast({ title: `Already in ${listName}`, variant: "info" });
      return;
    }
    const added = await addItem(id, releaseId);
    pushToast({ title: added ? `Added to ${listName}` : "Couldn't update watchlist", variant: added ? "success" : "info" });
  };

  const createAndAdd = async () => {
    const n = name.trim();
    if (!n) return;
    setName("");
    setCreating(false);
    const wl = await create(n);
    if (wl) await add(wl.id, wl.name, false);
    else pushToast({ title: "Couldn't create watchlist", variant: "error" });
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" className="pp-btn pp-btn-outline" onClick={() => setOpen((v) => !v)}>
        <ListPlus size={15} /> Add to list
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 248,
            background: "var(--surface-1)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-lg)",
            boxShadow: "var(--shadow-lg)",
            padding: 6,
            zIndex: 50,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0", padding: "6px 10px" }}>
            Add to watchlist
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {lists.length === 0 && !creating && (
              <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "8px 10px" }}>No watchlists yet.</div>
            )}
            {lists.map((l) => {
              const done = inList(l.id, releaseId);
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => add(l.id, l.name, done)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", textAlign: "left", padding: "9px 10px", borderRadius: "var(--r-md)", fontSize: 13.5, background: "transparent", color: done ? "var(--text-muted)" : "var(--text)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.name}</span>
                  {done ? <Check size={15} color="var(--green)" /> : <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{l.count}</span>}
                </button>
              );
            })}
          </div>

          {creating ? (
            <div style={{ display: "flex", gap: 6, padding: "8px 6px 4px" }}>
              <input
                className="pp-input"
                placeholder="List name"
                value={name}
                maxLength={80}
                autoFocus
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createAndAdd();
                }}
                style={{ padding: "7px 10px", fontSize: 13 }}
              />
              <button type="button" onClick={createAndAdd} disabled={!name.trim()} className="pp-btn pp-btn-blue" style={{ padding: "7px 12px", fontSize: 12.5, opacity: name.trim() ? 1 : 0.6 }}>
                Add
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 10px", borderRadius: "var(--r-md)", fontSize: 13.5, color: "var(--blue)", fontWeight: 600, marginTop: 4, borderTop: "1px solid var(--border)", background: "transparent" }}
            >
              <Plus size={15} /> Create new list
            </button>
          )}
        </div>
      )}
    </div>
  );
}
