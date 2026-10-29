const React = require("react");
const { render, fireEvent, waitFor } = require("@testing-library/react-native");
const mockSignIn = jest.fn();
const mockClearRecovery = jest.fn();
const mockRefresh = jest.fn();
let mockRecovery = false;
let mockUser = null;
const mockRpc = jest.fn();
const mockUpdate = jest.fn();
jest.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({
    signIn: mockSignIn,
    recovery: mockRecovery,
    clearRecovery: mockClearRecovery,
    user: mockUser,
    refreshProfile: mockRefresh,
    authLinkError: null,
  }),
}));
jest.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: (...args) => mockRpc(...args),
    auth: { updateUser: (...args) => mockUpdate(...args) },
  },
}));
const {
  LoginScreen,
  ResetPasswordScreen,
  InvitationScreen,
} = require("../src/screens/AuthScreens");

beforeEach(() => {
  jest.clearAllMocks();
  mockRecovery = false;
  mockUser = null;
});
test("login trims email and preserves the invitation destination after success", async () => {
  mockSignIn.mockResolvedValue({ error: null });
  const navigation = { navigate: jest.fn() };
  const invitation = { token: "single-use-token", kind: "org" };
  const ui = render(
    React.createElement(LoginScreen, {
      navigation,
      route: { params: { invitation } },
    }),
  );
  fireEvent.changeText(ui.getByLabelText("Email"), " reader@example.org ");
  fireEvent.changeText(ui.getByLabelText("Password"), "private-password");
  fireEvent.press(ui.getByRole("button", { name: "Log in" }));
  await waitFor(() =>
    expect(mockSignIn).toHaveBeenCalledWith(
      "reader@example.org",
      "private-password",
    ),
  );
  await waitFor(() =>
    expect(navigation.navigate).toHaveBeenCalledWith("Invitation", invitation),
  );
});
test("failed login keeps the user on the form and shows the error", async () => {
  mockSignIn.mockResolvedValue({
    error: "The email or password is incorrect.",
  });
  const navigation = { navigate: jest.fn() };
  const ui = render(
    React.createElement(LoginScreen, { navigation, route: {} }),
  );
  fireEvent.changeText(ui.getByLabelText("Email"), "reader@example.org");
  fireEvent.changeText(ui.getByLabelText("Password"), "bad-password");
  fireEvent.press(ui.getByRole("button", { name: "Log in" }));
  await ui.findByText("The email or password is incorrect.");
  expect(navigation.navigate).not.toHaveBeenCalled();
});
test("successful recovery clears recovery state without navigating to an unavailable login route", async () => {
  mockRecovery = true;
  mockUpdate.mockResolvedValue({ error: null });
  const navigation = { navigate: jest.fn() };
  const ui = render(
    React.createElement(ResetPasswordScreen, { navigation, route: {} }),
  );
  fireEvent.changeText(ui.getByLabelText("New password"), "new-password");
  fireEvent.changeText(ui.getByLabelText("Confirm password"), "new-password");
  fireEvent.press(ui.getByRole("button", { name: "Save password" }));
  await waitFor(() =>
    expect(mockUpdate).toHaveBeenCalledWith({ password: "new-password" }),
  );
  expect(mockClearRecovery).toHaveBeenCalled();
  expect(navigation.navigate).not.toHaveBeenCalled();
});
test("team invitations use the team RPC and preserve token kind through login", async () => {
  mockRpc.mockResolvedValue({
    data: [
      {
        status: "pending",
        email: "invited@example.org",
        org_name: "Official institution",
      },
    ],
    error: null,
  });
  const navigation = { navigate: jest.fn() };
  const ui = render(
    React.createElement(InvitationScreen, {
      navigation,
      route: { params: { kind: "org", token: "team-token" } },
    }),
  );
  await ui.findByText("Official institution");
  expect(mockRpc).toHaveBeenCalledWith("get_invite", {
    invite_token: "team-token",
  });
  fireEvent.press(ui.getByRole("button", { name: "Log in" }));
  expect(navigation.navigate).toHaveBeenCalledWith("Login", {
    invitation: { kind: "org", token: "team-token" },
  });
});
