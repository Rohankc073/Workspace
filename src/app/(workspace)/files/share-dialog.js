"use client";

import { useEffect, useState } from "react";

const LEVELS = [
  { key: "viewer", label: "Viewer" },
  { key: "commenter", label: "Commenter" },
  { key: "editor", label: "Editor" },
];

/** Must stay in sync with EXPIRY_MS in the share-links route. */
const EXPIRY_OPTIONS = [
  { key: "30m", label: "30 min" },
  { key: "1h", label: "1 hour" },
  { key: "1d", label: "1 day" },
  { key: "7d", label: "7 days" },
  { key: "never", label: "Never" },
];

const ACCESS_OPTIONS = [
  { key: "view", label: "View only" },
  { key: "edit", label: "Can edit" },
];

function shareUrl(token) {
  return `${window.location.origin}/s/${token}`;
}

/** Null / undefined expiresAt means the link is permanent. */
function expiryLabel(expiresAt) {
  if (!expiresAt) return "never expires";
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `expires in ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `expires in ${hrs} hr`;
  return `expires in ${Math.round(hrs / 24)} d`;
}

export default function ShareDialog({ fileId, fileName, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState("");
  const [level, setLevel] = useState("viewer");
  const [busy, setBusy] = useState(false);

  // External share links
  const [links, setLinks] = useState([]);
  const [linksLoading, setLinksLoading] = useState(true);
  const [expiresIn, setExpiresIn] = useState("30m");
  const [linkAccess, setLinkAccess] = useState("view");
  const [linkPassword, setLinkPassword] = useState("");
  const [creatingLink, setCreatingLink] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [copiedId, setCopiedId] = useState(null);

  async function load() {
    const res = await fetch(`/api/files/${fileId}/permissions`);
    if (res.ok) {
      const d = await res.json();
      setData(d);
      setUserId(d.members[0]?.id ?? "");
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Could not load sharing settings.");
    }
  }

  async function loadLinks() {
    setLinksLoading(true);
    try {
      const res = await fetch(`/api/files/${fileId}/share-links`);
      const d = await res.json();
      setLinks(res.ok ? d.links : []);
    } catch {
      setLinks([]);
    }
    setLinksLoading(false);
  }

  useEffect(() => {
    load();
    loadLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  // Escape closes the dialog.
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function grant() {
    setBusy(true);
    const res = await fetch(`/api/files/${fileId}/permissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, level }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Could not save.");
    } else {
      setError("");
      await load();
    }
    setBusy(false);
  }

  async function revoke(grantId) {
    await fetch(`/api/files/${fileId}/permissions`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grantId }),
    });
    await load();
  }

  async function createLink() {
    // A link that never expires can only be stopped by revoking it, so make
    // that an explicit decision rather than a click away from "30 min".
    if (expiresIn === "never") {
      const ok = window.confirm(
        "This link will keep working forever for anyone who has it — including if it gets forwarded on. You can still revoke it later. Create it?",
      );
      if (!ok) return;
    }

    setCreatingLink(true);
    setLinkError("");
    try {
      const res = await fetch(`/api/files/${fileId}/share-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expiresIn,
          canEdit: linkAccess === "edit",
          password: linkPassword.trim() || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setLinkError(d.error || "Could not create link.");
      } else {
        setLinkPassword("");
        await loadLinks();
      }
    } catch {
      setLinkError("Could not create link.");
    }
    setCreatingLink(false);
  }

  async function revokeLink(linkId) {
    if (
      !window.confirm(
        "Revoke this link? Anyone holding it loses access immediately.",
      )
    )
      return;
    const res = await fetch(`/api/files/${fileId}/share-links/${linkId}`, {
      method: "DELETE",
    });
    if (res.ok) loadLinks();
    else window.alert("Could not revoke that link.");
  }

  async function copyLink(token, linkId) {
    try {
      await navigator.clipboard.writeText(shareUrl(token));
      setCopiedId(linkId);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      window.prompt("Copy this link:", shareUrl(token));
    }
  }

  const noOneToShareWith = data && data.members.length === 0;
  const activeLinks = links.filter((l) => l.active);
  const isPermanent = expiresIn === "never";

  return (
    <div style={S.backdrop} onClick={onClose}>
      <div style={S.panel} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={S.header}>
          <div style={S.headerText}>
            <p style={S.eyebrow}>Sharing</p>
            <h2 style={S.title}>{fileName}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={S.xButton}
            aria-label="Close"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        {error && <p style={S.error}>{error}</p>}

        {/* ---------- People inside the company ---------- */}
        <p style={S.sectionLabel}>People with access</p>

        {!data ? (
          <p style={S.muted}>Loading…</p>
        ) : (
          <>
            <div style={S.list}>
              {data.grants.length === 0 ? (
                <p style={S.muted}>Only you can see this document.</p>
              ) : (
                data.grants.map((g) => (
                  <div key={g.id} style={S.row}>
                    <span style={S.avatar}>
                      {(g.userName ?? g.role ?? "?").charAt(0).toUpperCase()}
                    </span>
                    <span style={S.rowName}>{g.userName ?? g.role}</span>
                    <span style={S.level}>
                      {LEVELS.find((l) => l.key === g.level)?.label ?? g.level}
                    </span>
                    <button onClick={() => revoke(g.id)} style={S.remove}>
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>

            <div style={S.form}>
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                style={S.input}
                disabled={noOneToShareWith}
              >
                {noOneToShareWith ? (
                  <option value="">No one else in this company yet</option>
                ) : (
                  data.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} — {m.email}
                    </option>
                  ))
                )}
              </select>

              <div style={S.formRow}>
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  style={{ ...S.input, flex: 1 }}
                  disabled={noOneToShareWith}
                >
                  {LEVELS.map((l) => (
                    <option key={l.key} value={l.key}>
                      {l.label}
                    </option>
                  ))}
                </select>

                <button
                  onClick={grant}
                  disabled={busy || !userId}
                  style={S.button}
                >
                  {busy ? "Saving…" : "Give access"}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ---------- Link for outsiders ---------- */}
        <div style={S.linkSection}>
          <p style={S.linkHeading}>Link for people outside the company</p>
          <p style={S.linkNote}>
            Anyone with the link can open this file — no account needed. Choose
            what they can do and how long the link stays live.
          </p>

          <p style={S.linkLabel}>Access</p>
          <div style={S.segRowTwo}>
            {ACCESS_OPTIONS.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => setLinkAccess(o.key)}
                style={linkAccess === o.key ? S.segOn : S.seg}
              >
                {o.label}
              </button>
            ))}
          </div>

          {linkAccess === "edit" ? (
            <p style={S.linkWarn}>
              Anyone with this link can change the document. Use a password and
              a short expiry.
            </p>
          ) : null}

          <p style={S.linkLabel}>Expires</p>
          <div style={S.segGrid}>
            {EXPIRY_OPTIONS.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => setExpiresIn(o.key)}
                style={expiresIn === o.key ? S.segOn : S.seg}
              >
                {o.label}
              </button>
            ))}
          </div>

          {isPermanent ? (
            <p style={S.linkWarn}>
              This link never stops working. It stays live if it's forwarded on
              or if the person leaves their job — revoking it here is the only
              way to close it. A password is strongly recommended.
            </p>
          ) : null}

          <input
            type="text"
            value={linkPassword}
            onChange={(e) => setLinkPassword(e.target.value)}
            placeholder={
              isPermanent ? "Password (recommended)" : "Optional password"
            }
            style={S.linkInput}
          />

          <button
            type="button"
            onClick={createLink}
            disabled={creatingLink}
            style={creatingLink ? S.createBusy : S.create}
          >
            {creatingLink ? "Creating…" : "Create link"}
          </button>

          {linkError && <p style={S.error}>{linkError}</p>}

          <div style={S.linkList}>
            {linksLoading ? (
              <p style={S.muted}>Loading…</p>
            ) : activeLinks.length === 0 ? (
              <p style={S.emptyLinks}>No active links.</p>
            ) : (
              activeLinks.map((l) => (
                <div key={l.id} style={S.linkCard}>
                  <div style={S.linkTop}>
                    <span style={S.url}>{shareUrl(l.token)}</span>
                  </div>

                  <div style={S.linkBottom}>
                    <div style={S.badges}>
                      <span style={l.canEdit ? S.badgeWarn : S.badge}>
                        {l.canEdit ? "Can edit" : "View only"}
                      </span>
                      <span style={!l.expiresAt ? S.badgeWarn : S.badge}>
                        {expiryLabel(l.expiresAt)}
                      </span>
                      {l.hasPassword ? (
                        <span style={S.badge}>Password</span>
                      ) : null}
                    </div>

                    <div style={S.linkActions}>
                      <button
                        type="button"
                        onClick={() => copyLink(l.token, l.id)}
                        style={S.small}
                      >
                        {copiedId === l.id ? "Copied" : "Copy"}
                      </button>
                      <button
                        type="button"
                        onClick={() => revokeLink(l.id)}
                        style={S.smallDanger}
                      >
                        Revoke
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={S.footer}>
          <button onClick={onClose} style={S.done}>
            Done
          </button>
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
    zIndex: 50,
  },
  panel: {
    width: "100%",
    maxWidth: 480,
    background: "var(--card)",
    border: "1px solid var(--line)",
    borderRadius: 10,
    padding: "22px 24px 20px",
    maxHeight: "90vh",
    overflowY: "auto",
    // The dialog inherits text-align from its parent in some routes; pin it.
    textAlign: "left",
    boxShadow: "0 12px 32px rgba(0,0,0,0.22)",
  },

  header: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 18,
  },
  headerText: { flex: 1, minWidth: 0 },
  eyebrow: {
    fontSize: 11,
    color: "var(--muted)",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    margin: 0,
  },
  title: {
    fontSize: 17,
    fontWeight: 500,
    margin: "4px 0 0",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  xButton: {
    background: "none",
    border: "none",
    color: "var(--muted)",
    cursor: "pointer",
    padding: 4,
    lineHeight: 0,
    borderRadius: 999,
    flexShrink: 0,
  },

  sectionLabel: {
    fontSize: 11,
    color: "var(--muted)",
    margin: "0 0 8px",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  muted: { color: "var(--muted)", fontSize: 13, padding: "10px 0", margin: 0 },
  error: { color: "var(--danger)", fontSize: 13, marginBottom: 12 },

  list: { borderTop: "1px solid var(--line)" },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 0",
    borderBottom: "1px solid var(--line)",
    fontSize: 13,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 999,
    background: "var(--panel)",
    border: "1px solid var(--line)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--muted)",
    flexShrink: 0,
  },
  rowName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  level: {
    marginLeft: "auto",
    color: "var(--muted)",
    fontSize: 12,
    flexShrink: 0,
  },
  remove: {
    background: "none",
    border: "none",
    color: "var(--danger)",
    fontSize: 12,
    cursor: "pointer",
    flexShrink: 0,
  },

  form: { display: "flex", flexDirection: "column", gap: 10, marginTop: 16 },
  formRow: { display: "flex", gap: 10 },
  input: {
    padding: "9px 11px",
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 6,
    color: "var(--text)",
    fontSize: 13,
    minWidth: 0,
  },
  button: {
    padding: "9px 16px",
    background: "var(--gold)",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  // External link section
  linkSection: {
    marginTop: 22,
    paddingTop: 18,
    borderTop: "1px solid var(--line)",
  },
  linkHeading: { fontSize: 13, fontWeight: 600, margin: "0 0 4px" },
  linkNote: {
    fontSize: 12,
    color: "var(--muted)",
    margin: "0 0 14px",
    lineHeight: 1.5,
  },
  linkLabel: {
    fontSize: 11,
    color: "var(--muted)",
    margin: "0 0 6px",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  linkWarn: {
    fontSize: 12,
    color: "var(--danger)",
    margin: "0 0 12px",
    lineHeight: 1.5,
    background: "rgba(217,48,37,0.07)",
    border: "1px solid rgba(217,48,37,0.25)",
    borderRadius: 6,
    padding: "8px 10px",
  },
  segRowTwo: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 8,
    marginBottom: 14,
  },
  segGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 8,
    marginBottom: 14,
  },
  seg: {
    padding: "9px 0",
    fontSize: 13,
    cursor: "pointer",
    background: "var(--panel)",
    color: "var(--text)",
    border: "1px solid var(--line)",
    borderRadius: 6,
  },
  segOn: {
    padding: "9px 0",
    fontSize: 13,
    cursor: "pointer",
    background: "var(--gold)",
    color: "#fff",
    border: "1px solid var(--gold)",
    borderRadius: 6,
    fontWeight: 600,
  },
  linkInput: {
    width: "100%",
    boxSizing: "border-box",
    padding: "9px 11px",
    fontSize: 13,
    background: "var(--panel)",
    color: "var(--text)",
    border: "1px solid var(--line)",
    borderRadius: 6,
    marginBottom: 10,
  },
  create: {
    width: "100%",
    padding: "10px 0",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    background: "var(--gold)",
    color: "#fff",
    border: "none",
    borderRadius: 6,
  },
  createBusy: {
    width: "100%",
    padding: "10px 0",
    fontSize: 13,
    fontWeight: 600,
    cursor: "default",
    background: "var(--gold)",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    opacity: 0.6,
  },

  linkList: {
    marginTop: 14,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  emptyLinks: {
    color: "var(--muted)",
    fontSize: 12,
    margin: 0,
    padding: "4px 0",
  },
  linkCard: {
    border: "1px solid var(--line)",
    borderRadius: 8,
    padding: "10px 12px",
    background: "var(--panel)",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  linkTop: { minWidth: 0 },
  url: {
    display: "block",
    fontSize: 12,
    fontFamily: "monospace",
    color: "var(--text)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  linkBottom: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  badges: { display: "flex", gap: 6, flexWrap: "wrap", flex: 1, minWidth: 0 },
  badge: {
    fontSize: 11,
    color: "var(--muted)",
    background: "var(--card)",
    border: "1px solid var(--line)",
    borderRadius: 999,
    padding: "2px 8px",
    whiteSpace: "nowrap",
  },
  badgeWarn: {
    fontSize: 11,
    color: "var(--danger)",
    background: "var(--card)",
    border: "1px solid rgba(217,48,37,0.35)",
    borderRadius: 999,
    padding: "2px 8px",
    whiteSpace: "nowrap",
  },
  linkActions: { display: "flex", gap: 6, flexShrink: 0 },
  small: {
    padding: "5px 12px",
    fontSize: 12,
    cursor: "pointer",
    background: "var(--card)",
    color: "var(--text)",
    border: "1px solid var(--line)",
    borderRadius: 6,
  },
  smallDanger: {
    padding: "5px 12px",
    fontSize: 12,
    cursor: "pointer",
    background: "var(--card)",
    color: "var(--danger)",
    border: "1px solid var(--line)",
    borderRadius: 6,
  },

  footer: {
    marginTop: 20,
    paddingTop: 14,
    borderTop: "1px solid var(--line)",
    display: "flex",
    justifyContent: "flex-end",
  },
  done: {
    padding: "8px 18px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    background: "var(--panel)",
    color: "var(--text)",
    border: "1px solid var(--line)",
    borderRadius: 6,
  },
};
