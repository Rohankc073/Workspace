"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

function fmtSize(bytes) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * A person's name, rendered as a button. Clicking it opens a popover listing
 * every document that person created (scoped, on the server, to what the
 * viewer may see). Read-only overview; names link into the editor.
 */
export default function UserDocuments({ userId, name }) {
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
    fetch(`/api/admin/users/${userId}/documents`)
      .then(async (res) => {
        const d = await res.json().catch(() => ({}));
        if (!alive) return;
        if (res.ok) setData(d);
        else setError(d.error || "Could not load documents.");
      })
      .catch(() => alive && setError("Could not load documents."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [open, userId]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

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
              <p style={M.eyebrow}>Documents created</p>
              <h3 style={M.title}>{data?.userName ?? name}</h3>

              {loading ? <p style={M.muted}>Loading…</p> : null}
              {error ? <p style={M.error}>{error}</p> : null}

              {!loading && !error && data ? (
                data.documents.length === 0 ? (
                  <p style={M.muted}>
                    This person hasn’t created any documents.
                  </p>
                ) : (
                  <>
                    <p style={M.count}>
                      {data.documents.length}{" "}
                      {data.documents.length === 1 ? "document" : "documents"}
                    </p>
                    <div style={M.tableWrap}>
                      <table style={M.table}>
                        <thead>
                          <tr>
                            <th style={M.th}>Name</th>
                            <th style={M.th}>Company</th>
                            <th style={M.thNum}>Size</th>
                            <th style={M.th}>Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.documents.map((f) => (
                            <tr key={f.id}>
                              <td style={M.td}>
                                <Link href={`/edit/${f.id}`} style={M.link}>
                                  <span
                                    style={f.trashed ? M.nameOff : undefined}
                                  >
                                    {f.name}
                                  </span>
                                </Link>
                                {f.trashed ? (
                                  <span style={M.trash}>Trashed</span>
                                ) : null}
                              </td>
                              <td style={M.tdMuted}>{f.company}</td>
                              <td style={M.tdNum}>{fmtSize(f.size)}</td>
                              <td style={M.tdMuted}>{fmtDate(f.createdAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )
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
        title={`Documents created by ${name}`}
      >
        {name}
      </button>
      {modal}
    </>
  );
}

const S = {
  trigger: {
    background: "none",
    border: "none",
    padding: 0,
    margin: 0,
    font: "inherit",
    color: "var(--text)",
    fontWeight: 500,
    cursor: "pointer",
    textAlign: "left",
    textDecoration: "underline",
    textDecorationColor: "var(--line)",
    textUnderlineOffset: 3,
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
    maxWidth: 620,
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
  title: { fontSize: 18, fontWeight: 500 },
  count: { fontSize: 13, color: "var(--muted)", margin: "14px 0 8px" },
  tableWrap: {
    border: "1px solid var(--line-soft)",
    borderRadius: 8,
    overflow: "hidden",
  },
  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    textAlign: "left",
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: ".03em",
    textTransform: "uppercase",
    color: "var(--muted)",
    padding: "10px 14px",
    background: "var(--bg)",
    whiteSpace: "nowrap",
  },
  thNum: {
    textAlign: "right",
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: ".03em",
    textTransform: "uppercase",
    color: "var(--muted)",
    padding: "10px 14px",
    background: "var(--bg)",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "10px 14px",
    borderTop: "1px solid var(--line-soft)",
    fontSize: 14,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  tdMuted: {
    padding: "10px 14px",
    borderTop: "1px solid var(--line-soft)",
    fontSize: 13,
    color: "var(--muted)",
    whiteSpace: "nowrap",
  },
  tdNum: {
    padding: "10px 14px",
    borderTop: "1px solid var(--line-soft)",
    fontSize: 13,
    color: "var(--text-2)",
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  link: { color: "var(--accent)", textDecoration: "none", fontWeight: 500 },
  nameOff: { color: "var(--muted)", textDecoration: "line-through" },
  trash: {
    fontSize: 11,
    fontWeight: 500,
    color: "var(--danger)",
    background: "var(--danger-soft)",
    padding: "2px 8px",
    borderRadius: 999,
  },
  muted: { fontSize: 13, color: "var(--muted)", marginTop: 14 },
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
    marginTop: 20,
  },
};
