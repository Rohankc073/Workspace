"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MENU_CSS = `
.ct-menu { animation: ctIn 120ms ease-out; }
@keyframes ctIn { from { opacity: 0; transform: translateY(-4px);} to { opacity: 1; transform: none; } }
.ct-item { transition: background 90ms ease; }
.ct-item:hover, .ct-item:focus-visible { background: rgba(0,0,0,0.045); outline: none; }
.ct-item.ct-danger:hover, .ct-item.ct-danger:focus-visible { background: var(--danger-soft); }
`;

/**
 * Actions for a company sitting in the trash: restore it, or delete it
 * permanently (which wipes its contents and frees the name). Portalled menu.
 */
export default function CompanyTrashActions({ companyId, name }) {
  const router = useRouter();
  const trigger = useRef(null);
  const menuRef = useRef(null);

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [dialog, setDialog] = useState(false);
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
        setDialog(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

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

  async function restore() {
    setOpen(false);
    setBusy(true);
    const res = await fetch(`/api/admin/companies/${companyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restore: true }),
    });
    setBusy(false);
    if (res.ok) {
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      window.alert(d.error || "Could not restore the company.");
    }
  }

  async function purge(confirmName) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/admin/companies/${companyId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purge: true, confirmName }),
    });
    setBusy(false);
    if (res.ok) {
      setDialog(false);
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
            className="ct-menu"
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
              className="ct-item"
              style={S.item}
              onClick={restore}
            >
              Restore
            </button>
            <div style={S.divider} />
            <button
              type="button"
              role="menuitem"
              className="ct-item ct-danger"
              style={S.itemDanger}
              onClick={() => {
                setOpen(false);
                setError("");
                setDialog(true);
              }}
            >
              Delete permanently
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

      {dialog ? (
        <PurgeDialog
          name={name}
          busy={busy}
          error={error}
          onCancel={() => setDialog(false)}
          onConfirm={purge}
        />
      ) : null}
    </div>
  );
}

function PurgeDialog({ name, busy, error, onCancel, onConfirm }) {
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === name;

  return (
    <div style={M.backdrop} onClick={onCancel}>
      <div style={M.panel} onClick={(e) => e.stopPropagation()}>
        <p className="eyebrow" style={{ ...M.eyebrow, color: "var(--danger)" }}>
          Delete permanently
        </p>
        <h3 style={M.title}>{name}</h3>
        <p style={M.sub}>
          This <strong>cannot be undone</strong>. It permanently erases {name}{" "}
          and everything in it:
        </p>
        <ul style={M.list}>
          <li>
            all of its documents, folders, and file history — deleted from disk
          </li>
          <li>
            everyone who belongs only to this company — their accounts are
            deleted
          </li>
          <li>the company name and domain — freed so they can be used again</li>
        </ul>
        <p style={M.subSmall}>
          People who also belong to another company are kept; they simply lose
          access here.
        </p>

        <label style={M.label} htmlFor="purgename">
          Type <strong style={{ color: "var(--text)" }}>{name}</strong> to
          confirm
        </label>
        <input
          id="purgename"
          className="field"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={name}
          autoFocus
          autoComplete="off"
        />

        {error ? <p style={M.error}>{error}</p> : null}

        <div style={M.actions}>
          <button type="button" className="btn btn-text" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy || !matches}
            onClick={() => onConfirm(typed.trim())}
          >
            {busy ? "Deleting" : "Delete permanently"}
          </button>
        </div>
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
    minWidth: 190,
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
    background: "rgba(32,33,36,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    zIndex: 1100,
  },
  panel: {
    width: "100%",
    maxWidth: 460,
    background: "var(--panel)",
    borderRadius: 12,
    padding: 26,
    boxShadow: "var(--shadow-raised)",
  },
  eyebrow: { marginBottom: 6 },
  title: { fontSize: 18, fontWeight: 500 },
  sub: { fontSize: 13, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 },
  subSmall: {
    fontSize: 12,
    color: "var(--muted)",
    marginTop: 10,
    lineHeight: 1.5,
  },
  list: {
    fontSize: 13,
    color: "var(--muted)",
    margin: "10px 0 0",
    paddingLeft: 18,
    lineHeight: 1.6,
  },
  label: {
    display: "block",
    fontSize: 13,
    color: "var(--muted)",
    margin: "18px 0 6px",
  },
  error: {
    fontSize: 13,
    color: "var(--danger)",
    background: "var(--danger-soft)",
    padding: "10px 14px",
    borderRadius: "var(--r-card)",
    marginTop: 16,
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 24,
  },
};
