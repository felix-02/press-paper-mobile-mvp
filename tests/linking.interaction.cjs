const { getStateFromPath } = require("@react-navigation/native");
const { linkScreens } = require("../src/navigation");
const leaf = (path) => {
  let state = getStateFromPath(path, { screens: linkScreens });
  let route;
  while (state) {
    route = state.routes[state.index ?? 0];
    state = route.state;
  }
  return route;
};
test.each([
  ["institution-invite/abc-123", "Invitation", { token: "abc-123" }],
  ["join/team-token", "JoinInvitation", { token: "team-token" }],
  ["release/release-id", "Release", { id: "release-id" }],
  ["r/release-id", "SharedRelease", { id: "release-id" }],
  ["watchlist/list-id", "Watchlist", { id: "list-id" }],
  ["inst/publish/release-id", "Publish", { id: "release-id" }],
  ["institution/official", "Source", { slug: "official" }],
])(
  "deep link %s resolves to %s with its intended parameters",
  (path, name, params) => {
    expect(leaf(path)).toEqual(expect.objectContaining({ name, params }));
  },
);
test("tab links select the intended nested screen and unknown paths have no route", () => {
  expect(leaf("home").name).toBe("Feed");
  expect(leaf("saved").name).toBe("Saved");
  expect(leaf("inst/releases").name).toBe("Releases");
  expect(leaf("inst/compose").name).toBe("Compose");
  expect(
    getStateFromPath("unrecognized/path", { screens: linkScreens }),
  ).toBeUndefined();
});
