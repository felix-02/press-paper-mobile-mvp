import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  contentSecurityPolicy,
  esc,
  publicOrigin,
  safeJsonLd,
  validatedOrigin,
  xmlSafeText,
} from "../api/r/[id].js";
const original = process.env.PUBLIC_SITE_URL;
afterEach(() => {
  if (original === undefined) delete process.env.PUBLIC_SITE_URL;
  else process.env.PUBLIC_SITE_URL = original;
});
test("escapes HTML and JSON-LD script boundaries", () => {
  assert.equal(
    esc('<img src=x onerror="x">'),
    "&lt;img src=x onerror=&quot;x&quot;&gt;",
  );
  assert.ok(
    !safeJsonLd({ value: "</script><script>alert(1)</script>" }).includes(
      "</script>",
    ),
  );
});
test("converts rich HTML to inert article text", () =>
  assert.equal(
    xmlSafeText("<p>Hello <strong>world</strong></p>"),
    "Hello world",
  ));
test("requires HTTPS and rejects embedded credentials on public origins", () => {
  assert.equal(
    validatedOrigin("https://presspaper.example"),
    "https://presspaper.example",
  );
  assert.equal(validatedOrigin("http://presspaper.example"), null);
  assert.equal(validatedOrigin("https://user@presspaper.example"), null);
});
test("does not trust a production Host header", () => {
  delete process.env.PUBLIC_SITE_URL;
  assert.equal(
    publicOrigin({
      headers: { host: "evil.example", "x-forwarded-proto": "https" },
    }),
    "https://presspaper.ai",
  );
});
test("allows only the nonce-bearing metadata script", () =>
  assert.ok(
    contentSecurityPolicy("abc123").includes("script-src 'nonce-abc123'"),
  ));
test("shared articles open the native release route after the browser app is removed", async () => {
  const priorUrl = process.env.SUPABASE_URL,
    priorKey = process.env.SUPABASE_ANON_KEY,
    priorFetch = globalThis.fetch;
  const id = "12345678-1234-4123-8123-123456789abc";
  process.env.SUPABASE_URL = "https://database.example";
  process.env.SUPABASE_ANON_KEY = "public-test-fixture";
  globalThis.fetch = async (input) =>
    String(input).includes("org_is_verified")
      ? Response.json(true)
      : Response.json([
          {
            id,
            institution_slug: "official",
            institution_name: "Official institution",
            heading: "An official update",
            body: "<p>Readable text</p>",
            created_at: "2026-01-01T00:00:00Z",
          },
        ]);
  try {
    const { default: handler } = await import(
      "../api/r/[id].js?native-link-test"
    );
    const res = {
      headers: {},
      setHeader(k, v) {
        this.headers[k] = v;
      },
      status(code) {
        this.code = code;
        return this;
      },
      send(body) {
        this.body = body;
        return this;
      },
      end() {
        return this;
      },
    };
    await handler({ method: "GET", query: { id }, headers: {} }, res);
    assert.equal(res.code, 200);
    assert.ok(res.body.includes(`href="presspaper://release/${id}"`));
    assert.ok(res.body.includes("Readable text"));
    assert.ok(!res.body.includes(`href="https://presspaper.ai/release/${id}"`));
  } finally {
    globalThis.fetch = priorFetch;
    if (priorUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = priorUrl;
    if (priorKey === undefined) delete process.env.SUPABASE_ANON_KEY;
    else process.env.SUPABASE_ANON_KEY = priorKey;
  }
});
