import { useEffect, useState } from "react";
import { ActivityIndicator } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/lib/supabase";
import { AUTH_CALLBACK, PASSWORD_CALLBACK } from "@/lib/authLinks";
import { Screen, Card, Title, Body, Button, Field } from "../ui";

type Props = { navigation: any; route: any };
export function LoginScreen({ navigation, route }: Props) {
  const { signIn, authLinkError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await signIn(email.trim(), password);
      if (result.error) setError(result.error);
      else if (route?.params?.invitation)
        navigation.navigate("Invitation", route.params.invitation);
    } catch {
      setError("Unable to sign in. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <Title>Welcome to Presspaper</Title>
      <Body>Official updates. Trusted sources. Your world, informed.</Body>
      <Card>
        <Title>Log in</Title>
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
        />
        {!!(error || authLinkError) && <Body>{error || authLinkError}</Body>}
        <Button
          title={busy ? "Signing in…" : "Log in"}
          onPress={submit}
          disabled={busy || !email.trim() || !password}
        />
        <Button
          title="Forgot password?"
          variant="secondary"
          onPress={() => navigation.navigate("ResetPassword")}
        />
        <Button
          title="Create an account"
          variant="secondary"
          onPress={() => navigation.navigate("SignUp", route?.params)}
        />
        <Button
          title="Browse official sources"
          variant="secondary"
          onPress={() => navigation.navigate("Sources")}
        />
      </Card>
      <Body>
        Institution accounts require an invitation. Platform administrators use
        their dedicated account.
      </Body>
    </Screen>
  );
}

export function SignUpScreen({ navigation, route }: Props) {
  const { signUp } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await signUp({
        email: email.trim(),
        password,
        fullName: name.trim(),
        role: "individual",
        emailRedirectTo: AUTH_CALLBACK,
      });
      if (result.error) setMessage(result.error);
      else if (result.needsConfirmation)
        setMessage(
          "Check your email to confirm your account. Then return here to sign in with the same email address.",
        );
      else if (route?.params?.invitation)
        navigation.navigate("Invitation", route.params.invitation);
    } catch {
      setMessage(
        "Unable to create the account. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <Title>Create your account</Title>
      <Body>Follow institutions and keep the releases that matter to you.</Body>
      <Card>
        <Field
          label="Full name"
          value={name}
          onChangeText={setName}
          autoComplete="name"
          maxLength={100}
        />
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        <Field
          label="Password (at least 8 characters)"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
        />
        {!!message && <Body>{message}</Body>}
        <Button
          title={busy ? "Creating account…" : "Sign up"}
          onPress={submit}
          disabled={
            busy || !name.trim() || !email.trim() || password.length < 8
          }
        />
        <Button
          title="Already have an account? Log in"
          variant="secondary"
          onPress={() => navigation.navigate("Login", route?.params)}
        />
      </Card>
      <Body>
        For institution invitations, sign up using the exact invited email
        address, confirm it, and reopen your invitation.
      </Body>
    </Screen>
  );
}

export function ResetPasswordScreen({ navigation }: Props) {
  const { recovery, clearRecovery } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!supabase) return;
    setBusy(true);
    setMessage(null);
    try {
      if (recovery) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error)
          setMessage(
            "The password could not be changed. Request a new recovery link and try again.",
          );
        else {
          clearRecovery();
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo: PASSWORD_CALLBACK },
        );
        setMessage(
          error
            ? "Unable to send the recovery email. Try again."
            : "If an account exists, a recovery link has been sent. Open it on this device.",
        );
      }
    } catch {
      setMessage("Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <Title>
        {recovery ? "Choose a new password" : "Reset your password"}
      </Title>
      <Card>
        {recovery ? (
          <>
            <Field
              label="New password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
            />
            <Field
              label="Confirm password"
              value={confirmation}
              onChangeText={setConfirmation}
              secureTextEntry
            />
          </>
        ) : (
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
        )}
        {!!message && <Body>{message}</Body>}
        <Button
          title={
            busy
              ? "Please wait…"
              : recovery
                ? "Save password"
                : "Send recovery email"
          }
          onPress={submit}
          disabled={
            busy ||
            (recovery
              ? password.length < 8 || password !== confirmation
              : !email.trim())
          }
        />
        {!recovery && (
          <Button
            title="Back to log in"
            variant="secondary"
            onPress={() => navigation.navigate("Login")}
          />
        )}
      </Card>
    </Screen>
  );
}

