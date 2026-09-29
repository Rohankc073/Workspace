"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ConfirmDialog from "./confirm-dialog";
import MoveDialog from "./move-dialog";
import ShareDialog from "./share-dialog";

// Injected once, so the portalled menu can use :hover / :focus-visible and a
// small open animation that inline styles can't express.
const MENU_CSS = `
.fm-menu { animation: fmMenuIn 120ms ease-out; }
@keyframes fmMenuIn {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: none; }
}
.fm-menu .fm-item { transition: background 90ms ease; }
.fm-menu .fm-item:hover,
.fm-menu .fm-item:focus-visible {
  background: rgba(0, 0, 0, 0.045);
  outline: none;
}
.fm-menu .fm-item.fm-danger:hover,
.fm-menu .fm-item.fm-danger:focus-visible { background: var(--danger-soft); }
`;

/**
 * Row actions for one file.
 *
 * The menu is portalled onto document.body and positioned against the
 * viewport. Previously it was absolutely positioned inside the table row,
 * which meant the last rows on a page opened downward into nothing — "Share"
 * and everything under it were cut off and unreachable. Same approach as
 * UserActions in the admin table.
 */
export default function FileMenu({
  fileId,
  fileName,
  canShare,
  canDelete,
  canMove,
}) {
  const router = useRouter();
  const trigger = useRef(null);
  const menuRef = useRef(null);

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);

  // Split "report.docx" -> base "report", ext "docx" for the rename dialog.
  const lastDot = fileName.lastIndexOf(".");
  const baseName = lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
  const extension = lastDot > 0 ? fileName.slice(lastDot + 1) : "";

  useEffect(() => setMounted(true), []);

  // Close on outside click or Escape. The menu lives in the body now, so
  // check both the trigger and the menu itself.
  useEffect(() => {
    function onDocClick(e) {
      const t = trigger.current;
      const m = menuRef.current;
      if (t && t.contains(e.target)) return;
      if (m && m.contains(e.target)) return;
      setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // Place the menu against the viewport before paint, so there's no flicker.
  // Prefers dropping down; opens upward when the row is near the bottom; pins
  // to the edge if it's taller than either side.
  useLayoutEffect(() => {
    if (!open || !trigger.current || !menuRef.current) return;
    const t = trigger.current.getBoundingClientRect();
    const h = menuRef.current.offsetHeight;
    const w = menuRef.current.offsetWidth;
    const margin = 8;

    const spaceBelow = window.innerHeight - t.bottom;
    let top;
    if (spaceBelow >= h + margin) {
      top = t.bottom + 4;
    } else if (t.top >= h + margin) {
      top = t.top - 4 - h;
    } else {
      top = Math.max(margin, window.innerHeight - margin - h);
    }

    // Align the menu's right edge to the trigger's, then keep it on screen.
    let right = window.innerWidth - t.right;
    if (window.innerWidth - right - w < margin) {
      right = window.innerWidth - w - margin;
    }
    if (right < margin) right = margin;

    setPos({ top, right });
  }, [open]);

  // Move focus into the menu once it's placed, for keyboard users.
  useEffect(() => {
    if (!open || !pos || !menuRef.current) return;
    const first = menuRef.current.querySelector(".fm-item");
    if (first) first.focus();
  }, [open, pos]);

  // A fixed menu doesn't follow the page — close it if the user scrolls or
  // resizes (scrolling inside the menu itself is exempt).
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
    const items = Array.from(menuRef.current.querySelectorAll(".fm-item"));
    if (items.length === 0) return;
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

  function choose(which) {
    setOpen(false);
    setDialog(which);
  }

  async function confirmRemove() {
    setBusy(true);
    const res = await fetch(`/api/files/${fileId}/delete`, { method: "POST" });
    setBusy(false);

    if (res.ok) {
      setDialog(null);
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      window.alert(d.error || "Could not delete that file.");
    }
  }

  function confirmDownload() {
    setDialog(null);
    window.location.href = `/api/files/${fileId}/download`;
  }

  const menu =
    open && mounted
      ? createPortal(
          <div
            role="menu"
            aria-label={`Actions for ${fileName}`}
            ref={menuRef}
            className="fm-menu"
            onKeyDown={onMenuKeyDown}
            style={{
              ...S.menu,
              ...(pos
                ? { top: pos.top, right: pos.right, visibility: "visible" }
                : { top: 0, right: 0, visibility: "hidden" }),
            }}
          >
            <style>{MENU_CSS}</style>

            {canMove ? (
              <button
                type="button"
                role="menuitem"
                className="fm-item"
                style={S.item}
                onClick={() => choose("move")}
              >
                Move
              </button>
            ) : null}

            {canShare ? (
              <button
                type="button"
                role="menuitem"
                className="fm-item"
                style={S.item}
                onClick={() => choose("share")}
              >
                Share
              </button>
            ) : null}

            {canDelete ? (
              <button
                type="button"
                role="menuitem"
                className="fm-item"
                style={S.item}
                onClick={() => choose("rename")}
              >
                Rename
              </button>
            ) : null}

            <button
              type="button"
              role="menuitem"
              className="fm-item"
              style={S.item}
              onClick={() => choose("download")}
            >
              Download
            </button>

            {canDelete ? (
              <>
                <div style={S.divider} />
                <button
                  type="button"
                  role="menuitem"
                  className="fm-item fm-danger"
                  style={S.itemDanger}
                  onClick={() => choose("trash")}
                >
                  Move to trash
                </button>
              </>
            ) : null}
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
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${fileName}`}
      >
        <Dots />
      </button>

      {menu}

      {dialog === "share" ? (
        <ShareDialog
          fileId={fileId}
          fileName={fileName}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog === "move" ? (
        <MoveDialog
          fileId={fileId}
          fileName={fileName}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog === "trash" ? (
        <ConfirmDialog
          eyebrow="Move to trash"
          title={fileName}
          message="This file will be moved to the trash. You can restore it later."
          confirmLabel="Move to trash"
          danger
          busy={busy}
          onConfirm={confirmRemove}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog === "download" ? (
        <ConfirmDialog
          eyebrow="Download"
          title={fileName}
          message="This file will be saved to your device. Downloads are recorded in the activity log."
          confirmLabel="Download"
          onConfirm={confirmDownload}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog === "rename" ? (
        <RenameDialog
          fileId={fileId}
          baseName={baseName}
          extension={extension}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function RenameDialog({ fileId, baseName, extension, onClose, onDone }) {
  const [name, setName] = useState(baseName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const trimmed = name.trim();
  const unchanged = trimmed === baseName;

  async function submit() {
    if (!trimmed || unchanged) return;
    setBusy(true);
    setError("");
    const res = await fetch(`/api/files/${fileId}/rename`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    setBusy(false);
    if (res.ok) {
      onDone();
      return;
    }
    const d = await res.json().catch(() => ({}));
    setError(d.error || "Could not rename the file.");
  }

  function onKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div style={R.backdrop} onClick={onClose}>
      <div style={R.panel} onClick={(e) => e.stopPropagation()}>
        <p className="eyebrow" style={R.eyebrow}>
          Rename file
        </p>

        <label style={R.label} htmlFor="renameField">
          Name
        </label>
        <div style={R.inputRow}>
          <input
            id="renameField"
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={onKeyDown}
            autoFocus
            style={R.input}
          />
          {extension ? <span style={R.ext}>.{extension}</span> : null}
        </div>
        <p style={R.hint}>
          The file type (.{extension || "file"}) stays the same.
        </p>

        {error ? <p style={R.error}>{error}</p> : null}

        <div style={R.actions}>
          <button type="button" className="btn btn-text" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !trimmed || unchanged}
            onClick={submit}
          >
            {busy ? "Renaming" : "Rename"}
          </button>
        </div>
      </div>
    </div>
  );
}

const R = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(32,33,36,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    // Above the portalled menu (1000), in case both are ever up at once.
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
  label: {
    display: "block",
    fontSize: 13,
    color: "var(--muted)",
    margin: "10px 0 6px",
  },
  inputRow: { display: "flex", alignItems: "center", gap: 8 },
  input: { flex: 1, minWidth: 0 },
  ext: { fontSize: 14, color: "var(--muted)", whiteSpace: "nowrap" },
  hint: { fontSize: 12, color: "var(--muted)", marginTop: 8 },
  error: {
    fontSize: 13,
    color: "var(--danger)",
    background: "var(--danger-soft)",
    padding: "10px 14px",
    borderRadius: "var(--r-card)",
    marginTop: 14,
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 22,
  },
};

function Dots() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
    </svg>
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
  triggerOpen: { background: "rgba(0, 0, 0, 0.06)", color: "var(--text)" },
  menu: {
    // Fixed, not absolute: a menu inside the row is clipped by the table and
    // can't escape the bottom of the page.
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
