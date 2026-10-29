const React = require("react");
const { render, fireEvent, waitFor } = require("@testing-library/react-native");
const mockInsert = jest.fn();
const mockSingle = jest.fn();
const mockPreventRemove = jest.fn();
let mockCanPublish = false;
jest.mock("@react-navigation/native", () => ({
  usePreventRemove: (...args) => mockPreventRemove(...args),
  useFocusEffect: jest.fn(),
}));
jest.mock("react-native-render-html", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "current-user" },
    profile: {
      role: "institution",
      institution_slug: "official",
      institution_name: "Official institution",
    },
    signOut: jest.fn(),
  }),
}));
jest.mock("@/lib/useOrg", () => ({
  useOrg: () => ({
    slug: "official",
    loading: false,
    error: null,
    verified: true,
    active: true,
    canPublishNow: mockCanPublish,
    can: { publish: mockCanPublish },
  }),
}));
jest.mock("@/lib/analytics", () => ({ track: jest.fn() }));
jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: [], error: null }),
      }),
      insert: (...args) => {
        mockInsert(...args);
        return { select: () => ({ single: mockSingle }) };
      },
    }),
  },
}));
const { PublishScreen } = require("../src/screens/InstitutionScreens");
const navigation = { navigate: jest.fn(), dispatch: jest.fn() };
beforeEach(() => {
  jest.clearAllMocks();
  mockCanPublish = false;
  mockSingle.mockResolvedValue({ data: { id: "new-release" }, error: null });
});
test("analysts cannot open the publishing form or submit releases", async () => {
  const ui = render(
    React.createElement(PublishScreen, { navigation, route: {} }),
  );
  await ui.findByText(
    "Your role has read-only access. Ask the owner for an editor role.",
  );
  expect(ui.queryByLabelText("Heading")).toBeNull();
  expect(mockInsert).not.toHaveBeenCalled();
});
test("an editor saves a draft to the same organisation contract without a publish timestamp", async () => {
  mockCanPublish = true;
  const ui = render(
    React.createElement(PublishScreen, { navigation, route: {} }),
  );
  await waitFor(() => expect(ui.getByLabelText("Heading")).toBeTruthy());
  fireEvent.changeText(ui.getByLabelText("Heading"), "Official announcement");
  fireEvent.changeText(ui.getByLabelText("Summary"), "A summary.");
  fireEvent.press(ui.getByRole("button", { name: "Save draft" }));
  await waitFor(() =>
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        heading: "Official announcement",
        subheading: "A summary.",
        status: "Draft",
        published_at: null,
        owner: "current-user",
        institution_slug: "official",
      }),
    ),
  );
  await waitFor(() =>
    expect(navigation.navigate).toHaveBeenCalledWith("Releases"),
  );
});
test("a failed save preserves the form and reports failure instead of navigating", async () => {
  mockCanPublish = true;
  mockSingle.mockResolvedValue({ data: null, error: { message: "Denied" } });
  const ui = render(
    React.createElement(PublishScreen, { navigation, route: {} }),
  );
  await waitFor(() => expect(ui.getByLabelText("Heading")).toBeTruthy());
  fireEvent.changeText(ui.getByLabelText("Heading"), "Keep my draft");
  fireEvent.press(ui.getByRole("button", { name: "Save draft" }));
  await ui.findByText(
    "Could not save. Check your publishing access and try again.",
  );
  expect(ui.getByLabelText("Heading").props.value).toBe("Keep my draft");
  expect(navigation.navigate).not.toHaveBeenCalled();
});
