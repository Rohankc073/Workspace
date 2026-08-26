"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ConfirmDialog from "./confirm-dialog";
import MoveDialog from "./move-dialog";
import ShareDialog from "./share-dialog";

export default function FileMenu({
  fileId,
  fileName,
  canShare,
  canDelete,
  canMove,
}) {
  const router = useRouter();
  const wrap = useRef(null);
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);

  // Split "report.docx" -> base "report", ext "docx" for the rename dialog.
  const lastDot = fileName.lastIndexOf(".");
  const baseName = lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
  const extension = lastDot > 0 ? fileName.slice(lastDot + 1) : "";

  useEffect(() => {
    function onDocClick(e) {
      if (wrap.current && !wrap.current.contains(e.target)) setOpen(false);
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

  /** Opens the confirmation. The actual transfer happens in confirmDownload. */
  function download() {
    setOpen(false);
    setDialog("download");
  }

  function confirmDownload() {
    setDialog(null);
    window.location.href = `/api/files/${fileId}/download`;
  }

  /**
   * Shared by both render branches below, so the Download item behaves the
   * same whether or not the person has share/move/delete rights.
   */
  const downloadDialog =
    dialog === "download" ? (
      <ConfirmDialog
        eyebrow="Download"
        title={fileName}
        message="This file will be saved to your device. Downloads are recorded in the activity log."
        confirmLabel="Download"
        onConfirm={confirmDownload}
        onClose={() => setDialog(null)}
      />
    ) : null;

  const nothingToShow = !canShare && !canDelete && !canMove;
  if (nothingToShow) {
    return (
      <div ref={wrap} style={S.wrap}>
        <button
          type="button"
          style={S.trigger}
          onClick={() => setOpen((v) => !v)}
          aria-label={`Actions for ${fileName}`}
        >
          <Dots />
        </button>
        {open ? (
          <div role="menu" style={S.menu}>
            <button
              type="button"
              role="menuitem"
              style={S.item}
              onClick={download}
            >
              Download
            </button>
          </div>
        ) : null}

        {downloadDialog}
      </div>
    );
  }

  return (
    <div ref={wrap} style={S.wrap}>
      <button
        type="button"
        style={S.trigger}
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${fileName}`}
      >
        <Dots />
      </button>

      {open ? (
        <div role="menu" style={S.menu}>
          {canMove ? (
            <button
              type="button"
              role="menuitem"
              style={S.item}
              onClick={() => {
                setOpen(false);
                setDialog("move");
              }}
            >
              Move
            </button>
          ) : null}

          {canShare ? (
            <button
              type="button"
              role="menuitem"
              style={S.item}
              onClick={() => {
                setOpen(false);
                setDialog("share");
              }}
            >
              Share
            </button>
          ) : null}

          {canDelete ? (
            <button
              type="button"
              role="menuitem"
              style={S.item}
              onClick={() => {
                setOpen(false);
                setDialog("rename");
              }}
            >
              Rename
            </button>
          ) : null}

          <button
            type="button"
            role="menuitem"
            style={S.item}
            onClick={download}
          >
            Download
          </button>

          {canDelete ? (
            <>
              <div style={S.divider} />
              <button
                type="button"
                role="menuitem"
                style={S.itemDanger}
                onClick={() => {
                  setOpen(false);
                  setDialog("trash");
                }}
              >
                Move to trash
              </button>
            </>
          ) : null}
        </div>
      ) : null}

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

      {downloadDialog}

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
    zIndex: 60,
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
  },
  menu: {
    position: "absolute",
    top: "calc(100% + 4px)",
    right: 0,
    minWidth: 180,
    background: "var(--panel)",
    border: "1px solid var(--line-soft)",
    borderRadius: "var(--r-card)",
    boxShadow: "var(--shadow-raised)",
    padding: "6px 0",
    zIndex: 40,
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
