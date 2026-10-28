import { useEffect, useState } from "react";
import { History, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";
import { useAppStore } from "@/store/useAppStore";
import type { Release } from "@/types";

/** "Edited" chip + read-only previous-versions viewer (release_revisions). */
export function EditedBadge({ release }: { release: Release }) {
  const [open, setOpen] = useState(false);
  const [revisions, setRevisions] = useState<{ id: string; heading: string; subheading: string | null; body: string | null; created_at: string }[] | null>(null);

  useEffect(() => {
    if (!open || revisions !== null || !supabase) return;
    void supabase
      .from("release_revisions")
      .select("id, heading, subheading, body, created_at")
      .eq("release_id", release.id)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setRevisions((data as typeof revisions) ?? []));
  }, [open, revisions, release.id]);

  if (!release.revisionCount) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="This release was edited after publication — view previous versions"
        style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "var(--text-muted)", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-pill)", padding: "3px 10px" }}
      >
        <History size={12} /> Edited
      </button>
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(0,0,0,0.6)", display: "grid", placeItems: "center", padding: 20 }}>
          <div role="dialog" aria-modal="true" aria-label="Previous versions" onClick={(e) => e.stopPropagation()} className="pp-card" style={{ width: "100%", maxWidth: 640, maxHeight: "80vh", overflowY: "auto", padding: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700 }}>Previous versions</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" style={{ color: "var(--text-muted)" }}><X size={18} /></button>
            </div>
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 14 }}>Read-only record of this release before each published edit. Newest first.</p>
            {revisions === null ? (
              <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Loading…</div>
            ) : revisions.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>No previous versions recorded.</div>
            ) : (
              revisions.map((rev, idx) => (
                <div key={rev.id} style={{ borderTop: "1px solid var(--border)", padding: "14px 0" }}>
                  <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginBottom: 6 }}>
                    Version {revisions.length - idx} · until {new Date(rev.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 650 }}>{rev.heading}</div>
                  {rev.subheading && <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>{rev.subheading}</div>}
                  {rev.body && (
                    <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 8, whiteSpace: "pre-wrap", maxHeight: 140, overflowY: "auto", background: "var(--surface-2)", borderRadius: 8, padding: 10 }}>
                      {rev.body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}

const REACTIONS: { key: string; emoji: string; label: string }[] = [
  { key: "like", emoji: "👍", label: "Like" },
  { key: "love", emoji: "❤️", label: "Love" },
  { key: "laugh", emoji: "😄", label: "Laugh" },
  { key: "wow", emoji: "😮", label: "Wow" },
  { key: "sad", emoji: "😢", label: "Sad" },
  { key: "celebrate", emoji: "🎉", label: "Celebrate" },
];

/** Like + five standard reactions; one active reaction per user per release. */
export function ReactionBar({ releaseId }: { releaseId: string }) {
  const { user } = useAuth();
  const pushToast = useAppStore((s) => s.pushToast);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [mine, setMine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.rpc("release_reaction_counts", { p_release: releaseId }).then(({ data }) => {
      if (!active) return;
      const next: Record<string, number> = {};
      ((data as { reaction: string; count: number }[] | null) ?? []).forEach((row) => { next[row.reaction] = Number(row.count) || 0; });
      setCounts(next);
    });
    if (user) {
      void supabase.from("release_reactions").select("reaction").eq("release_id", releaseId).eq("user_id", user.id).maybeSingle()
        .then(({ data }) => { if (active) setMine((data as { reaction: string } | null)?.reaction ?? null); });
    }
    return () => { active = false; };
  }, [releaseId, user]);

  const react = async (key: string) => {
    if (!supabase || !user) {
      pushToast({ title: "Sign in to react", variant: "info" });
      return;
    }
    if (busy) return;
    setBusy(true);
    const previous = mine;
    const removing = previous === key;
    // optimistic
    setMine(removing ? null : key);
    setCounts((c) => {
      const next = { ...c };
      if (previous) next[previous] = Math.max(0, (next[previous] ?? 0) - 1);
      if (!removing) next[key] = (next[key] ?? 0) + 1;
      return next;
    });
    const result = removing
      ? await supabase.from("release_reactions").delete().eq("release_id", releaseId).eq("user_id", user.id)
      : await supabase.from("release_reactions").upsert({ release_id: releaseId, user_id: user.id, reaction: key }, { onConflict: "release_id,user_id" });
    setBusy(false);
    if (result.error) {
      setMine(previous);
      pushToast({ title: "Couldn't save your reaction", variant: "error" });
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }} aria-label="Reactions">
      {REACTIONS.map(({ key, emoji, label }) => {
        const isMine = mine === key;
        const count = counts[key] ?? 0;
        return (
          <button
            key={key}
            type="button"
            onClick={() => void react(key)}
            title={label}
            aria-pressed={isMine}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              padding: "5px 11px",
              borderRadius: "var(--r-pill)",
              border: `1px solid ${isMine ? "color-mix(in srgb, var(--blue) 45%, transparent)" : "var(--border)"}`,
              background: isMine ? "var(--accent-soft)" : "var(--surface-2)",
              color: isMine ? "var(--blue)" : "var(--text-secondary)",
              fontWeight: isMine ? 650 : 500,
            }}
          >
            <span aria-hidden>{emoji}</span>
            {count > 0 && <span>{count.toLocaleString()}</span>}
          </button>
        );
      })}
    </div>
  );
}
