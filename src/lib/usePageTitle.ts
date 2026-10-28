import { useEffect } from "react";

const BASE_TITLE = "Presspaper";

/** Per-screen document titles so tabs, history and bookmarks are legible. */
export function usePageTitle(title?: string | null) {
  useEffect(() => {
    const clean = title?.trim();
    document.title = clean ? `${clean} · ${BASE_TITLE}` : BASE_TITLE;
    return () => {
      document.title = BASE_TITLE;
    };
  }, [title]);
}
