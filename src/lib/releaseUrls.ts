import type { Release } from "@/types";

export const RELEASE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isReleaseUuid(id: string): boolean {
  return RELEASE_UUID.test(id);
}

export function releasePath(id: string): string {
  return `/release/${encodeURIComponent(id)}`;
}

function absoluteUrl(path: string): string {
  const configured =
    process.env.EXPO_PUBLIC_SITE_URL || "https://presspaper.ai";
  try {
    const origin = new URL(configured);
    if (origin.protocol !== "https:" || origin.username || origin.password)
      throw new Error("Unsafe site URL");
    return `${origin.origin}${path}`;
  } catch {
    return `https://presspaper.ai${path}`;
  }
}

/** UUID-backed published releases have an SSR share page; all others use the SPA. */
export function releaseShareUrl(
  release: Pick<Release, "id" | "status">,
): string {
  const path =
    isReleaseUuid(release.id) && release.status === "Published"
      ? `/r/${encodeURIComponent(release.id)}`
      : releasePath(release.id);
  return absoluteUrl(path);
}
