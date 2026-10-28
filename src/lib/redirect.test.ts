import { describe, expect, it } from "vitest";
import { isSensitiveRedirect, safeRedirectTarget, withNext } from "./redirect";

describe("safeRedirectTarget", () => {
  it("accepts same-origin application paths", () => {
    expect(safeRedirectTarget("/release/abc?tab=about#comments")).toBe("/release/abc?tab=about#comments");
  });

  it.each([
    "https://evil.example/path",
    "//evil.example/path",
    "/\\evil.example/path",
    "javascript:alert(1)",
    "login",
  ])("rejects unsafe target %s", (target) => {
    expect(safeRedirectTarget(target)).toBeNull();
  });

  it("encodes nested redirect parameters", () => {
    expect(withNext("/login", "/join/a?x=1")).toBe("/login?next=%2Fjoin%2Fa%3Fx%3D1");
  });

  it("identifies bearer-token invitation routes", () => {
    expect(isSensitiveRedirect("/join/secret-token")).toBe(true);
    expect(isSensitiveRedirect("/institution-invite/secret-token")).toBe(true);
    expect(isSensitiveRedirect("/release/public-id")).toBe(false);
  });
});
