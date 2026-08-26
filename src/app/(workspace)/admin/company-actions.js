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

/**
 * Per-company actions for the super admin: edit name + domain, or delete.
 * Delete is a soft-delete (recoverable) and requires typing the company name
 * to confirm. The menu is portalled to document.body so it can't be clipped.
 */
export default function CompanyActions({ companyId, name, domain }) {
  const router = useRouter();
  const trigger = useRef(null);
  const menuRef = useRef(null);

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [dialog, setDialog] = useState(null);
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
        setDialog(null);
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
    if (!open || !pos || !menuRef.current) return;
    const first = menuRef.current.querySelector(".ca-item");
    if (first) first.focus();
  }, [open, pos]);

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

  function onMenuKeyDown(e) {
    if (!menuRef.current) return;
    const items = Array.from(menuRef.current.querySelectorAll(".ca-item"));
    if (!items.length) return;
    const i = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(i + 1) % items.length].focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length].focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0].focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1].focus();
    }
  }

  function openDialog(which) {
    setOpen(false);
    setError("");
    setDialog(which);
  }

  async function saveEdit(nextName, nextDomain) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/admin/companies/${companyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nextName, domain: nextDomain }),
    });
    setBusy(false);
    if (res.ok) {
      setDialog(null);
      router.refresh();
      return;
    }
    const d = await res.json().catch(() => ({}));
    setError(d.error || "Could not save the company.");
  }

  async function confirmDelete(confirmName) {
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
            aria-label={`Actions for ${name}`}
            ref={menuRef}
            className="ca-menu"
            onKeyDown={onMenuKeyDown}
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
              onClick={() => openDialog("edit")}
            >
              Edit company
            </button>
            <div style={S.divider} />
            <button
              type="button"
              role="menuitem"
              className="ca-item ca-danger"
              style={S.itemDanger}
              onClick={() => openDialog("delete")}
            >
              Delete company
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
          onSubmit={saveEdit}
        />
      ) : null}

      {dialog === "delete" ? (
        <DeleteDialog
          name={name}
          busy={busy}
          error={error}
          onCancel={() => setDialog(null)}
          onConfirm={confirmDelete}
        />
      ) : null}
    </div>
  );
}

function EditDialog({ name, domain, busy, error, onCancel, onSubmit }) {
  const [nextName, setNextName] = useState(name ?? "");
  const [nextDomain, setNextDomain] = useState(domain ?? "");
  const unchanged =
    nextName.trim() === (name ?? "") && nextDomain.trim() === (domain ?? "");

  return (
    <Modal onCancel={onCancel}>
      <p className="eyebrow" style={M.eyebrow}>
        Edit company
      </p>
      <h3 style={M.title}>{name}</h3>

      <label style={M.label} htmlFor="coname">
        Name
      </label>
      <input
        id="coname"
        className="field"
        value={nextName}
        onChange={(e) => setNextName(e.target.value)}
        autoFocus
      />

      <label style={M.label} htmlFor="codomain">
        Email domain
      </label>
      <input
        id="codomain"
        className="field"
        value={nextDomain}
        onChange={(e) => setNextDomain(e.target.value)}
        placeholder="e.g. acme.com"
      />
      <p style={M.hint}>
        New users in this company get email addresses at this domain.
      </p>

      {error ? <p style={M.error}>{error}</p> : null}

      <div style={M.actions}>
        <button type="button" className="btn btn-text" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !nextName.trim() || unchanged}
          onClick={() => onSubmit(nextName.trim(), nextDomain.trim())}
        >
          {busy ? "Saving" : "Save changes"}
        </button>
      </div>
    </Modal>
  );
}

function DeleteDialog({ name, busy, error, onCancel, onConfirm }) {
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === name;

  return (
    <Modal onCancel={onCancel}>
      <p className="eyebrow" style={{ ...M.eyebrow, color: "var(--danger)" }}>
        Delete company
      </p>
      <h3 style={M.title}>{name}</h3>
      <p style={M.sub}>
        This hides {name} and everyone in it — its users can no longer sign in,
        and its files and folders disappear from view. Nothing is permanently
        destroyed; it can be restored later.
      </p>

      <label style={M.label} htmlFor="confirmname">
        Type <strong style={{ color: "var(--text)" }}>{name}</strong> to confirm
      </label>
      <input
        id="confirmname"
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
          {busy ? "Deleting" : "Delete company"}
        </button>
      </div>
    </Modal>
  );
}

function Modal({ children, onCancel }) {
  return (
    <div style={M.backdrop} onClick={onCancel}>
      <div style={M.panel} onClick={(e) => e.stopPropagation()}>
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
    maxWidth: 420,
    background: "var(--panel)",
    borderRadius: 12,
    padding: 26,
    boxShadow: "var(--shadow-raised)",
  },
  eyebrow: { marginBottom: 6 },
  title: { fontSize: 18, fontWeight: 500 },
  sub: { fontSize: 13, color: "var(--muted)", marginTop: 4, lineHeight: 1.5 },
  label: {
    display: "block",
    fontSize: 13,
    color: "var(--muted)",
    margin: "18px 0 6px",
  },
  hint: { fontSize: 12, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 },
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
