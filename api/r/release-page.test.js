import { afterEach, describe, expect, it } from "vitest";
import { contentSecurityPolicy, esc, publicOrigin, safeJsonLd, validatedOrigin, xmlSafeText } from "./[id].js";

const originalPublicSiteUrl = process.env.PUBLIC_SITE_URL;

afterEach(() => {
  if (originalPublicSiteUrl === undefined) delete process.env.PUBLIC_SITE_URL;
  else process.env.PUBLIC_SITE_URL = originalPublicSiteUrl;
});

describe("public release page helpers", () => {
  it("escapes HTML and JSON-LD script boundaries", () => {
    expect(esc('<img src=x onerror="x">')).toBe("&lt;img src=x onerror=&quot;x&quot;&gt;");
    expect(safeJsonLd({ value: "</script><script>alert(1)</script>" })).not.toContain("</script>");
  });

  it("converts rich HTML to inert article text", () => {
    expect(xmlSafeText("<p>Hello <strong>world</strong></p>")).toBe("Hello world");
  });

  it("requires HTTPS for non-loopback configured origins", () => {
    expect(validatedOrigin("https://presspaper.example")).toBe("https://presspaper.example");
    expect(validatedOrigin("http://presspaper.example")).toBeNull();
    expect(validatedOrigin("https://user@presspaper.example")).toBeNull();
  });

  it("does not trust a production Host header", () => {
    delete process.env.PUBLIC_SITE_URL;
    expect(publicOrigin({ headers: { host: "evil.example", "x-forwarded-proto": "https" } })).toBe("https://presspaper.ai");
  });

  it("allows only the nonce-bearing metadata script", () => {
    expect(contentSecurityPolicy("abc123")).toContain("script-src 'nonce-abc123'");
  });
});
