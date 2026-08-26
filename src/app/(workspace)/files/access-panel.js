"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const LEVEL_LABEL = {
  editor: "Can edit",
  commenter: "Can comment",
  viewer: "Can view",
};

/**
 * A read-only "who has access" button for a file row. Opens a panel showing
 * the creator and everyone the file is shared with, at their level. Anyone who
 * can see the file can open this; changing access still lives in the Share
 * dialog (manager-only).
 */
export default function AccessPanel({ fileId, fileName }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setError("");
    fetch(`/api/files/${fileId}/access`)
      .then(async (res) => {
        const d = await res.json().catch(() => ({}));
        if (!alive) return;
        if (res.ok) setData(d);
        else setError(d.error || "Could not load access.");
      })
      .catch(() => alive && setError("Could not load access."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [open, fileId]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const initials = (name) =>
    (name || "?")
      .split(" ")
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

  const modal =
    open && mounted
      ? createPortal(
          <div style={M.backdrop} onClick={() => setOpen(false)}>
            <div
              style={M.panel}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <p style={M.eyebrow}>Who has access</p>
              <h3 style={M.title}>{data?.fileName ?? fileName}</h3>

              {loading ? <p style={M.muted}>Loading…</p> : null}
              {error ? <p style={M.error}>{error}</p> : null}

              {!loading && !error && data ? (
                <>
                  {data.creator ? (
                    <div style={M.section}>
                      <p style={M.label}>Created by</p>
                      <div style={M.person}>
                        <span style={M.avatar}>
                          {initials(data.creator.name)}
                        </span>
                        <span style={M.pName}>
                          {data.creator.name}
                          {data.creator.email ? (
                            <span style={M.pEmail}>{data.creator.email}</span>
                          ) : null}
                        </span>
                      </div>
                    </div>
                  ) : null}

                  <div style={M.section}>
                    <p style={M.label}>Shared with</p>
                    {data.access.length === 0 ? (
                      <p style={M.muted}>
                        Not shared with anyone specifically. People with access
                        through their role or the folder aren’t listed here.
                      </p>
                    ) : (
                      <div style={M.list}>
                        {data.access.map((a) => (
                          <div key={a.id} style={M.person}>
                            <span
                              style={
                                a.kind === "role" ? M.avatarRole : M.avatar
                              }
                            >
                              {a.kind === "role" ? "👥" : initials(a.name)}
                            </span>
                            <span style={M.pName}>
                              {a.name}
                              {a.email ? (
                                <span style={M.pEmail}>{a.email}</span>
                              ) : null}
                            </span>
                            <span style={M.level}>
                              {LEVEL_LABEL[a.level] ?? a.level}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : null}

              <div style={M.actions}>
                <button
                  type="button"
                  className="btn btn-text"
                  onClick={() => setOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        style={S.trigger}
        onClick={() => setOpen(true)}
        aria-label={`Who has access to ${fileName}`}
        title="Who has access"
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
        </svg>
      </button>
      {modal}
    </>
  );
}

const S = {
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
    maxWidth: 440,
    background: "var(--panel)",
    borderRadius: 12,
    padding: 26,
    boxShadow: "var(--shadow-raised)",
    maxHeight: "80vh",
    overflowY: "auto",
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: ".06em",
    textTransform: "uppercase",
    color: "var(--muted)",
    marginBottom: 6,
  },
  title: { fontSize: 18, fontWeight: 500, wordBreak: "break-word" },
  section: { marginTop: 20 },
  label: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: ".04em",
    textTransform: "uppercase",
    color: "var(--muted)",
    marginBottom: 10,
  },
  list: { display: "flex", flexDirection: "column", gap: 12 },
  person: { display: "flex", alignItems: "center", gap: 12 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 999,
    background: "var(--accent-soft)",
    color: "var(--accent)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 600,
    flexShrink: 0,
  },
  avatarRole: {
    width: 32,
    height: 32,
    borderRadius: 999,
    background: "var(--bg)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    flexShrink: 0,
  },
  pName: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: 500,
  },
  pEmail: { fontSize: 12, color: "var(--muted)", fontWeight: 400 },
  level: {
    fontSize: 12,
    color: "var(--text-2)",
    background: "var(--bg)",
    padding: "3px 10px",
    borderRadius: 999,
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  muted: { fontSize: 13, color: "var(--muted)", lineHeight: 1.5 },
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
