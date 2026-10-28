export function safeRedirectTarget(value: string | null | undefined): string | null {
  if (!value) return null;

  try {
    const base = new URL("https://presspaper.invalid/");
    const target = new URL(value, base);
    if (target.origin !== base.origin || !value.startsWith("/") || value.startsWith("//")) return null;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}

export function withNext(path: string, next: string): string {
  return `${path}?next=${encodeURIComponent(next)}`;
}

export function isSensitiveRedirect(path: string | null): boolean {
  return !!path && (/^\/join\/[^/]+/i.test(path) || /^\/institution-invite\/[^/]+/i.test(path));
}
