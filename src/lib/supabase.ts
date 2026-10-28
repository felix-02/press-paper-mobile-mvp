import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Runtime data is always Supabase-backed. Tests deliberately run without a
// client so pure UI and mapping logic can be verified in isolation.
const isTestMode = import.meta.env.MODE === "test";
const requestedMode = isTestMode ? "test" : (import.meta.env.VITE_APP_MODE as string | undefined)?.toLowerCase() ?? "live";
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!isTestMode && requestedMode !== "live") {
  throw new Error('VITE_APP_MODE must be "live". Only database-backed runtime mode is supported.');
}

if (Boolean(url) !== Boolean(anonKey)) {
  throw new Error("VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be configured together.");
}

if (!isTestMode && (!url || !anonKey)) {
  throw new Error("Supabase is required. Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
}

export const isSupabaseConfigured = !isTestMode && Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true, // keeps the session across refreshes (localStorage)
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

// Shape of a row in public.releases (kept loose on purpose).
export interface ReleaseRow {
  id: string;
  owner: string;
  institution_slug: string;
  institution_name: string | null;
  type: string;
  status: "Published" | "Draft" | "Scheduled";
  heading: string;
  subheading: string | null;
  body: string | null;
  scene: string;
  published_at: string | null;
  created_at: string;
  views?: number;
  comments_count?: number;
  institution_verified?: boolean;
  moderation_status?: "active" | "archived" | "deleted";
  revision_count?: number;
  last_edited_at?: string | null;
  moderation_reason?: string | null;
  moderation_changed_at?: string | null;
}
