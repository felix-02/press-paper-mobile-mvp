import { describe, expect, it } from "vitest";
import type { Release } from "@/types";
import { consumeBufferedReleases, mergeUnseenReleases } from "./useRealtimeReleases";

function release(id: string, createdAt: number, status: Release["status"] = "Published"): Release {
  return {
    id,
    institutionSlug: "publisher",
    type: "Announcement",
    status,
    heading: id,
    subheading: "",
    time: "Just now",
    scene: "wind-farm",
    tags: [],
    views: "0",
    comments: "0",
    createdAt,
  };
}

describe("Realtime release buffering", () => {
  it("keeps only unseen published releases and orders newest first", () => {
    const buffered = [release("pending", 20)];
    const candidates = [
      release("visible", 40),
      release("pending", 30),
      release("draft", 50, "Draft"),
      release("newest", 60),
    ];

    const result = mergeUnseenReleases(buffered, candidates, new Set(["visible"]));

    expect(result.map((item) => item.id)).toEqual(["newest", "pending"]);
  });

  it("consumes only posts shown by the active feed tab", () => {
    const buffered = [release("following", 30), release("other", 20)];

    const result = consumeBufferedReleases(buffered, new Set(["following"]));

    expect(result.consumed.map((item) => item.id)).toEqual(["following"]);
    expect(result.remaining.map((item) => item.id)).toEqual(["other"]);
  });
});
