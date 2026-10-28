import { useCallback, useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "presspaper-theme";
const CHANGE_EVENT = "presspaper-theme-change";

function readPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
  } catch {
    return "system";
  }
}

function readSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/**
 * User-selectable product theme. The preference is shared between shell
 * controls, persisted locally, and reacts to operating-system changes while
 * the "system" option is active.
 */
export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readPreference());
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => readSystemTheme());

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const syncSystemTheme = () => setSystemTheme(media.matches ? "light" : "dark");
    const syncPreference = (event: Event) => {
      const shared = event instanceof CustomEvent ? event.detail : null;
      setPreferenceState(shared === "light" || shared === "dark" || shared === "system" ? shared : readPreference());
    };

    syncSystemTheme();
    window.addEventListener("storage", syncPreference);
    window.addEventListener(CHANGE_EVENT, syncPreference);
    media.addEventListener("change", syncSystemTheme);

    return () => {
      window.removeEventListener("storage", syncPreference);
      window.removeEventListener(CHANGE_EVENT, syncPreference);
      media.removeEventListener("change", syncSystemTheme);
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* The in-memory preference still works when storage is unavailable. */
    }
    window.dispatchEvent(new CustomEvent<ThemePreference>(CHANGE_EVENT, { detail: next }));
  }, []);

  const resolvedTheme: ResolvedTheme = preference === "system" ? systemTheme : preference;
  const toggle = useCallback(() => {
    setPreference(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme, setPreference]);

  return { preference, resolvedTheme, setPreference, toggle };
}
