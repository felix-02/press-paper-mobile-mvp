import React, { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
  createNavigationContainerRef,
  type LinkingOptions,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "@/auth/AuthProvider";
import { useOrg } from "@/lib/useOrg";
import { useAppStore } from "@/store/useAppStore";
import { ThemeProvider, useTheme, Screen, Title, Body, Button } from "@/ui";
import {
  linkScreens,
  workspaceFor,
  navigationPath,
  type RootStackParams,
} from "@/navigation";
import { pageview } from "@/lib/analytics";
import {
  LoginScreen,
  SignUpScreen,
  ResetPasswordScreen,
  InvitationScreen,
} from "@/screens/AuthScreens";
import {
  FeedScreen,
  ExploreScreen,
  SavedScreen,
  WatchlistScreen,
  ReleaseScreen,
  SourceScreen,
  SourcesScreen,
  ProfileScreen,
  HelpScreen,
  NotificationsScreen,
} from "@/screens/ReaderScreens";
import {
  DashboardScreen,
  PublishScreen,
  ReleasesScreen,
  AnalyticsScreen,
  AudienceScreen,
  InstitutionProfileScreen,
  SettingsScreen,
  TeamScreen,
  OnboardingScreen,
  PendingReviewScreen,
} from "@/screens/InstitutionScreens";
import { AdminScreen } from "@/screens/AdminScreens";

const Stack = createNativeStackNavigator<RootStackParams>();
const Tabs = createBottomTabNavigator();
const navigationRef = createNavigationContainerRef<RootStackParams>();
const trackRoute = () => {
  const route = navigationRef.getCurrentRoute();
  if (route) pageview(navigationPath(route.name));
};
const linking: LinkingOptions<RootStackParams> = {
  prefixes: ["presspaper://"],
  // Supabase callbacks are consumed by AuthProvider, not application navigation.
  filter: (url) =>
    !/^presspaper:\/\/(auth\/callback|reset-password[?#])/.test(url),
  config: { screens: linkScreens },
};
function Loading() {
  return (
    <Screen>
      <ActivityIndicator accessibilityLabel="Loading your workspace" />
      <Body>Loading your workspace…</Body>
    </Screen>
  );
}
function AccountUnavailable() {
  const auth = useAuth();
  return (
    <Screen>
      <Title>Account unavailable</Title>
      <Body>
        {auth.profileError ||
          "This account is archived or suspended. Contact support for help."}
      </Body>
      <Button title="Try again" onPress={() => void auth.refreshProfile()} />
      <Button
        title="Sign out"
        variant="secondary"
        onPress={() => void auth.signOut()}
      />
    </Screen>
  );
}
function ReaderTabs() {
  const { colors } = useTheme();
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarIcon: ({ color, size }) => (
          <Ionicons
            name={
              (
                {
                  Feed: "newspaper-outline",
                  Explore: "search-outline",
                  Saved: "bookmark-outline",
                  Profile: "person-outline",
                } as const
              )[route.name as "Feed"]
            }
            size={size}
            color={color}
          />
        ),
      })}
    >
      <Tabs.Screen name="Feed" component={FeedScreen} />
      <Tabs.Screen name="Explore" component={ExploreScreen} />
      <Tabs.Screen name="Saved" component={SavedScreen} />
      <Tabs.Screen name="Profile" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}
function InstitutionTabs() {
  const { colors } = useTheme();
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarIcon: ({ color, size }) => (
          <Ionicons
            name={
              (
                {
                  Dashboard: "grid-outline",
                  Releases: "documents-outline",
                  Compose: "create-outline",
                  Settings: "settings-outline",
                } as const
              )[route.name as "Dashboard"]
            }
            color={color}
            size={size}
          />
        ),
      })}
    >
      <Tabs.Screen name="Dashboard" component={DashboardScreen} />
      <Tabs.Screen name="Releases" component={ReleasesScreen} />
      <Tabs.Screen
        name="Compose"
        component={PublishScreen}
        options={{ title: "Publish" }}
      />
      <Tabs.Screen name="Settings" component={SettingsScreen} />
    </Tabs.Navigator>
  );
}
function InstitutionGate({ children, team = false, ...props }: any) {
  const org = useOrg();
  const { profile } = useAuth();
  if (org.loading) return <Loading />;
  if (org.error)
    return (
      <Screen>
        <Title>Workspace unavailable</Title>
        <Body>{org.error}</Body>
        <Button title="Try again" onPress={() => void org.refresh()} />
      </Screen>
    );
  if (!org.available || !org.verified)
    return <PendingReviewScreen {...props} />;
  if (!team && !org.active) return <TeamScreen {...props} />;
  if (
    !team &&
    profile?.verification_status === "verified" &&
    !profile.onboarding_complete
  )
    return <OnboardingScreen {...props} />;
  return children;
}
const institutionScreen = (Component: React.ComponentType<any>, team = false) =>
  function Guarded(props: any) {
    return (
      <InstitutionGate {...props} team={team}>
        <Component {...props} />
      </InstitutionGate>
    );
  };
