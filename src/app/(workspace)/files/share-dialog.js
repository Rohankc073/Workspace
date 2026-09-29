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

/**
 * Sharing, in two tabs.
 *
 * Stacked, the two halves made a dialog tall enough to run off a laptop
 * screen — the active-links list sat below the fold where nobody saw it —
 * and put two equally-weighted blue buttons on screen at once, so neither
 * read as the main action. One tab at a time means one primary button.
 */
export default function ShareDialog({ fileId, fileName, onClose }) {
  const [tab, setTab] = useState("people");

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

  /**
   * Copy, with a fallback for plain HTTP.
   *
   * navigator.clipboard only exists in a secure context (HTTPS or
   * localhost), so on http://<host>:3001 it isn't there at all and the
   * modern path fails outright — which is why this used to drop straight to
   * a prompt. execCommand("copy") is deprecated but unrestricted, and it's
   * what actually works today. All of this becomes unnecessary once the app
   * is behind HTTPS.
   */
  async function copyLink(token, linkId) {
    const url = shareUrl(token);

    const done = () => {
      setCopiedId(linkId);
      setTimeout(() => setCopiedId(null), 1500);
    };

    // 1. The proper API, when the browser offers it.
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(url);
        done();
        return;
      } catch {
        // Permission denied or blocked — fall through.
      }
    }

    // 2. The old way: a hidden textarea and execCommand. Works on HTTP.
    try {
      const ta = document.createElement("textarea");
      ta.value = url;
      // Off-screen rather than display:none — a hidden element can't be
      // selected, and iOS needs it visible and readonly.
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      ta.style.opacity = "0";
      document.body.appendChild(ta);

      ta.select();
      ta.setSelectionRange(0, url.length); // iOS ignores select() alone

      const ok = document.execCommand("copy");
      document.body.removeChild(ta);

      if (ok) {
        done();
        return;
      }
    } catch {
      // Fall through to the prompt.
    }

    // 3. Nothing worked — at least make the link selectable.
    window.prompt("Copy this link:", url);
  }

  const noOneToShareWith = data && data.members.length === 0;
  const activeLinks = links.filter((l) => l.active);
  const isPermanent = expiresIn === "never";

  return (
    <div style={S.backdrop} onClick={onClose}>
      <div style={S.panel} onClick={(e) => e.stopPropagation()}>
        <style>{`
          .sd-x:hover { background: var(--panel); color: var(--text); }
          .sd-tab:hover { color: var(--text); }
          .sd-seg:hover { border-color: var(--muted); }
          .sd-primary:hover:not(:disabled) { filter: brightness(1.06); }
          .sd-small:hover { background: var(--panel); }
          /* Removing access is routine, not destructive — it only turns red
             on hover, rather than shouting from the row. */
          .sd-remove { color: var(--muted); }
          .sd-remove:hover { color: var(--danger); }
          .sd-field:focus { outline: none; border-color: var(--accent); }
        `}</style>

        {/* Header */}
        <div style={S.header}>
          <div style={S.headerText}>
            <p style={S.eyebrow}>Sharing</p>
            <h2 style={S.title} title={fileName}>
              {fileName}
            </h2>
          </div>
          <button
            type="button"
            className="sd-x"
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

        {/* Tabs */}
        <div style={S.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            className="sd-tab"
            aria-selected={tab === "people"}
            onClick={() => setTab("people")}
            style={tab === "people" ? S.tabOn : S.tab}
          >
            People
            {data && data.grants.length > 0 ? (
              <span style={S.tabCount}>{data.grants.length}</span>
            ) : null}
          </button>
          <button
            type="button"
            role="tab"
            className="sd-tab"
            aria-selected={tab === "link"}
            onClick={() => setTab("link")}
            style={tab === "link" ? S.tabOn : S.tab}
          >
            Link
            {activeLinks.length > 0 ? (
              <span style={S.tabCount}>{activeLinks.length}</span>
            ) : null}
          </button>
        </div>

        {/* ================= People ================= */}
        {tab === "people" ? (
          <div style={S.body}>
            {error ? <p style={S.error}>{error}</p> : null}

            {!data ? (
              <p style={S.muted}>Loading…</p>
            ) : (
              <>
                {data.grants.length === 0 ? (
                  <p style={S.empty}>
                    Only you can see this document. Choose someone below to give
                    them access.
                  </p>
                ) : (
                  <div style={S.list}>
                    {data.grants.map((g) => (
                      <div key={g.id} style={S.row}>
                        <span style={S.avatar}>
                          {(g.userName ?? g.role ?? "?")
                            .charAt(0)
                            .toUpperCase()}
                        </span>
                        <span style={S.rowName}>{g.userName ?? g.role}</span>
                        <span style={S.level}>
                          {LEVELS.find((l) => l.key === g.level)?.label ??
                            g.level}
                        </span>
                        <button
                          type="button"
                          className="sd-remove"
                          onClick={() => revoke(g.id)}
                          style={S.remove}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <p style={S.fieldLabel}>Give access to</p>
                <select
                  className="sd-field"
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
                    className="sd-field"
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                    style={{ ...S.input, flex: 1, marginBottom: 0 }}
                    disabled={noOneToShareWith}
                    aria-label="Access level"
                  >
                    {LEVELS.map((l) => (
                      <option key={l.key} value={l.key}>
                        {l.label}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    className="sd-primary"
                    onClick={grant}
                    disabled={busy || !userId}
                    style={busy || !userId ? S.primaryOff : S.primary}
                  >
                    {busy ? "Saving…" : "Give access"}
                  </button>
                </div>

                <p style={S.hint}>
                  Only people in this file’s company can be given access.
                </p>
              </>
            )}
          </div>
        ) : null}

        {/* ================= Link ================= */}
        {tab === "link" ? (
          <div style={S.body}>
            <p style={S.linkNote}>
              Anyone with the link can open this file — no account needed.
            </p>

            {activeLinks.length > 0 ? (
              <div style={S.linkList}>
                {activeLinks.map((l) => (
                  <div key={l.id} style={S.linkCard}>
                    <span style={S.url}>{shareUrl(l.token)}</span>

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
                          className="sd-small"
                          onClick={() => copyLink(l.token, l.id)}
                          style={S.small}
                        >
                          {copiedId === l.id ? "Copied" : "Copy"}
                        </button>
                        <button
                          type="button"
                          className="sd-small sd-remove"
                          onClick={() => revokeLink(l.id)}
                          style={S.small}
                        >
                          Revoke
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : linksLoading ? (
              <p style={S.muted}>Loading…</p>
            ) : null}

            <p style={S.fieldLabel}>They can</p>
            <div style={S.segRowTwo}>
              {ACCESS_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  className="sd-seg"
                  onClick={() => setLinkAccess(o.key)}
                  style={linkAccess === o.key ? S.segOn : S.seg}
                >
                  {o.label}
                </button>
              ))}
            </div>

            <p style={S.fieldLabel}>Link expires</p>
            {/* auto-fit rather than a fixed 3 columns: five options used to
                wrap 3 + 2 and leave a hole in the grid. */}
            <div style={S.segAuto}>
              {EXPIRY_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  className="sd-seg"
                  onClick={() => setExpiresIn(o.key)}
                  style={expiresIn === o.key ? S.segOn : S.seg}
                >
                  {o.label}
                </button>
              ))}
            </div>

            {linkAccess === "edit" || isPermanent ? (
              <p style={S.warn}>
                {isPermanent && linkAccess === "edit"
                  ? "This link never expires and lets anyone holding it change the document. Set a password."
                  : isPermanent
                    ? "This link never stops working — revoking it here is the only way to close it. A password is recommended."
                    : "Anyone with this link can change the document. Use a password and a short expiry."}
              </p>
            ) : null}

            <input
              type="text"
              className="sd-field"
              value={linkPassword}
              onChange={(e) => setLinkPassword(e.target.value)}
              placeholder={
                isPermanent || linkAccess === "edit"
                  ? "Password (recommended)"
                  : "Password (optional)"
              }
              style={S.input}
            />

            <button
              type="button"
              className="sd-primary"
              onClick={createLink}
              disabled={creatingLink}
              style={creatingLink ? S.primaryWideOff : S.primaryWide}
            >
              {creatingLink ? "Creating…" : "Create link"}
            </button>

            {linkError ? <p style={S.error}>{linkError}</p> : null}
          </div>
        ) : null}
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
    zIndex: 1100,
  },
  panel: {
    width: "100%",
    maxWidth: 460,
    background: "var(--card)",
    border: "1px solid var(--line)",
    borderRadius: 12,
    padding: "20px 24px 22px",
    maxHeight: "88vh",
    overflowY: "auto",
    // The dialog inherits text-align from its parent in some routes; pin it.
    textAlign: "left",
    boxShadow: "0 12px 32px rgba(0,0,0,0.22)",
  },

  header: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
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
    width: 30,
    height: 30,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    flexShrink: 0,
    transition: "background .12s ease, color .12s ease",
  },

  tabs: {
    display: "flex",
    gap: 2,
    borderBottom: "1px solid var(--line)",
    marginBottom: 4,
  },
  tab: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "9px 14px",
    background: "none",
    border: "none",
    borderBottom: "2px solid transparent",
    color: "var(--muted)",
    fontSize: 13.5,
    cursor: "pointer",
    transition: "color .14s ease",
  },
  tabOn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "9px 14px",
    background: "none",
    border: "none",
    borderBottom: "2px solid var(--gold)",
    color: "var(--text)",
    fontSize: 13.5,
    fontWeight: 600,
    cursor: "pointer",
  },
  tabCount: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--muted)",
    background: "var(--panel)",
    borderRadius: 999,
    padding: "1px 7px",
  },

  body: { paddingTop: 16 },

  muted: { color: "var(--muted)", fontSize: 13, padding: "10px 0", margin: 0 },
  empty: {
    color: "var(--muted)",
    fontSize: 13,
    lineHeight: 1.5,
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    padding: "12px 14px",
    margin: "0 0 16px",
  },
  error: { color: "var(--danger)", fontSize: 13, marginBottom: 12 },
  hint: {
    fontSize: 12,
    color: "var(--muted)",
    margin: "12px 0 0",
    lineHeight: 1.5,
  },

  list: { marginBottom: 18 },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 0",
    borderBottom: "1px solid var(--line)",
    fontSize: 13.5,
  },
  avatar: {
    width: 30,
    height: 30,
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
    fontSize: 12,
    cursor: "pointer",
    flexShrink: 0,
    padding: "2px 4px",
    transition: "color .12s ease",
  },

  fieldLabel: {
    fontSize: 11,
    color: "var(--muted)",
    margin: "0 0 7px",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 11px",
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    color: "var(--text)",
    fontSize: 13.5,
    marginBottom: 10,
    transition: "border-color .12s ease",
  },
  formRow: { display: "flex", gap: 10, alignItems: "stretch" },

  primary: {
    padding: "10px 18px",
    background: "var(--gold)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontWeight: 600,
    fontSize: 13.5,
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "filter .12s ease",
  },
  primaryOff: {
    padding: "10px 18px",
    background: "var(--gold)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontWeight: 600,
    fontSize: 13.5,
    cursor: "default",
    whiteSpace: "nowrap",
    opacity: 0.45,
  },
  primaryWide: {
    width: "100%",
    padding: "11px 0",
    background: "var(--gold)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontWeight: 600,
    fontSize: 13.5,
    cursor: "pointer",
    marginTop: 4,
    transition: "filter .12s ease",
  },
  primaryWideOff: {
    width: "100%",
    padding: "11px 0",
    background: "var(--gold)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontWeight: 600,
    fontSize: 13.5,
    cursor: "default",
    marginTop: 4,
    opacity: 0.5,
  },

  linkNote: {
    fontSize: 12.5,
    color: "var(--muted)",
    margin: "0 0 16px",
    lineHeight: 1.5,
  },
  segRowTwo: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 8,
    marginBottom: 16,
  },
  segAuto: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(74px, 1fr))",
    gap: 8,
    marginBottom: 16,
  },
  seg: {
    padding: "9px 4px",
    fontSize: 13,
    cursor: "pointer",
    background: "var(--panel)",
    color: "var(--text)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    transition: "border-color .12s ease",
  },
  segOn: {
    padding: "9px 4px",
    fontSize: 13,
    cursor: "pointer",
    background: "var(--gold)",
    color: "#fff",
    border: "1px solid var(--gold)",
    borderRadius: 8,
    fontWeight: 600,
  },
  warn: {
    fontSize: 12,
    color: "#b06000",
    margin: "0 0 14px",
    lineHeight: 1.5,
    background: "rgba(244,180,0,0.10)",
    border: "1px solid rgba(244,180,0,0.35)",
    borderRadius: 8,
    padding: "9px 11px",
  },

  linkList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginBottom: 20,
  },
  linkCard: {
    border: "1px solid var(--line)",
    borderRadius: 10,
    padding: "11px 13px",
    background: "var(--panel)",
    display: "flex",
    flexDirection: "column",
    gap: 9,
  },
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
    color: "#b06000",
    background: "var(--card)",
    border: "1px solid rgba(244,180,0,0.5)",
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
    transition: "background .12s ease, color .12s ease",
  },
};
