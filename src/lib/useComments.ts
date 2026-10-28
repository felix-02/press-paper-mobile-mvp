import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";
import { track } from "@/lib/analytics";
import { invalidateEngagement } from "@/lib/engagement";

interface CommentRow {
  id: string;
  release_id: string;
  parent_id: string | null;
  author: string;
  author_name: string | null;
  body: string;
  created_at: string;
}

export interface CommentNode {
  id: string;
  parentId: string | null;
  author: string;
  authorId: string;
  body: string;
  time: string;
  replies: CommentNode[];
}

function rowToComment(r: CommentRow): CommentNode {
  return {
    id: r.id,
    parentId: r.parent_id,
    author: r.author_name || "Reader",
    authorId: r.author,
    body: r.body,
    time: relative(r.created_at),
    replies: [],
  };
}

function relative(iso: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 45) return "Just now";
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function buildTree(rows: CommentNode[]): CommentNode[] {
  const byId = new Map<string, CommentNode>();
  rows.forEach((comment) => byId.set(comment.id, { ...comment, replies: [] }));
  const roots: CommentNode[] = [];
  byId.forEach((node) => {
    if (node.parentId && byId.has(node.parentId)) byId.get(node.parentId)!.replies.push(node);
    else roots.push(node);
  });
  return roots;
}

/** Threaded comments loaded from and persisted to the comments table. */
export function useComments(releaseId: string) {
  const { user, profile } = useAuth();
  const [rows, setRows] = useState<CommentNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [postError, setPostError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!supabase) {
      setRows([]);
      setLoading(false);
      setLoadError("Comments are unavailable because the database connection is not configured.");
      return;
    }
    let active = true;
    setRows([]);
    setLoading(true);
    setLoadError(null);
    setPostError(null);

    void (async () => {
      try {
        const { data, error } = await supabase
          .from("comments")
          .select("*")
          .eq("release_id", releaseId)
          .order("created_at", { ascending: true });
        if (!active) return;
        if (error) {
          setLoadError("Comments couldn't be loaded. Try again.");
          setLoading(false);
          return;
        }
        setRows(((data as CommentRow[] | null) ?? []).map(rowToComment));
        setLoading(false);
      } catch {
        if (!active) return;
        setLoadError("Comments couldn't be loaded. Check your connection and try again.");
        setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [releaseId, retryKey]);

  const post = async (body: string, parentId?: string | null): Promise<boolean> => {
    const text = body.trim();
    if (!text || posting) return false;
    if (text.length > 4000) {
      setPostError("Comments must be 4,000 characters or fewer.");
      return false;
    }
    if (!supabase || !user || loading || loadError) {
      setPostError("Comments aren't available right now. Try reloading the thread.");
      return false;
    }
    setPosting(true);
    setPostError(null);
    try {
      const { data, error: insertError } = await supabase
        .from("comments")
        .insert({ release_id: releaseId, author: user.id, author_name: profile?.full_name?.trim() || null, body: text, parent_id: parentId ?? null })
        .select("*")
        .single();
      if (insertError || !data) {
        setPosting(false);
        setPostError("Your comment wasn't posted. Please try again.");
        return false;
      }
      setRows((current) => [...current, rowToComment(data as CommentRow)]);
      track("comment_posted", { releaseId, isReply: !!parentId });
      invalidateEngagement(releaseId);
      setPosting(false);
      return true;
    } catch {
      setPosting(false);
      setPostError("Your comment wasn't posted. Check your connection and try again.");
      return false;
    }
  };

  const tree = buildTree(rows);
  const reload = () => setRetryKey((key) => key + 1);
  return { tree, post, posting, loading, loadError, postError, reload };
}
