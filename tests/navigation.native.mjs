import test from "node:test";
import assert from "node:assert/strict";
import {
  workspaceFor,
  navigationPath,
  linkScreens,
} from "../src/navigation.ts";

test("moderation blocks every workspace including admin before role selection", () => {
  for (const account_status of ["archived", "banned"]) {
    for (const role of ["individual", "institution"])
      assert.equal(
        workspaceFor({ role, account_status, is_admin: true }),
        "blocked",
      );
  }
  assert.equal(workspaceFor(null), "blocked");
  assert.equal(workspaceFor({ role: "unknown" }), "blocked");
});
test("admin authority selects the standalone console and ordinary roles select their workspace", () => {
  assert.equal(
    workspaceFor({
      role: "individual",
      is_admin: true,
      account_status: "active",
    }),
    "admin",
  );
  assert.equal(
    workspaceFor({ role: "individual", account_status: "active" }),
    "reader",
  );
  assert.equal(
    workspaceFor({ role: "institution", account_status: "active" }),
    "institution",
  );
});
test("invitation analytics never uses navigation parameters as paths", () => {
  assert.equal(navigationPath("Invitation"), "/institution-invite/[redacted]");
  assert.equal(navigationPath("JoinInvitation"), "/join/[redacted]");
  assert.equal(navigationPath("ResetPassword"), "/reset-password");
  assert.equal(linkScreens.SharedRelease, "r/:id");
  assert.equal(linkScreens.JoinInvitation, "join/:token");
  assert.equal(linkScreens.Publish, "inst/publish/:id?");
});
