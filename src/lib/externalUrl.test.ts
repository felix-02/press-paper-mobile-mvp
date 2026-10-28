import { describe, expect, it } from "vitest";
import { externalUrlLabel, safeExternalUrl } from "./externalUrl";

describe("safeExternalUrl", () => {
  it("normalizes domains and permits HTTP(S)", () => {
    expect(safeExternalUrl("example.gov/path")).toBe("https://example.gov/path");
    expect(safeExternalUrl("http://localhost:3000/docs")).toBe("http://localhost:3000/docs");
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "https://user:pass@example.com/",
    "https://exa\u0000mple.com",
  ])("rejects unsafe URL %s", (url) => {
    expect(safeExternalUrl(url)).toBeNull();
  });

  it("creates a compact display label", () => {
    expect(externalUrlLabel("https://www.example.gov/path/")).toBe("www.example.gov/path/");
  });
});
