"use client";

/**
 * A small centered "OK" notice, styled to match the app's other dialogs.
 * Replaces window.alert(). One button, dismisses on OK / backdrop / Esc.
 *
 * Props:
 *   eyebrow      - small label above (e.g. "Can't delete")
 *   title        - optional heading
 *   message      - the notice text
 *   confirmLabel - button text (default "OK")
 *   danger       - if true, uses a subtle danger accent on the eyebrow
 *   onClose()    - called on OK / backdrop / Esc
 */
export default function AlertDialog({
  eyebrow = "Notice",
  title = "",
  message = "",
  confirmLabel = "OK",
  danger = false,
  onClose,
}) {
  function onKeyDown(e) {
    if (e.key === "Escape" || e.key === "Enter") onClose();
  }

  return (
    <div style={S.backdrop} onClick={onClose} onKeyDown={onKeyDown}>
      <div style={S.panel} onClick={(e) => e.stopPropagation()}>
        <p
          className="eyebrow"
          style={danger ? { color: "var(--danger)" } : undefined}
        >
          {eyebrow}
        </p>
        {title ? <h2 style={S.title}>{title}</h2> : null}
        {message ? <p style={S.message}>{message}</p> : null}

        <button type="button" onClick={onClose} style={S.button} autoFocus>
          {confirmLabel}
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
  message: { fontSize: 13, color: "var(--muted)", lineHeight: 1.5 },
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
};
