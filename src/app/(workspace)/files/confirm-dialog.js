"use client";

import { useEffect, useRef } from "react";

/**
 * A small centred yes/no confirmation dialog. Replaces window.confirm().
 *
 * Props:
 *   eyebrow      - small label above the title (e.g. "Move to trash")
 *   title        - heading (often the item name)
 *   message      - the confirmation question / explanation
 *   confirmLabel - confirm button text (e.g. "Move to trash")
 *   cancelLabel  - cancel button text (default "Cancel")
 *   danger       - if true, the confirm button and icon use the danger colour
 *   busy         - disables the buttons, shows working text
 *   onConfirm()  - called when confirmed
 *   onClose()    - called on cancel / backdrop / Esc
 */
export default function ConfirmDialog({
  eyebrow = "Confirm",
  title = "",
  message = "",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}) {
  const confirmRef = useRef(null);

  // Escape and Enter were bound to the backdrop div, which only fires when
  // something inside has focus. A document listener works wherever the
  // focus happens to be.
  useEffect(() => {
    function onKey(e) {
      if (busy) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose, onConfirm]);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  return (
    <div style={S.backdrop} onClick={busy ? undefined : onClose}>
      <div
        style={S.panel}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <style>{`
          .cd-ghost:hover { background: var(--bg); }
          .cd-primary:hover:not(:disabled) { filter: brightness(1.06); }
          .cd-primary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        `}</style>

        {/* An icon gives the dialog a focal point, and its colour says at a
            glance whether this is routine or destructive. */}
        <span style={danger ? S.iconDanger : S.icon}>
          {danger ? (
            <svg
              viewBox="0 0 24 24"
              width="22"
              height="22"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              width="22"
              height="22"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
            </svg>
          )}
        </span>

        <p style={S.eyebrow}>{eyebrow}</p>
        {title ? (
          <h2 style={S.title} title={title}>
            {title}
          </h2>
        ) : null}
        {message ? <p style={S.message}>{message}</p> : null}

        {/* Side by side: these are two choices of equal standing, not a
            primary action with an afterthought underneath it. */}
        <div style={S.actions}>
          <button
            type="button"
            className="cd-ghost"
            onClick={onClose}
            disabled={busy}
            style={
              busy ? { ...S.cancel, opacity: 0.5, cursor: "default" } : S.cancel
            }
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className="cd-primary"
            onClick={onConfirm}
            disabled={busy}
            style={{
              ...(danger ? S.confirmDanger : S.confirm),
              ...(busy ? { opacity: 0.6, cursor: "default" } : null),
            }}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const S = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(32,33,36,0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    // Above the portalled row menus (1000) so it can't open behind one.
    zIndex: 1200,
  },
  panel: {
    width: "100%",
    maxWidth: 400,
    background: "var(--card)",
    border: "1px solid var(--line)",
    borderRadius: 14,
    padding: "24px 24px 20px",
    boxShadow: "0 12px 32px rgba(0,0,0,0.22)",
    // This dialog inherits text-align from its parent on some routes, which
    // is why everything used to sit right-aligned. Pin it.
    textAlign: "left",
  },

  icon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    background: "var(--accent-soft)",
    color: "var(--accent)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  iconDanger: {
    width: 44,
    height: 44,
    borderRadius: 12,
    background: "var(--danger-soft)",
    color: "var(--danger)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },

  eyebrow: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: ".07em",
    textTransform: "uppercase",
    color: "var(--muted)",
    margin: 0,
  },
  title: {
    fontSize: 17,
    fontWeight: 600,
    margin: "6px 0 0",
    lineHeight: 1.35,
    wordBreak: "break-word",
  },
  message: {
    fontSize: 13.5,
    color: "var(--muted)",
    lineHeight: 1.55,
    margin: "10px 0 0",
  },

  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 24,
  },
  cancel: {
    padding: "10px 18px",
    background: "transparent",
    color: "var(--text-2)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    fontWeight: 500,
    fontSize: 13.5,
    cursor: "pointer",
    transition: "background .12s ease",
  },
  confirm: {
    padding: "10px 20px",
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontWeight: 600,
    fontSize: 13.5,
    cursor: "pointer",
    transition: "filter .12s ease",
  },
  confirmDanger: {
    padding: "10px 20px",
    background: "var(--danger)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontWeight: 600,
    fontSize: 13.5,
    cursor: "pointer",
    transition: "filter .12s ease",
  },
};
