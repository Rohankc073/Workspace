"use client";

import { useEffect, useState } from "react";

/**
 * Hands everything one person created to someone else.
 *
 * Needed because only a file's creator may permanently delete it. When
 * someone leaves, their documents would otherwise be stuck — an admin can
 * trash them but never purge them. Reassigning ownership fixes that properly
 * rather than carving out an exception to the rule.
 *
 * Loads its own candidates and counts from the API, so the admin pages don't
 * have to thread a list of every colleague through as props.
 */
export default function TransferFilesDialog({
  name,
  userId,
  onCancel,
  onDone,
}) {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [toId, setToId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/users/${userId}/transfer-files`)
      .then(async (res) => {
        const d = await res.json().catch(() => ({}));
        if (!alive) return;
        if (res.ok) {
          setData(d);
          setToId(d.candidates[0]?.id ?? "");
        } else {
          setLoadError(d.error || "Could not load.");
        }
      })
      .catch(() => alive && setLoadError("Could not load."));
    return () => {
      alive = false;
    };
  }, [userId]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape" && !busy) onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  const total = data ? data.fileCount + data.folderCount : 0;
  const recipient = data?.candidates.find((c) => c.id === toId);

  async function submit() {
    const ok = window.confirm(
      `Move ${data.fileCount} file(s) and ${data.folderCount} folder(s) from ${name} to ${recipient?.name}? ${recipient?.name} becomes the owner and can delete them permanently.`,
    );
    if (!ok) return;

    setBusy(true);
    setError("");
    const res = await fetch(`/api/admin/users/${userId}/transfer-files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toUserId: toId }),
    });
    setBusy(false);

    if (res.ok) {
      onDone();
      return;
    }
    const d = await res.json().catch(() => ({}));
    setError(d.error || "Could not transfer.");
  }

  return (
    <div style={M.backdrop} onClick={busy ? undefined : onCancel}>
      <div style={M.panel} onClick={(e) => e.stopPropagation()}>
        <p className="eyebrow" style={M.eyebrow}>
          Transfer files
        </p>
        <h3 style={M.title}>{name}</h3>
        <p style={M.sub}>
          Everything they created moves to someone else, who becomes the owner.
          Do this before disabling or deleting an account — only an owner can
          permanently delete a document.
        </p>

        {loadError ? <p style={M.error}>{loadError}</p> : null}

        {!data && !loadError ? <p style={M.sub}>Loading…</p> : null}

        {data ? (
          <>
            <p style={M.count}>
              {data.fileCount} {data.fileCount === 1 ? "file" : "files"} ·{" "}
              {data.folderCount} {data.folderCount === 1 ? "folder" : "folders"}
            </p>

            {total === 0 ? (
              <p style={M.sub}>
                They haven’t created anything, so there’s nothing to move.
              </p>
            ) : data.candidates.length === 0 ? (
              <p style={M.sub}>
                No one else is in their company yet. Add someone first.
              </p>
            ) : (
              <>
                <label style={M.label} htmlFor="transferto">
                  Transfer to
                </label>
                <select
                  id="transferto"
                  className="field"
                  value={toId}
                  onChange={(e) => setToId(e.target.value)}
                >
                  {data.candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.email}
                    </option>
                  ))}
                </select>
              </>
            )}
          </>
        ) : null}

        {error ? <p style={M.error}>{error}</p> : null}

        <div style={M.actions}>
          <button
            type="button"
            className="btn btn-text"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !data || total === 0 || !toId}
            onClick={submit}
          >
            {busy ? "Transferring" : "Transfer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Matches the M styles in user-actions.js so the dialog looks native there.
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
  count: {
    fontSize: 13,
    fontWeight: 500,
    color: "var(--text-2)",
    background: "var(--bg)",
    padding: "10px 14px",
    borderRadius: "var(--r-card)",
    marginTop: 16,
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
