// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { isReleaseUuid, releasePath, releaseShareUrl } from "./releaseUrls";

const id = "9dc535af-9c4c-4acf-a7a4-c6939f49b4a8";

describe("release URLs", () => {
  it("recognizes UUID-backed releases", () => {
    expect(isReleaseUuid(id)).toBe(true);
    expect(isReleaseUuid("wg-release")).toBe(false);
    expect(isReleaseUuid(`${id}/unexpected`)).toBe(false);
    expect(isReleaseUuid(`${id}unexpected`)).toBe(false);
  });

  it("uses the SSR page only for published UUID releases", () => {
    expect(releaseShareUrl({ id, status: "Published" })).toBe(`${window.location.origin}/r/${id}`);
    expect(releaseShareUrl({ id, status: "Draft" })).toBe(`${window.location.origin}/release/${id}`);
    expect(releaseShareUrl({ id: "wg-release", status: "Published" })).toBe(`${window.location.origin}/release/wg-release`);
  });

  it("encodes path segments", () => {
    expect(releasePath("a/b")).toBe("/release/a%2Fb");
  });
});
