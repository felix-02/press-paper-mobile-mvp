import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const colors = {
  background: "#f5f6fa",
  surface: "#ffffff",
  surface2: "#edf0f7",
  text: "#15213b",
  muted: "#62708a",
  accent: "#255bf3",
  primary: "#255bf3",
  border: "#dfe4ee",
  danger: "#bc3546",
  success: "#13765b",
  blue: "#255bf3",
};
export type Palette = typeof colors;
const dark: Palette = {
  background: "#101522",
  surface: "#192236",
  surface2: "#253149",
  text: "#edf2ff",
  muted: "#adbad2",
  accent: "#91b0ff",
  primary: "#91b0ff",
  border: "#354159",
  danger: "#ff8795",
  success: "#73d9b5",
  blue: "#91b0ff",
};
type Mode = "system" | "light" | "dark";
const Theme = createContext({
  colors,
  mode: "system" as Mode,
  setMode: (_: Mode) => {},
});
export function ThemeProvider({ children }: PropsWithChildren) {
  const system = useColorScheme();
  const [mode, setValue] = useState<Mode>("system");
  useEffect(() => {
    void AsyncStorage.getItem("presspaper.theme")
      .then((v) => {
        if (v === "light" || v === "dark" || v === "system") setValue(v);
      })
      .catch(() => {});
  }, []);
  const setMode = (v: Mode) => {
    setValue(v);
    void AsyncStorage.setItem("presspaper.theme", v).catch(() => {});
  };
  return (
    <Theme.Provider
      value={{
        mode,
        setMode,
        colors:
          mode === "dark" || (mode === "system" && system === "dark")
            ? dark
            : colors,
      }}
    >
      {children}
    </Theme.Provider>
  );
}
export const useTheme = () => useContext(Theme);
export function Screen({
  children,
  refreshing = false,
  onRefresh,
  style,
}: PropsWithChildren<{
  refreshing?: boolean;
  onRefresh?: () => void;
  style?: StyleProp<ViewStyle>;
}>) {
  const { colors: c } = useTheme();
  return (
    <SafeAreaView
      edges={["bottom", "left", "right"]}
      style={{ flex: 1, backgroundColor: c.background }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.screen, style]}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={c.accent}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function Card({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const { colors: c } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: c.surface, borderColor: c.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function Title({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<TextStyle> }>) {
  const { colors: c } = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={[styles.title, { color: c.text }, style]}
    >
      {children}
    </Text>
  );
}
export function Body({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<TextStyle> }>) {
  const { colors: c } = useTheme();
  return (
    <Text selectable style={[styles.body, { color: c.muted }, style]}>
      {children}
    </Text>
  );
}
export function Row({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.row, style]}>{children}</View>;
}
export function Button({
  title,
  onPress,
  disabled = false,
  variant = "primary",
  loading = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
}) {
  const { colors: c } = useTheme();
  const bg =
    variant === "secondary"
      ? c.surface2
      : variant === "danger"
        ? c.danger
        : c.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: bg,
          opacity: disabled || loading ? 0.5 : pressed ? 0.8 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={c.text} />
      ) : (
        <Text
          style={{
            color: variant === "secondary" ? c.text : c.background,
            fontWeight: "700",
            fontSize: 15,
            textAlign: "center",
          }}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}
export function Field({
  label,
  style,
  ...props
}: TextInputProps & { label: string }) {
  const { colors: c } = useTheme();
  return (
    <View style={{ gap: 6, flexShrink: 1 }}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: c.text }}>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.muted}
        autoCapitalize="sentences"
        {...props}
        style={[
          styles.field,
          { color: c.text, backgroundColor: c.surface, borderColor: c.border },
          props.multiline ? { minHeight: 110, textAlignVertical: "top" } : null,
          style,
        ]}
      />
    </View>
  );
}
export function Empty({ children }: PropsWithChildren) {
  return (
    <Card>
      <Body>{children || "Nothing here yet."}</Body>
    </Card>
  );
}
const styles = StyleSheet.create({
  screen: {
    padding: 20,
    gap: 16,
    flexGrow: 1,
    width: "100%",
    maxWidth: 840,
    alignSelf: "center",
    paddingBottom: 36,
  },
  card: { borderWidth: 1, borderRadius: 18, padding: 18, gap: 12 },
  title: {
    fontSize: 26,
    lineHeight: 33,
    fontWeight: "800",
    letterSpacing: -0.7,
  },
  body: { fontSize: 15, lineHeight: 23 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  button: {
    minHeight: 46,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  field: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
});