type Invitation = {
  email?: string;
  org_name?: string;
  role?: string;
  valid?: boolean;
  status?: string;
  reason?: string;
};
export function InvitationScreen({ navigation, route }: Props) {
  const { user, refreshProfile } = useAuth();
  const token = String(route?.params?.token ?? "");
  const kind = route?.params?.kind === "org" ? "org" : "platform";
  const [invite, setInvite] = useState<Invitation | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setMessage(null);
    setAccepted(false);
    if (!supabase || !token) {
      setLoading(false);
      setMessage("This invitation is unavailable.");
      return;
    }
    void supabase
      .rpc(
        kind === "org" ? "get_invite" : "get_platform_invite",
        kind === "org" ? { invite_token: token } : { p_token: token },
      )
      .then(
        ({ data, error }) => {
          if (!active) return;
          setLoading(false);
          setInvite((data as Invitation[] | null)?.[0] ?? null);
          if (error) setMessage("Unable to load your invitation. Try again.");
        },
        () => {
          if (active) {
            setLoading(false);
            setMessage(
              "Unable to load your invitation. Check your connection.",
            );
          }
        },
      );
    return () => {
      active = false;
    };
  }, [kind, token, retry]);
  const accept = async () => {
    if (!supabase) return;
    setBusy(true);
    setMessage(null);
    try {
      const { data, error } = await supabase.rpc(
        kind === "org" ? "accept_org_invite" : "accept_platform_invite",
        kind === "org" ? { invite_token: token } : { p_token: token },
      );
      const result = String(data ?? "error");
      if (!error && ["ok", "already_member"].includes(result)) {
        setAccepted(true);
        await refreshProfile();
        setMessage(
          kind === "org"
            ? "Invitation accepted. Your organisation owner will approve your access."
            : "Invitation accepted. Your institution is awaiting platform review.",
        );
      } else {
        const errors: Record<string, string> = {
          email_mismatch: `Sign in using the invited address: ${invite?.email ?? ""}.`,
          email_unconfirmed: "Confirm your email before accepting.",
          unauthenticated: "Please sign in first.",
          expired: "This invitation has expired. Ask for a new invitation.",
          consumed: "This invitation has already been used.",
          account_conflict:
            "This account already belongs to another organisation. Use a separate account.",
          organization_conflict:
            "This organisation identity is already in use. Contact a platform administrator.",
          seat_limit: "No seats are available. Ask the owner to free a seat.",
        };
        setMessage(
          errors[result] ??
            "Unable to accept this invitation. It may have expired or been revoked.",
        );
      }
    } catch {
      setMessage("Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };
  const valid = kind === "org" ? invite?.status === "pending" : invite?.valid;
  return (
    <Screen>
      <Title>
        {kind === "org" ? "Join your team" : "Institution invitation"}
      </Title>
      {loading ? (
        <ActivityIndicator />
      ) : (
        <Card>
          {!!invite?.org_name && <Title>{invite.org_name}</Title>}
          {!!invite?.email && (
            <Body>
              Invitation for {invite.email}
              {invite.role ? ` · ${invite.role}` : ""}
            </Body>
          )}
          {!!message && <Body>{message}</Body>}
          {!valid && (
            <>
              <Body>
                This invitation is unavailable, expired, or already used.
              </Body>
              <Button
                title="Try again"
                variant="secondary"
                onPress={() => setRetry((n) => n + 1)}
              />
            </>
          )}
          {accepted && (
            <Button
              title="Continue to workspace"
              onPress={() => navigation.navigate("Institution")}
            />
          )}
          {valid &&
            !accepted &&
            (user ? (
              <Button
                title={busy ? "Accepting…" : "Accept invitation"}
                onPress={accept}
                disabled={busy}
              />
            ) : (
              <>
                <Body>
                  Sign in with the exact invited email address to continue.
                </Body>
                <Button
                  title="Log in"
                  onPress={() =>
                    navigation.navigate("Login", {
                      invitation: { kind, token },
                    })
                  }
                />
                <Button
                  title="Create an account"
                  variant="secondary"
                  onPress={() =>
                    navigation.navigate("SignUp", {
                      invitation: { kind, token },
                    })
                  }
                />
              </>
            ))}
        </Card>
      )}
    </Screen>
  );
}
