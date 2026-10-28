import { useEffect, useRef, useState } from "react";
import { Share2, Check } from "lucide-react";

interface Channel {
  label: string;
  color: string;
  href?: (url: string, title: string) => string;
  copy?: boolean;
}

const CHANNELS: Channel[] = [
  { label: "WhatsApp", color: "#25D366", href: (u, t) => `https://wa.me/?text=${encodeURIComponent(`${t} ${u}`)}` },
  { label: "X", color: "#000000", href: (u, t) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(t)}&url=${encodeURIComponent(u)}` },
  { label: "Facebook", color: "#1877F2", href: (u) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}` },
  { label: "LinkedIn", color: "#0A66C2", href: (u) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(u)}` },
  { label: "Email", color: "#6B7280", href: (u, t) => `mailto:?subject=${encodeURIComponent(t)}&body=${encodeURIComponent(`${t}\n\n${u}`)}` },
  { label: "Copy link", color: "#3B82F6", copy: true },
];

/** Share dropdown with real social-share links + copy. */
export function ShareMenu({ url, title, className }: { url: string; title: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const onChannel = (c: Channel) => {
    if (c.copy) {
      if (!navigator.clipboard) {
        setCopyState("failed");
        return;
      }
      navigator.clipboard.writeText(url).then(
        () => {
          setCopyState("copied");
          window.setTimeout(() => setCopyState("idle"), 1500);
        },
        () => setCopyState("failed")
      );
      return;
    }
    window.open(c.href!(url, title), "_blank", "noopener,noreferrer");
    setOpen(false);
  };

  const nativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return true;
      } catch (error) {
        return error instanceof DOMException && error.name === "AbortError";
      }
    }
    return false;
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className={className ?? "pp-btn pp-btn-outline"}
        onClick={async () => {
          // On mobile, prefer the OS share sheet; otherwise open our menu.
          if (await nativeShare()) return;
          setOpen((v) => !v);
        }}
      >
        <Share2 size={15} /> Share
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 230,
            background: "var(--surface-1)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-lg)",
            boxShadow: "var(--shadow-lg)",
            padding: 6,
            zIndex: 50,
          }}
        >
          {CHANNELS.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => onChannel(c)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                width: "100%",
                textAlign: "left",
                padding: "9px 10px",
                borderRadius: "var(--r-md)",
                background: "transparent",
                fontSize: 13.5,
                color: "var(--text)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ width: 26, height: 26, borderRadius: 999, background: c.color, display: "grid", placeItems: "center", flexShrink: 0, border: c.color === "#000000" ? "1px solid var(--border)" : "none" }}>
                {c.copy && copyState === "copied" ? (
                  <Check size={13} color="#fff" strokeWidth={3} />
                ) : (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>{c.label[0]}</span>
                )}
              </span>
              {c.copy && copyState === "copied" ? "Copied!" : c.copy && copyState === "failed" ? "Copy failed" : c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
