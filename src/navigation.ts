import type { NavigatorScreenParams } from "@react-navigation/native";

export type ReaderTabsParams = {
  Feed: undefined;
  Explore: undefined;
  Saved: undefined;
  Profile: undefined;
};
export type InstitutionTabsParams = {
  Dashboard: undefined;
  Releases: undefined;
  Compose: { id?: string } | undefined;
  Settings: undefined;
};
export type RootStackParams = {
  Login:
    | { invitation?: { token: string; kind: "org" | "platform" } }
    | undefined;
  SignUp:
    | { invitation?: { token: string; kind: "org" | "platform" } }
    | undefined;
  ResetPassword: undefined;
  Recovery: undefined;
  Loading: undefined;
  AccountUnavailable: undefined;
  Invitation: { token: string; kind?: "org" | "platform" };
  JoinInvitation: { token: string };
  Sources: undefined;
  Source: { slug: string };
  Release: { id: string };
  SharedRelease: { id: string };
  Help: undefined;
  Watchlist: { id: string };
  Notifications: undefined;
  Reader: NavigatorScreenParams<ReaderTabsParams>;
  Institution: NavigatorScreenParams<InstitutionTabsParams>;
  Publish: { id?: string } | undefined;
  Dashboard: undefined;
  Releases: undefined;
  Saved: undefined;
  Analytics: undefined;
  Audience: undefined;
  Team: undefined;
  InstitutionProfile: undefined;
  Onboarding: undefined;
  PendingReview: undefined;
  Admin: undefined;
};
/** Explicit public link map: navigation is re-authorized after session restoration. */
export const linkScreens = {
  Login: "login",
  SignUp: "signup",
  ResetPassword: "reset-password",
  Invitation: {
    path: "institution-invite/:token",
    parse: { token: (value: string) => value },
  },
  JoinInvitation: "join/:token",
  Sources: "sources",
  Source: "institution/:slug",
  Release: "release/:id",
  SharedRelease: "r/:id",
  Help: "help",
  Watchlist: "watchlist/:id",
  Reader: {
    screens: {
      Feed: "home",
      Explore: "explore",
      Saved: "saved",
      Profile: "me",
    },
  },
  Institution: {
    screens: {
      Dashboard: "inst",
      Releases: "inst/releases",
      Compose: "inst/compose",
      Settings: "inst/settings",
    },
  },
  Publish: "inst/publish/:id?",
  Analytics: "inst/analytics",
  Audience: "inst/audience",
  Team: "inst/team",
  InstitutionProfile: "inst/profile",
  Onboarding: "onboarding",
  Admin: "admin",
};
export function workspaceFor(
  profile: {
    is_admin?: boolean;
    account_status?: string;
    role?: string;
  } | null,
) {
  if (
    !profile ||
    profile.account_status === "banned" ||
    profile.account_status === "archived"
  )
    return "blocked";
  if (profile.is_admin) return "admin";
  return profile.role === "institution"
    ? "institution"
    : profile.role === "individual"
      ? "reader"
      : "blocked";
}

/** Analytics uses static names only: never persist invitation or auth parameters. */
export function navigationPath(name: string): string {
  const paths: Record<string, string> = {
    Feed: "/home",
    Explore: "/explore",
    Saved: "/saved",
    Profile: "/me",
    Dashboard: "/inst",
    Publish: "/inst/publish",
    Admin: "/admin",
    Invitation: "/institution-invite/[redacted]",
    JoinInvitation: "/join/[redacted]",
    Release: "/release",
    SharedRelease: "/r",
    Source: "/institution",
    ResetPassword: "/reset-password",
  };
  return paths[name] ?? `/native/${name.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}
