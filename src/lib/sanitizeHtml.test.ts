// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { sanitizeRichText } from "./sanitizeHtml";

describe("sanitizeRichText", () => {
  it("removes executable markup and event handlers", () => {
    const result = sanitizeRichText('<p onclick="alert(1)">Safe<img src=x onerror=alert(1)><script>alert(2)</script></p>');
    expect(result).toBe("<p>Safe</p>");
  });

  it("removes unsafe link protocols and protocol-relative links", () => {
    const result = sanitizeRichText('<a href="javascript:alert(1)">one</a><a href="//evil.example">two</a>');
    expect(result).toBe("<a>one</a><a>two</a>");
  });

  it("keeps the intentionally small rich-text format", () => {
    const result = sanitizeRichText('<h2 data-x="1">Title</h2><p><strong>Text</strong> <a href="https://example.gov" target="_blank">source</a></p>');
    expect(result).toContain("<h2>Title</h2>");
    expect(result).toContain('<a href="https://example.gov">source</a>');
    expect(result).not.toContain("target=");
    expect(result).not.toContain("data-x");
  });
});
