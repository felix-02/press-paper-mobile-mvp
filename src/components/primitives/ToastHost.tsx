import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";

/** Bottom-right toast stack. Used for "Published", "Saved as draft", etc. */
export function ToastHost() {
  const toasts = useAppStore((s) => s.toasts);
  const dismiss = useAppStore((s) => s.dismissToast);

  return (
    <div
      style={{
        position: "fixed",
        right: 24,
        bottom: 24,
        zIndex: 200,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        pointerEvents: "none",
      }}
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pp-rise"
          role={t.variant === "error" ? "alert" : undefined}
          style={{
            pointerEvents: "auto",
            minWidth: 280,
            maxWidth: 380,
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
            background: "var(--surface-2)",
            border: `1px solid ${t.variant === "error" ? "color-mix(in srgb, var(--red) 45%, transparent)" : "var(--border-strong)"}`,
            borderRadius: "var(--r-md)",
            padding: "13px 14px",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <span style={{ marginTop: 1 }}>
            {t.variant === "success" ? (
              <CheckCircle2 size={18} color="var(--green)" />
            ) : t.variant === "error" ? (
              <AlertTriangle size={18} color="var(--red)" />
            ) : (
              <Info size={18} color="var(--blue)" />
            )}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{t.title}</div>
            {t.description && (
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
                {t.description}
              </div>
            )}
          </div>
          <button
            onClick={() => dismiss(t.id)}
            style={{ color: "var(--text-muted)", marginTop: 1 }}
            aria-label="Dismiss"
          >
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}
