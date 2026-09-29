"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MENU_CSS = `
.ca-menu { animation: caIn 120ms ease-out; }
@keyframes caIn { from { opacity: 0; transform: translateY(-4px);} to { opacity: 1; transform: none; } }
.ca-item { transition: background 90ms ease; }
.ca-item:hover, .ca-item:focus-visible { background: rgba(0,0,0,0.045); outline: none; }
.ca-item.ca-danger:hover, .ca-item.ca-danger:focus-visible { background: var(--danger-soft); }
`;

/** Rename, change the domain, or move a live company to the trash. */
export default function CompanyActions({ companyId, name, domain }) {
  const router = useRouter();
  const trigger = useRef(null);
  const menuRef = useRef(null);

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [dialog, setDialog] = useState(null); // 'edit' | 'delete'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function onDocClick(e) {
      const t = trigger.current;
      const m = menuRef.current;
      if (t && t.contains(e.target)) return;
      if (m && m.contains(e.target)) return;
      setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") {
        setOpen(false);
        if (!busy) setDialog(null);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [busy]);

  useLayoutEffect(() => {
    if (!open || !trigger.current || !menuRef.current) return;
    const t = trigger.current.getBoundingClientRect();
    const h = menuRef.current.offsetHeight;
    const w = menuRef.current.offsetWidth;
    const margin = 8;
    const spaceBelow = window.innerHeight - t.bottom;
    let top;
    if (spaceBelow >= h + margin) top = t.bottom + 4;
    else if (t.top >= h + margin) top = t.top - 4 - h;
    else top = Math.max(margin, window.innerHeight - margin - h);
    let right = window.innerWidth - t.right;
    if (window.innerWidth - right - w < margin)
      right = window.innerWidth - w - margin;
    if (right < margin) right = margin;
    setPos({ top, right });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onScroll(e) {
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      setOpen(false);
    }
    function onResize() {
      setOpen(false);
    }
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  function choose(which) {
    setOpen(false);
    setError("");
    setDialog(which);
  }

  async function save({ name: newName, domain: newDomain }) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/admin/companies/${companyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, domain: newDomain }),
    });
    setBusy(false);
    if (res.ok) {
      setDialog(null);
      router.refresh();
      return;
    }
    const d = await res.json().catch(() => ({}));
    setError(d.error || "Could not save the changes.");
  }

  async function remove(confirmName) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/admin/companies/${companyId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmName }),
    });
    setBusy(false);
    if (res.ok) {
      setDialog(null);
      router.refresh();
      return;
    }
    const d = await res.json().catch(() => ({}));
    setError(d.error || "Could not delete the company.");
  }

  const menu =
    open && mounted
      ? createPortal(
          <div
            role="menu"
            ref={menuRef}
            className="ca-menu"
            style={{
              ...S.menu,
              ...(pos
                ? { top: pos.top, right: pos.right, visibility: "visible" }
                : { top: 0, right: 0, visibility: "hidden" }),
            }}
          >
            <style>{MENU_CSS}</style>
            <button
              type="button"
              role="menuitem"
              className="ca-item"
              style={S.item}
              onClick={() => choose("edit")}
            >
              Edit details
            </button>
            <div style={S.divider} />
            <button
              type="button"
              role="menuitem"
              className="ca-item ca-danger"
              style={S.itemDanger}
              onClick={() => choose("delete")}
            >
              Move to trash
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <div style={S.wrap}>
      <button
        type="button"
        ref={trigger}
        style={{ ...S.trigger, ...(open ? S.triggerOpen : null) }}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${name}`}
        disabled={busy}
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
        </svg>
      </button>

      {menu}

      {dialog === "edit" ? (
        <EditDialog
          name={name}
          domain={domain}
          busy={busy}
          error={error}
          onCancel={() => setDialog(null)}
          onSave={save}
        />
      ) : null}

      {dialog === "delete" ? (
        <DeleteDialog
          name={name}
          busy={busy}
          error={error}
          onCancel={() => setDialog(null)}
          onConfirm={remove}
        />
      ) : null}
    </div>
  );
}

function EditDialog({ name, domain, busy, error, onCancel, onSave }) {
  const [form, setForm] = useState({ name, domain });
  const unchanged = form.name.trim() === name && form.domain.trim() === domain;
  const valid =
    form.name.trim().length >= 2 && form.domain.trim().includes(".");

  return (
    <Shell onCancel={onCancel} busy={busy}>
      <span style={M.icon}>
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
        </svg>
      </span>

      <h3 style={M.title}>Edit company</h3>
      <p style={M.sub}>
        Renaming changes how the company appears everywhere. Existing documents
        keep working.
      </p>

      <label style={M.label} htmlFor="ca-name">
        Company name
      </label>
      <input
        id="ca-name"
        className="field ca-field"
        value={form.name}
        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        autoFocus
        style={M.input}
      />

      <label style={M.label} htmlFor="ca-domain">
        Email domain
      </label>
      <input
        id="ca-domain"
        className="field ca-field"
        value={form.domain}
        onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))}
        placeholder="acme.com"
        style={M.input}
      />
      <p style={M.hint}>
        Only affects new accounts. Nobody's existing address changes.
      </p>

      {error ? <p style={M.error}>{error}</p> : null}

      <div style={M.actions}>
        <button
          type="button"
          className="ca-ghost"
          onClick={onCancel}
          disabled={busy}
          style={busy ? { ...M.cancel, opacity: 0.5 } : M.cancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="ca-primary"
          disabled={busy || unchanged || !valid}
          onClick={() =>
            onSave({ name: form.name.trim(), domain: form.domain.trim() })
          }
          style={busy || unchanged || !valid ? M.confirmOff : M.confirm}
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </Shell>
  );
}

