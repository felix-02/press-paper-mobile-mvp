import { useEffect, useRef, useState } from "react";

/**
 * Progressive reveal: shows `step` items, then loads `step` more whenever the
 * sentinel scrolls into view — up to `total`. Resets when `resetKey` changes.
 */
export function useInfiniteScroll(total: number, step = 8, resetKey?: unknown) {
  const [visible, setVisible] = useState(step);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisible(step);
  }, [resetKey, step]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisible((v) => Math.min(v + step, total));
      },
      { rootMargin: "300px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [total, step]);

  return { visible: Math.min(visible, total), hasMore: visible < total, sentinelRef };
}
