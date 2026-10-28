import { useCallback, useState } from "react";

const KEY = "pp_sidebar_collapsed";

/** Persisted collapse state for the workspace sidebar. */
export function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggle = useCallback(() => {
    setCollapsed((value) => {
      const next = !value;
      try {
        localStorage.setItem(KEY, next ? "1" : "0");
      } catch {
        /* preference just won't persist */
      }
      return next;
    });
  }, []);
  return [collapsed, toggle];
}
