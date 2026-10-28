import type { Release } from "@/types";

export const RELEASE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isReleaseUuid(id: string): boolean {
  return RELEASE_UUID.test(id);
}

export function releasePath(id: string): string {
  return `/release/${encodeURIComponent(id)}`;
}

function absoluteUrl(path: string): string {
  if (typeof window === "undefined") return path;
  if (!/^https?:\/\//i.test(window.location.origin)) return path;
  return `${window.location.origin}${path}`;
}

/** UUID-backed published releases have an SSR share page; all others use the SPA. */
export function releaseShareUrl(release: Pick<Release, "id" | "status">): string {
  const path = isReleaseUuid(release.id) && release.status === "Published"
    ? `/r/${encodeURIComponent(release.id)}`
    : releasePath(release.id);
  return absoluteUrl(path);
}
