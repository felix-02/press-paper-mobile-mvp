import posthog from "posthog-js";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

// Product analytics via PostHog (free tier). Entirely optional: with no
// VITE_POSTHOG_KEY every call is a no-op, so the app is unaffected. When a key
// is present, founders get real funnels, retention and active-user metrics in
// the PostHog dashboard — the usage data investors want to see.

const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || "https://us.i.posthog.com";

let enabled = false;
let lastPageview = "";
let lastPageviewAt = 0;

const SENSITIVE_KEY = /(token|secret|password|authorization|api[_-]?key|cookie|session|invite)/i;

function activityMetadata(props?: Record<string, unknown>): Record<string, unknown> {
  if (!props) return {};
  const entries = Object.entries(props)
    .filter(([key]) => !SENSITIVE_KEY.test(key))
    .filter(([, value]) => value === null || ["string", "number", "boolean"].includes(typeof value))
    .slice(0, 30);
  const safe = Object.fromEntries(entries);
  try {
    return JSON.stringify(safe).length <= 3500 ? safe : { metadata_truncated: true };
  } catch {
    return { metadata_invalid: true };
  }
}

function recordActivity(event: string, props?: Record<string, unknown>) {
  if (!isSupabaseConfigured || !supabase || !/^[a-z][a-z0-9_.-]{1,79}$/.test(event)) return;
  const releaseId = typeof props?.releaseId === "string"
    ? props.releaseId
    : event.startsWith("release_") && typeof props?.id === "string"
      ? props.id
      : null;
  const institutionSlug = typeof props?.slug === "string" ? props.slug : null;
  const targetType = releaseId ? "release" : institutionSlug ? "institution" : null;
  const targetId = (releaseId ?? institutionSlug)?.slice(0, 200) ?? null;
  void supabase.rpc("record_user_activity", {
    p_event_type: event,
    p_target_type: targetType,
    p_target_id: targetId,
    p_metadata: activityMetadata(props),
  }).then(() => undefined, () => undefined);
}

export function initAnalytics() {
  if (enabled || !KEY) return;
  try {
    posthog.init(KEY, {
      api_host: HOST,
      capture_pageview: false,
      capture_pageleave: false,
      autocapture: false,
      disable_session_recording: true,
      persistence: "localStorage",
    });
    enabled = true;
  } catch {
    enabled = false;
  }
}

export function track(event: string, props?: Record<string, unknown>) {
  recordActivity(event, props);
  if (enabled) {
    try {
      posthog.capture(event, props);
    } catch {
      /* ignore */
    }
  }
}

export function pageview(path: string) {
  const safePath = analyticsPath(path);
  const now = Date.now();
  // React StrictMode intentionally replays effects in development. Keep the
  // audit stream useful by suppressing only the immediate duplicate.
  if (safePath === lastPageview && now - lastPageviewAt < 1000) return;
  lastPageview = safePath;
  lastPageviewAt = now;
  recordActivity("page_viewed", { path: safePath });
  if (enabled) {
    try {
      posthog.capture("$pageview", { $current_url: safePath });
    } catch {
      /* ignore */
    }
  }
}

export function analyticsPath(path: string): string {
  try {
    const url = new URL(path, "https://presspaper.invalid");
    return url.pathname
      .replace(/^\/join\/[^/]+/i, "/join/[redacted]")
      .replace(/^\/institution-invite\/[^/]+/i, "/institution-invite/[redacted]");
  } catch {
    return "/invalid-path";
  }
}

export function identifyUser(id: string, props?: Record<string, unknown>) {
  if (!enabled) return;
  try {
    posthog.identify(id, props);
  } catch {
    /* ignore */
  }
}

export function resetAnalytics() {
  if (!enabled) return;
  try {
    posthog.reset();
  } catch {
    /* ignore */
  }
}
