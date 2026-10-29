/** Tokens are consumed only on registered auth callback routes, never logged. */
export function parseAuthLink(value: string): {
  code?: string;
  accessToken?: string;
  refreshToken?: string;
  recovery: boolean;
} | null {
  try {
    const url = new URL(value);
    const path = `${url.hostname}${url.pathname}`.replace(/^\/+|\/+$/g, "");
    if (
      url.protocol !== "presspaper:" ||
      !["auth/callback", "reset-password"].includes(path)
    )
      return null;
    const params = new URLSearchParams(url.search);
    new URLSearchParams(url.hash.slice(1)).forEach((v, k) => params.set(k, v));
    if (params.has("error") || params.has("error_code"))
      throw new Error("This authentication link has expired.");
    const code = params.get("code") ?? undefined;
    const accessToken = params.get("access_token") ?? undefined;
    const refreshToken = params.get("refresh_token") ?? undefined;
    if (!code && !(accessToken && refreshToken)) return null;
    return {
      code,
      accessToken,
      refreshToken,
      recovery: path === "reset-password" || params.get("type") === "recovery",
    };
  } catch {
    return null;
  }
}
export const AUTH_CALLBACK = "presspaper://auth/callback";
export const PASSWORD_CALLBACK = "presspaper://reset-password";
