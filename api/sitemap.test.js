import { afterEach, describe, expect, it } from "vitest";
import { publicOrigin, validatedOrigin, xml } from "./sitemap.js";

const originalPublicSiteUrl = process.env.PUBLIC_SITE_URL;

afterEach(() => {
  if (originalPublicSiteUrl === undefined) delete process.env.PUBLIC_SITE_URL;
  else process.env.PUBLIC_SITE_URL = originalPublicSiteUrl;
});

describe("sitemap helpers", () => {
  it("escapes XML", () => {
    expect(xml('a&<b>"')).toBe("a&amp;&lt;b&gt;&quot;");
  });

  it("accepts a configured origin and ignores arbitrary hosts", () => {
    process.env.PUBLIC_SITE_URL = "https://news.example";
    expect(publicOrigin({ headers: { host: "evil.example" } })).toBe("https://news.example");
    expect(validatedOrigin("https://news.example/path")).toBeNull();
  });
});
