// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { analyticsPath } from "./analytics";

describe("analyticsPath", () => {
  it("redacts organization invite bearer tokens", () => {
    expect(analyticsPath("/join/super-secret?next=/home")).toBe("/join/[redacted]");
    expect(analyticsPath("/institution-invite/another-secret")).toBe("/institution-invite/[redacted]");
  });

  it("drops query strings from normal pageviews", () => {
    expect(analyticsPath("/explore?q=health")).toBe("/explore");
  });
});
