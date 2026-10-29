import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeRichText } from "../src/lib/sanitizeHtml.ts";

test("keeps publication formatting and valid links while removing active content", () => {
  const html = sanitizeRichText(
    '<h2>News</h2><p>Hello <strong>world</strong> <a href="https://example.org" onclick="alert(1)">source</a></p><script>alert(1)</script><iframe src="evil"></iframe>',
  );
  assert.equal(
    html,
    '<h2>News</h2><p>Hello <strong>world</strong> <a href="https://example.org">source</a></p>',
  );
});

test("rejects encoded script protocols, protocol-relative URLs and control characters", () => {
  for (const href of [
    "javascript:alert(1)",
    "&#106;avascript:alert(1)",
    "//evil.invalid",
    "java&#10;script:alert(1)",
    "https:\\evil.invalid",
  ]) {
    assert.equal(sanitizeRichText(`<a href="${href}">link</a>`), "<a>link</a>");
  }
});

test("escapes decoded text so sanitization cannot manufacture executable tags", () => {
  assert.equal(
    sanitizeRichText("<p>&lt;img src=x onerror=alert(1)&gt;</p>"),
    "<p>&lt;img src=x onerror=alert(1)&gt;</p>",
  );
});