function DeleteDialog({ name, busy, error, onCancel, onConfirm }) {
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === name;

  return (
    <Shell onCancel={onCancel} busy={busy}>
      <span style={M.iconDanger}>
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
        </svg>
      </span>

      <p style={M.eyebrow}>Move to trash</p>
      <h3 style={M.title}>{name}</h3>

      {/* What actually happens, as a list — it was a paragraph people had to
          parse to work out whether anything was destroyed. */}
      <ul style={M.list}>
        <li>Its people can no longer sign in</li>
        <li>Its documents and folders disappear from view</li>
        <li>Nothing is destroyed — you can restore it from the Trash tab</li>
      </ul>

      <label style={M.label} htmlFor="ca-confirm">
        Type <strong style={{ color: "var(--text)" }}>{name}</strong> to confirm
      </label>
      <input
        id="ca-confirm"
        className="field ca-field"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={name}
        autoFocus
        autoComplete="off"
        style={M.input}
      />

      {error ? <p style={M.error}>{error}</p> : null}

      <div style={M.actions}>
        <button
          type="button"
          className="ca-ghost"
          onClick={onCancel}
          disabled={busy}
          style={busy ? { ...M.cancel, opacity: 0.5 } : M.cancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="ca-primary"
          disabled={busy || !matches}
          onClick={() => onConfirm(typed.trim())}
          style={busy || !matches ? M.confirmDangerOff : M.confirmDanger}
        >
          {busy ? "Moving…" : "Move to trash"}
        </button>
      </div>
    </Shell>
  );
}

function Shell({ children, onCancel, busy }) {
  return (
    <div style={M.backdrop} onClick={busy ? undefined : onCancel}>
      <div
        style={M.panel}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <style>{`
          .ca-field:hover { border-color: var(--muted); }
          .ca-field:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
          .ca-ghost:hover { background: var(--bg); }
          .ca-primary:hover:not(:disabled) { filter: brightness(1.06); }
        `}</style>
        {children}
      </div>
    </div>
  );
}

const S = {
  wrap: { position: "relative", display: "inline-flex" },
  trigger: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    borderRadius: 999,
    border: "none",
    background: "none",
    color: "var(--muted)",
    cursor: "pointer",
    transition: "background 90ms ease, color 90ms ease",
  },
  triggerOpen: { background: "rgba(0,0,0,0.06)", color: "var(--text)" },
  menu: {
    position: "fixed",
    minWidth: 180,
    background: "var(--panel)",
    border: "1px solid var(--line-soft)",
    borderRadius: "var(--r-card)",
    boxShadow: "var(--shadow-raised)",
    padding: "6px 0",
    zIndex: 1000,
    maxHeight: "calc(100vh - 16px)",
    overflowY: "auto",
  },
  item: {
    display: "block",
    width: "100%",
    padding: "9px 18px",
    background: "none",
    border: "none",
    textAlign: "left",
    fontSize: 14,
    color: "var(--text)",
    cursor: "pointer",
  },
  itemDanger: {
    display: "block",
    width: "100%",
    padding: "9px 18px",
    background: "none",
    border: "none",
    textAlign: "left",
    fontSize: 14,
    color: "var(--danger)",
    cursor: "pointer",
  },
  divider: { height: 1, background: "var(--line-soft)", margin: "6px 0" },
};

const M = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(32,33,36,0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    zIndex: 1200,
  },
  panel: {
    width: "100%",
    maxWidth: 420,
    background: "var(--panel)",
    borderRadius: 14,
    padding: "24px 26px 22px",
    boxShadow: "0 12px 32px rgba(0,0,0,0.22)",
    maxHeight: "88vh",
    overflowY: "auto",
    // Inherited text-align from the table is why this dialog rendered
    // right-aligned. Pin it.
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
    fontSize: 19,
    fontWeight: 600,
    letterSpacing: "-0.01em",
    margin: "6px 0 0",
    wordBreak: "break-word",
  },
  sub: {
    fontSize: 13.5,
    color: "var(--muted)",
    marginTop: 8,
    lineHeight: 1.55,
  },
  list: {
    fontSize: 13.5,
    color: "var(--muted)",
    margin: "14px 0 0",
    paddingLeft: 18,
    lineHeight: 1.7,
  },

  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--text-2)",
    margin: "18px 0 6px",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    marginBottom: 0,
    transition: "border-color .14s ease, box-shadow .14s ease",
  },
  hint: { fontSize: 12, color: "var(--muted)", marginTop: 7, lineHeight: 1.5 },

  error: {
    fontSize: 13,
    color: "var(--danger)",
    background: "var(--danger-soft)",
    padding: "10px 14px",
    borderRadius: 8,
    marginTop: 16,
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 26,
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
  confirmOff: {
    padding: "10px 20px",
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontWeight: 600,
    fontSize: 13.5,
    cursor: "default",
    opacity: 0.45,
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
  confirmDangerOff: {
    padding: "10px 20px",
    background: "var(--danger)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontWeight: 600,
    fontSize: 13.5,
    cursor: "default",
    opacity: 0.45,
  },
};
