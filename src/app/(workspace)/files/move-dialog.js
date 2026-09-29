"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function MoveDialog({ fileId, fileName, onClose }) {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [target, setTarget] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const res = await fetch(`/api/files/${fileId}/move`);
      if (cancelled) return;

      if (res.ok) {
        const d = await res.json();
        setData(d);
        // Default to the first folder rather than the current one,
        // since picking the folder it is already in does nothing.
        setTarget(d.folders[0]?.id ?? "");
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Could not load folders.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  // Escape closes. Bound to the document so it works wherever focus is,
  // rather than only when something inside the panel has it.
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function move() {
    setBusy(true);
    setError("");

    const res = await fetch(`/api/files/${fileId}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId: target || null }),
    });

    setBusy(false);

    if (res.ok) {
      onClose();
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Could not move the file.");
    }
  }

  const noFolders = data && data.folders.length === 0 && !data.currentFolderId;
  const canMove = Boolean(data) && !noFolders;

  return (
    <div style={S.backdrop} onClick={busy ? undefined : onClose}>
      <div
        style={S.panel}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <style>{`
          .md-ghost:hover { background: var(--bg); }
          .md-primary:hover:not(:disabled) { filter: brightness(1.06); }
          .md-select:hover { border-color: var(--muted); }
          .md-select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
        `}</style>

        {/* An icon gives the dialog a focal point instead of opening on
            three lines of stacked text. */}
        <span style={S.icon}>
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
          </svg>
        </span>

        <p style={S.eyebrow}>Move</p>
        <h2 style={S.title} title={fileName}>
          {fileName}
        </h2>

        {!data ? (
          <p style={S.muted}>Loading…</p>
        ) : noFolders ? (
          <p style={S.empty}>
            There are no folders yet. Create one from the Drive first, then move
            this file into it.
          </p>
        ) : (
          <>
            <label style={S.label} htmlFor="target">
              Move to
            </label>
            <select
              id="target"
              className="md-select"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              style={S.input}
              disabled={busy}
            >
              {data.folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
              {data.currentFolderId ? (
                <option value="">Out of this folder</option>
              ) : null}
            </select>
          </>
        )}

        {error ? <p style={S.error}>{error}</p> : null}

        {/* Side by side: two choices of equal standing, not a primary with
            an afterthought underneath it. */}
        <div style={S.actions}>
          <button
            type="button"
            className="md-ghost"
            onClick={onClose}
            disabled={busy}
            style={
              busy ? { ...S.cancel, opacity: 0.5, cursor: "default" } : S.cancel
            }
          >
            Cancel
          </button>
          {canMove ? (
            <button
              type="button"
              className="md-primary"
              onClick={move}
              disabled={busy}
              style={
                busy
                  ? { ...S.confirm, opacity: 0.6, cursor: "default" }
                  : S.confirm
              }
            >
              {busy ? "Moving…" : "Move file"}
            </button>
          ) : null}
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
    // Above the portalled row menus (1000), so it can't open behind one.
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
    margin: "6px 0 20px",
    lineHeight: 1.35,
    wordBreak: "break-word",
  },

  label: {
    display: "block",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: ".04em",
    textTransform: "uppercase",
    color: "var(--muted)",
    marginBottom: 7,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "11px 12px",
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    color: "var(--text)",
    fontSize: 14,
    cursor: "pointer",
    transition: "border-color .12s ease, box-shadow .12s ease",
  },
  muted: {
    color: "var(--muted)",
    fontSize: 13.5,
    padding: "8px 0",
    lineHeight: 1.5,
  },
  empty: {
    color: "var(--muted)",
    fontSize: 13.5,
    lineHeight: 1.55,
    background: "var(--bg)",
    borderRadius: 8,
    padding: "12px 14px",
    margin: 0,
  },
  error: {
    fontSize: 13,
    color: "var(--danger)",
    background: "var(--danger-soft)",
    padding: "10px 13px",
    borderRadius: 8,
    marginTop: 14,
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
};
