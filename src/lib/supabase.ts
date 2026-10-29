import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createClient,
  processLock,
  type SupabaseClient,
} from "@supabase/supabase-js";

// Expo replaces these public values at bundle time. Only a publishable/anon key
// belongs here; authorization remains in Postgres RLS and checked RPCs.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const isSupabaseConfigured = Boolean(url && anonKey);
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: "pkce",
        lock: processLock,
      },
    })
  : null;

export interface ReleaseRow {
  id: string;
  owner: string;
  institution_slug: string;
  institution_name: string | null;
  type: string;
  status: "Published" | "Draft" | "Scheduled" | "Archived";
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
