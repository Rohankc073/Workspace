"use client";

import { useState } from "react";

/**
 * A small centered dialog that asks for a single name. Styled to match the
 * app's other dialogs (MoveDialog). Replaces window.prompt() for creating
 * documents and folders.
 *
 * Props:
 *   eyebrow   - small label above the title (e.g. "New document")
 *   title     - heading (e.g. "Name this document")
 *   label     - field label (e.g. "Name")
 *   confirmLabel - button text (e.g. "Create")
 *   placeholder  - input placeholder
 *   busy      - external busy state (disables the button, shows working text)
 *   onSubmit(name) - called with the trimmed name
 *   onClose() - called on cancel / backdrop / Esc
 */
export default function NameDialog({
  eyebrow = "New",
  title = "Name",
  label = "Name",
  confirmLabel = "Create",
  placeholder = "",
  busy = false,
  onSubmit,
  onClose,
}) {
  const [name, setName] = useState("");
  const trimmed = name.trim();

  function submit() {
    if (!trimmed || busy) return;
    onSubmit(trimmed);
  }

  function onKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  return (
    <div style={S.backdrop} onClick={onClose}>
      <div style={S.panel} onClick={(e) => e.stopPropagation()}>
        <p className="eyebrow">{eyebrow}</p>
        <h2 style={S.title}>{title}</h2>

        <label style={S.label} htmlFor="name-dialog-input">
          {label}
        </label>
        <input
          id="name-dialog-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoFocus
          autoComplete="off"
          style={S.input}
        />

        <button
          type="button"
          onClick={submit}
          disabled={busy || !trimmed}
          style={S.button}
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
  title: { fontSize: 17, fontWeight: 500, marginTop: 6, marginBottom: 18 },
  label: {
    display: "block",
    fontSize: 12,
    color: "var(--muted)",
    marginBottom: 6,
  },
  input: {
    width: "100%",
    padding: "9px 11px",
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 3,
    color: "var(--text)",
    fontSize: 13,
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
