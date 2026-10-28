import { describe, expect, it } from "vitest";
import { releaseInstitution, rowToRelease } from "./releaseMap";
import type { ReleaseRow } from "./supabase";

function row(institutionVerified: boolean): ReleaseRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    owner: "00000000-0000-4000-8000-000000000002",
    institution_slug: "database-publisher",
    institution_name: "Database Publisher",
    institution_verified: institutionVerified,
    type: "Announcement",
    status: "Published",
    heading: "A release",
    subheading: null,
    body: null,
    scene: "town",
    published_at: "2026-01-01T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

describe("live release attribution", () => {
  it("uses the database publisher identity and verification state", () => {
    const release = rowToRelease(row(false));
    expect(releaseInstitution(release)).toMatchObject({ name: "Database Publisher", verified: false });
  });

  it("shows verification only when it is explicit in the database view", () => {
    const release = rowToRelease(row(true));
    expect(releaseInstitution(release).verified).toBe(true);
  });
});