const InstHome = institutionScreen(InstitutionTabs);
const InstPublish = institutionScreen(PublishScreen);
const InstReleases = institutionScreen(ReleasesScreen);
const InstAnalytics = institutionScreen(AnalyticsScreen);
const InstAudience = institutionScreen(AudienceScreen);
const InstTeam = institutionScreen(TeamScreen, true);
const InstProfile = institutionScreen(InstitutionProfileScreen);
function DashboardRedirect({ navigation }: any) {
  useEffect(() => {
    navigation.replace("Institution", { screen: "Dashboard" });
  }, [navigation]);
  return <Loading />;
}
function SavedRedirect({ navigation }: any) {
  useEffect(() => {
    navigation.replace("Reader", { screen: "Saved" });
  }, [navigation]);
  return <Loading />;
}
/** Keep the navigator mounted during auth changes so incoming invitations survive. */
function sessionScreen(
  Component: React.ComponentType<any>,
  authenticated = false,
) {
  return function SessionScreen(props: any) {
    const auth = useAuth();
    if (!auth.ready || (auth.user && !auth.profileReady && !auth.profile))
      return <Loading />;
    if (auth.recovery) return <ResetPasswordScreen {...props} />;
    if (
      auth.user &&
      (auth.profileError || workspaceFor(auth.profile) === "blocked")
    )
      return <AccountUnavailable />;
    if (authenticated && !auth.user) return <LoginScreen {...props} />;
    if (authenticated && auth.profile?.is_admin)
      return (
        <Screen>
          <Body>Reader content is available through your reader account.</Body>
          <Button
            title="Administration"
            onPress={() => props.navigation.navigate("Admin")}
          />
        </Screen>
      );
    // Reset screen-local requests and cached content when switching accounts.
    return <Component key={auth.user?.id ?? "guest"} {...props} />;
  };
}
const ProtectedRelease = sessionScreen(ReleaseScreen, true);
const ProtectedWatchlist = sessionScreen(WatchlistScreen, true);
const PublicSources = sessionScreen(SourcesScreen);
const PublicSource = sessionScreen(SourceScreen);
const PublicHelp = sessionScreen(HelpScreen);
const PlatformInvitation = sessionScreen(InvitationScreen);
const JoinInvitation = sessionScreen((props: any) => (
  <InvitationScreen
    {...props}
    route={{ ...props.route, params: { ...props.route.params, kind: "org" } }}
  />
));
function Toasts() {
  const toasts = useAppStore((s) => s.toasts);
  const { colors } = useTheme();
  if (!toasts.length) return null;
  return (
    <View
      style={{ position: "absolute", bottom: 80, left: 16, right: 16, gap: 8 }}
      pointerEvents="box-none"
    >
      {toasts.slice(-2).map((t) => (
        <View
          key={t.id}
          accessibilityLiveRegion="polite"
          style={{
            padding: 14,
            borderRadius: 14,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={{ color: colors.text, fontWeight: "700" }}>
            {t.title}
          </Text>
          {t.description ? (
            <Text style={{ color: colors.muted }}>{t.description}</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}
function Root() {
  const auth = useAuth();
  const { colors } = useTheme();
  const workspace = workspaceFor(auth.profile);
  const loading =
    !auth.ready || !!(auth.user && !auth.profileReady && !auth.profile);
  const blocked = !!(
    auth.user &&
    (auth.profileError || workspace === "blocked")
  );
  if (!auth.configured)
    return (
      <Screen>
        <Title>Connect Presspaper</Title>
        <Body>
          This app requires EXPO_PUBLIC_SUPABASE_URL and
          EXPO_PUBLIC_SUPABASE_ANON_KEY in .env.local. Use your project's public
          anon key.
        </Body>
      </Screen>
    );
  const dark = colors.background === "#101522";
  return (
    <>
      <StatusBar style={dark ? "light" : "dark"} />
      <NavigationContainer
        ref={navigationRef}
        onReady={trackRoute}
        onStateChange={trackRoute}
        linking={linking}
        theme={{
          ...(dark ? DarkTheme : DefaultTheme),
          colors: {
            ...(dark ? DarkTheme : DefaultTheme).colors,
            primary: colors.accent,
            background: colors.background,
            card: colors.surface,
            text: colors.text,
            border: colors.border,
          },
        }}
      >
        <Stack.Navigator
          screenOptions={{
            headerTitleStyle: { fontWeight: "700" },
            headerBackButtonDisplayMode: "minimal",
          }}
        >
          {loading ? (
            <Stack.Screen
              name="Loading"
              component={Loading}
              options={{ headerShown: false }}
            />
          ) : auth.recovery ? (
            <Stack.Screen
              name="Recovery"
              component={ResetPasswordScreen}
              options={{ title: "Choose a new password" }}
            />
          ) : blocked ? (
            <Stack.Screen
              name="AccountUnavailable"
              component={AccountUnavailable}
              options={{ headerShown: false }}
            />
          ) : !auth.user ? (
            <Stack.Group navigationKey="guest">
              <Stack.Screen
                name="Login"
                component={LoginScreen}
                options={{ title: "Presspaper" }}
              />
              <Stack.Screen
                name="SignUp"
                component={SignUpScreen}
                options={{ title: "Create account" }}
              />
            </Stack.Group>
          ) : workspace === "admin" ? (
            <Stack.Screen
              navigationKey={`admin:${auth.user.id}`}
              name="Admin"
              component={AdminScreen}
              options={{ title: "Platform administration" }}
            />
          ) : workspace === "institution" ? (
            <Stack.Group navigationKey={`institution:${auth.user.id}`}>
              <Stack.Screen
                name="Institution"
                component={InstHome}
                options={{ title: "Presspaper • Workspace" }}
              />
              <Stack.Screen name="Dashboard" component={DashboardRedirect} />
              <Stack.Screen name="Publish" component={InstPublish} />
              <Stack.Screen name="Releases" component={InstReleases} />
              <Stack.Screen name="Analytics" component={InstAnalytics} />
              <Stack.Screen name="Audience" component={InstAudience} />
              <Stack.Screen name="Team" component={InstTeam} />
              <Stack.Screen
                name="InstitutionProfile"
                component={InstProfile}
                options={{ title: "Institution profile" }}
              />
              <Stack.Screen name="Onboarding" component={OnboardingScreen} />
              <Stack.Screen
                name="PendingReview"
                component={PendingReviewScreen}
                options={{ title: "Under review" }}
              />
            </Stack.Group>
          ) : (
            <Stack.Group navigationKey={`reader:${auth.user.id}`}>
              <Stack.Screen
                name="Reader"
                component={ReaderTabs}
                options={({ navigation }) => ({
                  title: "Presspaper",
                  headerRight: () => (
                    <Button
                      title="Alerts"
                      variant="secondary"
                      onPress={() => navigation.navigate("Notifications")}
                    />
                  ),
                })}
              />
              <Stack.Screen name="Saved" component={SavedRedirect} />
            </Stack.Group>
          )}
          <Stack.Screen
            name="ResetPassword"
            component={ResetPasswordScreen}
            options={{ title: "Reset password" }}
          />
          <Stack.Screen
            name="Invitation"
            component={PlatformInvitation}
            options={{ title: "Institution invitation" }}
          />
          <Stack.Screen
            name="JoinInvitation"
            component={JoinInvitation}
            options={{ title: "Team invitation" }}
          />
          <Stack.Screen name="Sources" component={PublicSources} />
          <Stack.Screen
            name="Source"
            component={PublicSource}
            options={{ title: "Institution" }}
          />
          <Stack.Screen name="Release" component={ProtectedRelease} />
          <Stack.Screen
            name="SharedRelease"
            component={ProtectedRelease}
            options={{ title: "Release" }}
          />
          <Stack.Screen name="Watchlist" component={ProtectedWatchlist} />
          <Stack.Screen name="Help" component={PublicHelp} />
          {auth.user &&
          workspace === "reader" &&
          !loading &&
          !blocked &&
          !auth.recovery ? (
            <Stack.Screen
              name="Notifications"
              component={NotificationsScreen}
            />
          ) : null}
        </Stack.Navigator>
        <Toasts />
      </NavigationContainer>
    </>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <Root />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
