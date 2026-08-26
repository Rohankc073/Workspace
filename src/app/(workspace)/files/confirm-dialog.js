"use client";

/**
 * A small centered yes/no confirmation dialog, styled to match the app's other
 * dialogs (MoveDialog). Replaces window.confirm().
 *
 * Props:
 *   eyebrow      - small label above the title (e.g. "Move to trash")
 *   title        - heading (often the item name)
 *   message      - the confirmation question / explanation
 *   confirmLabel - confirm button text (e.g. "Move to trash")
 *   danger       - if true, the confirm button uses the danger colour
 *   busy         - disables the button, shows working text
 *   onConfirm()  - called when confirmed
 *   onClose()    - called on cancel / backdrop / Esc
 */
export default function ConfirmDialog({
  eyebrow = "Confirm",
  title = "",
  message = "",
  confirmLabel = "Confirm",
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}) {
  function onKeyDown(e) {
    if (e.key === "Escape") onClose();
    if (e.key === "Enter") onConfirm();
  }

  return (
    <div style={S.backdrop} onClick={onClose} onKeyDown={onKeyDown}>
      <div style={S.panel} onClick={(e) => e.stopPropagation()}>
        <p className="eyebrow">{eyebrow}</p>
        {title ? <h2 style={S.title}>{title}</h2> : null}
        {message ? <p style={S.message}>{message}</p> : null}

        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          style={danger ? S.buttonDanger : S.button}
          autoFocus
        >
          {busy ? "Working" : confirmLabel}
        </button>

        <button type="button" onClick={onClose} style={S.close}>
          Cancel
        </button>
      </div>
    </div>
  );
}

const S = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    zIndex: 50,
  },
  panel: {
    width: "100%",
    maxWidth: 420,
    background: "var(--card)",
    border: "1px solid var(--line)",
    borderRadius: 4,
    padding: 26,
  },
  title: { fontSize: 17, fontWeight: 500, marginTop: 6, marginBottom: 10 },
  message: {
    fontSize: 13,
    color: "var(--muted)",
    lineHeight: 1.5,
    marginBottom: 4,
  },
  button: {
    width: "100%",
    marginTop: 18,
    padding: "10px 16px",
    background: "var(--gold)",
    color: "#0b0d10",
    border: "none",
    borderRadius: 3,
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
  },
  buttonDanger: {
    width: "100%",
    marginTop: 18,
    padding: "10px 16px",
    background: "var(--danger)",
    color: "#fff",
    border: "none",
    borderRadius: 3,
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
  },
  close: {
    marginTop: 14,
    background: "none",
    border: "none",
    color: "var(--muted)",
    fontSize: 12,
    cursor: "pointer",
    padding: 0,
  },
};
