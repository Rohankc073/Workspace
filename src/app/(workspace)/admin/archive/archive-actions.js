"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Per-row actions for an archived document: move it into a live company, or
 * destroy it.
 *
 * The archive is a holding area, not a graveyard — without "move to company"
 * the only way a document ever leaves is through the database.
 */
export default function ArchiveActions({ fileId, fileName, companies }) {
  const router = useRouter();
  const [dialog, setDialog] = useState(null); // 'move' | 'delete'
  const [target, setTarget] = useState(companies[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!dialog) return;
    function onKey(e) {
      if (e.key === "Escape" && !busy) close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialog, busy]);

  function close() {
    setDialog(null);
    setError("");
  }

  async function move() {
    if (!target) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/archive/${fileId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetCompanyId: target }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        close();
        router.refresh();
        return;
      }
      setError(d.error || "Could not move it.");
    } catch {
      setError("Could not move it.");
    }
    setBusy(false);
  }

  async function destroy() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/archive/${fileId}`, {
        method: "DELETE",
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        close();
        router.refresh();
        return;
      }
      setError(d.error || "Could not delete it.");
    } catch {
      setError("Could not delete it.");
    }
    setBusy(false);
  }

  return (
    <span style={S.row}>
      <style>{`
        .ar-btn { transition: background .12s ease, color .12s ease; }
        .ar-btn:hover { background: var(--bg); color: var(--text); }
        .ar-danger:hover { background: var(--danger-soft); color: var(--danger); }
        .ar-ghost:hover { background: var(--bg); }
        .ar-primary:hover:not(:disabled) { filter: brightness(1.06); }
        .ar-select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
      `}</style>

      <a
        href={`/api/files/${fileId}/download`}
        className="ar-btn"
        style={S.small}
        title="Download"
      >
        Download
      </a>

      <button
        type="button"
        className="ar-btn"
        onClick={() => setDialog("move")}
        style={S.small}
        disabled={companies.length === 0}
        title={
          companies.length === 0
            ? "No companies to move it to"
            : "Move to a company"
        }
      >
        Move
      </button>

      <button
        type="button"
        className="ar-btn ar-danger"
        onClick={() => setDialog("delete")}
        style={S.smallDanger}
      >
        Delete
      </button>

      {dialog ? (
        <div style={S.backdrop} onClick={busy ? undefined : close}>
          <div
            style={S.panel}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <span style={dialog === "delete" ? S.iconDanger : S.icon}>
              {dialog === "delete" ? (
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
                  <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                </svg>
              )}
            </span>

            <p style={S.eyebrow}>
              {dialog === "delete" ? "Delete forever" : "Move to a company"}
            </p>
            <h2 style={S.title}>{fileName}</h2>

            {dialog === "delete" ? (
              <p style={S.message}>
                This permanently removes the document and every saved version of
                it. It cannot be undone.
              </p>
            ) : (
              <>
                <p style={S.message}>
                  It becomes an ordinary document in that company, visible to
                  its admins and managers.
                </p>
                <label style={S.label} htmlFor={`move-${fileId}`}>
                  Move to
                </label>
                <select
                  id={`move-${fileId}`}
                  className="ar-select"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  style={S.select}
                  disabled={busy}
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </>
            )}

            {error ? <p style={S.error}>{error}</p> : null}

            <div style={S.actions}>
              <button
                type="button"
                className="ar-ghost"
                onClick={close}
                disabled={busy}
                style={busy ? { ...S.cancel, opacity: 0.5 } : S.cancel}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ar-primary"
                onClick={dialog === "delete" ? destroy : move}
                disabled={busy || (dialog === "move" && !target)}
                style={{
                  ...(dialog === "delete" ? S.confirmDanger : S.confirm),
                  ...(busy ? { opacity: 0.6, cursor: "default" } : null),
                }}
              >
                {busy
                  ? "Working…"
                  : dialog === "delete"
                    ? "Delete forever"
                    : "Move document"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </span>
  );
}

const S = {
  row: { display: "inline-flex", alignItems: "center", gap: 4 },
  small: {
    padding: "5px 11px",
    fontSize: 12,
    cursor: "pointer",
    background: "transparent",
    color: "var(--text-2)",
    border: "1px solid var(--line)",
    borderRadius: 6,
    textDecoration: "none",
    whiteSpace: "nowrap",
  },
  smallDanger: {
    padding: "5px 11px",
    fontSize: 12,
    cursor: "pointer",
    background: "transparent",
    color: "var(--muted)",
    border: "1px solid var(--line)",
    borderRadius: 6,
    whiteSpace: "nowrap",
  },

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
    maxWidth: 400,
    background: "var(--card)",
    border: "1px solid var(--line)",
    borderRadius: 14,
    padding: "24px 24px 20px",
    boxShadow: "0 12px 32px rgba(0,0,0,0.22)",
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
  label: {
    display: "block",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: ".04em",
    textTransform: "uppercase",
    color: "var(--muted)",
    margin: "18px 0 7px",
  },
  select: {
    width: "100%",
    boxSizing: "border-box",
    padding: "11px 12px",
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    color: "var(--text)",
    fontSize: 14,
    cursor: "pointer",
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
  },
};
