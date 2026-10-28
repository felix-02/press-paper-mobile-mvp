import { useState } from "react";
import { MessageSquare, Trash2 } from "lucide-react";
import { Avatar } from "@/components/brand/Avatar";
import { useComments, type CommentNode } from "@/lib/useComments";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/store/useAppStore";

export function CommentThread({ releaseId, canModerate = false, onCommentPosted }: { releaseId: string; canModerate?: boolean; onCommentPosted?: () => void }) {
  const { profile, user } = useAuth();
  const pushToast = useAppStore((s) => s.pushToast);
  const { tree, post, posting, loading, loadError, postError, reload } = useComments(releaseId);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const submit = async () => {
    const t = draft.trim();
    if (!t) return;
    if (await post(t)) {
      setDraft("");
      onCommentPosted?.();
    }
  };

  const submitReply = async (parentId: string) => {
    const t = replyDraft.trim();
    if (!t) return;
    if (await post(t, parentId)) {
      setReplyDraft("");
      setReplyTo(null);
      onCommentPosted?.();
    }
  };

  const removeComment = async (id: string) => {
    if (!supabase) return;
    const { error } = await supabase.from("comments").delete().eq("id", id);
    if (error) {
      pushToast({ title: "Couldn't remove comment", variant: "error" });
      return;
    }
    pushToast({ title: "Comment removed", variant: "info" });
    reload();
  };

  const renderNode = (c: CommentNode, depth: number) => {
    return (
      <div key={c.id} style={{ display: "flex", gap: 12, marginLeft: depth ? 44 : 0 }}>
        <Avatar name={c.author} size={depth ? 30 : 36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>{c.author}</span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>· {c.time}</span>
          </div>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.55, marginTop: 5 }}>{c.body}</p>
          <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
            {(canModerate || (user && c.authorId === user.id)) && (
              <button
                type="button"
                onClick={() => void removeComment(c.id)}
                title={canModerate ? "Remove this comment from your release" : "Delete your comment"}
                style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "var(--text-muted)" }}
              >
                <Trash2 size={12} /> Remove
              </button>
            )}
            {depth === 0 && (
              <button
                type="button"
                onClick={() => {
                  setReplyTo(replyTo === c.id ? null : c.id);
                  setReplyDraft("");
                }}
                style={{ fontSize: 12.5, color: "var(--text-muted)" }}
              >
                Reply
              </button>
            )}
          </div>

          {replyTo === c.id && (
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <Avatar name={profile?.full_name ?? undefined} size={28} />
              <div style={{ flex: 1 }}>
                <textarea
                  className="pp-input"
                  placeholder={`Reply to ${c.author}…`}
                  value={replyDraft}
                  maxLength={4000}
                  onChange={(e) => setReplyDraft(e.target.value)}
                  rows={2}
                  autoFocus
                  style={{ resize: "vertical", lineHeight: 1.5, fontFamily: "inherit" }}
                />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                  <button type="button" onClick={() => setReplyTo(null)} className="pp-btn pp-btn-ghost" style={{ padding: "6px 12px", fontSize: 12.5 }}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => submitReply(c.id)}
                    disabled={posting || loading || Boolean(loadError) || !replyDraft.trim()}
                    className="pp-btn pp-btn-blue"
                    style={{ padding: "6px 14px", fontSize: 12.5, opacity: posting || loading || loadError || !replyDraft.trim() ? 0.6 : 1 }}
                  >
                    Reply
                  </button>
                </div>
              </div>
            </div>
          )}

          {c.replies.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
              {c.replies.map((r) => renderNode(r, depth + 1))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 22 }}>
        <Avatar name={profile?.full_name ?? undefined} size={36} />
        <div style={{ flex: 1 }}>
          <textarea
            className="pp-input"
            placeholder="Add a thoughtful comment…"
            value={draft}
            disabled={loading || Boolean(loadError)}
            maxLength={4000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
            rows={2}
            style={{ resize: "vertical", lineHeight: 1.5, fontFamily: "inherit" }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
            <button
              type="button"
              onClick={submit}
              disabled={posting || loading || Boolean(loadError) || !draft.trim()}
              className="pp-btn pp-btn-blue"
              style={{ padding: "7px 16px", fontSize: 13, opacity: posting || loading || loadError || !draft.trim() ? 0.6 : 1 }}
            >
              {posting ? "Posting…" : "Comment"}
            </button>
          </div>
        </div>
      </div>

      {postError && (
        <div role="alert" style={{ margin: "-10px 0 18px 48px", color: "var(--red)", fontSize: 13 }}>{postError}</div>
      )}

      {loading ? (
        <div role="status" aria-live="polite" style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-muted)", fontSize: 13.5 }}>
          <MessageSquare size={15} /> Loading comments…
        </div>
      ) : loadError ? (
        <div role="alert" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, color: "var(--text-secondary)", fontSize: 13.5 }}>
          <span>{loadError}</span>
          <button type="button" className="pp-btn pp-btn-outline" onClick={reload} style={{ padding: "6px 12px", fontSize: 12.5 }}>Try again</button>
        </div>
      ) : tree.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-muted)", fontSize: 13.5 }}>
          <MessageSquare size={15} /> Be the first to comment on this release.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>{tree.map((c) => renderNode(c, 0))}</div>
      )}
    </div>
  );
}
