import test from "node:test";
import assert from "node:assert/strict";
import { parseAuthLink } from "../src/lib/authLinks.ts";

test("PKCE email confirmation and recovery callbacks are distinguished", () => {
  assert.deepEqual(
    parseAuthLink("presspaper://auth/callback?code=one-time-code"),
    {
      code: "one-time-code",
      accessToken: undefined,
      refreshToken: undefined,
      recovery: false,
    },
  );
  assert.equal(
    parseAuthLink("presspaper://reset-password?code=recovery-code")?.recovery,
    true,
  );
});

test("implicit recovery requires both session tokens", () => {
  assert.equal(
    parseAuthLink("presspaper://auth/callback#access_token=test-access"),
    null,
  );
  assert.equal(
    parseAuthLink(
      "presspaper://auth/callback#access_token=test-access&refresh_token=test-refresh&type=recovery",
    )?.recovery,
    true,
  );
});

test("untrusted callback routes and provider error links cannot establish a session", () => {
  for (const link of [
    "https://attacker.invalid/auth/callback?code=foo",
    "presspaper://release/foo?code=foo",
    "presspaper://institution-invite/foo?code=foo",
    "presspaper://auth/callback?code=foo&error=access_denied",
    "not a url",
  ]) {
    assert.equal(parseAuthLink(link), null);
  }
});
