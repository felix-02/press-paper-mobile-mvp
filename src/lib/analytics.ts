import { isSupabaseConfigured, supabase } from "@/lib/supabase";
const SENSITIVE_KEY =
  /(token|secret|password|authorization|api[_-]?key|cookie|session|invite)/i;

function activityMetadata(
  props?: Record<string, unknown>,
): Record<string, unknown> {
  if (!props) return {};
  const entries = Object.entries(props)
    .filter(([key]) => !SENSITIVE_KEY.test(key))
    .filter(
      ([, value]) =>
        value === null ||
        ["string", "number", "boolean"].includes(typeof value),
    )
    .slice(0, 30);
  const safe = Object.fromEntries(entries);
  try {
    return JSON.stringify(safe).length <= 3500
      ? safe
      : { metadata_truncated: true };
  } catch {
    return { metadata_invalid: true };
  }
}

function recordActivity(event: string, props?: Record<string, unknown>) {
  if (
    !isSupabaseConfigured ||
    !supabase ||
    !/^[a-z][a-z0-9_.-]{1,79}$/.test(event)
  )
    return;
  const releaseId =
    typeof props?.releaseId === "string"
      ? props.releaseId
      : event.startsWith("release_") && typeof props?.id === "string"
        ? props.id
        : null;
  const institutionSlug = typeof props?.slug === "string" ? props.slug : null;
  const targetType = releaseId
    ? "release"
    : institutionSlug
      ? "institution"
      : null;
  const targetId = (releaseId ?? institutionSlug)?.slice(0, 200) ?? null;
  void supabase
    .rpc("record_user_activity", {
      p_event_type: event,
      p_target_type: targetType,
      p_target_id: targetId,
      p_metadata: activityMetadata(props),
    })
    .then(
      () => undefined,
      () => undefined,
    );
}

// Native records the same bounded activity events without a browser SDK.
export function initAnalytics() {}
export function identifyUser(_id: string, _props?: Record<string, unknown>) {}
export function resetAnalytics() {
  lastPath = "";
}
export function track(event: string, props?: Record<string, unknown>) {
  recordActivity(event, props);
}
let lastPath = "";
let lastAt = 0;
export function analyticsPath(path: string): string {
  try {
    return new URL(path, "https://presspaper.invalid").pathname
      .replace(/^\/join\/[^/]+/i, "/join/[redacted]")
      .replace(
        /^\/institution-invite\/[^/]+/i,
        "/institution-invite/[redacted]",
      );
  } catch {
    return "/invalid-path";
  }
}
export function pageview(path: string) {
  const safe = analyticsPath(path),
    now = Date.now();
  if (safe === lastPath && now - lastAt < 1000) return;
  lastPath = safe;
  lastAt = now;
  recordActivity("page_viewed", { path: safe, platform: "native" });
}
