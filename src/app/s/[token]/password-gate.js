"use client";

import { useState } from "react";

export default function PasswordGate({ token, fileName }) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    if (e) e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/s/${token}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        window.location.reload();
      } else if (res.status === 404) {
        // The link expired or was revoked while this page sat open. Saying
        // "wrong password" would have people retyping a password that was
        // never the problem.
        setError("This link is no longer valid. Ask for a new one.");
        setBusy(false);
      } else {
        setError("That password is not correct.");
        setBusy(false);
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div style={S.wrap}>
      <style>{`
        .pg-field:hover { border-color: var(--muted); }
        .pg-field:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
        .pg-eye { position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
          width: 32px; height: 32px; display: inline-flex; align-items: center;
          justify-content: center; border: none; background: none; border-radius: 999px;
          color: var(--muted); cursor: pointer; }
        .pg-eye:hover { background: var(--bg); color: var(--text); }
        .pg-btn { transition: filter .12s ease; }
        .pg-btn:hover:not(:disabled) { filter: brightness(1.06); }
        @keyframes pg-spin { to { transform: rotate(360deg); } }
        .pg-spin {
          width: 15px; height: 15px; display: inline-block; vertical-align: -2px;
          margin-right: 8px; border: 2px solid rgba(255,255,255,.45);
          border-top-color: #fff; border-radius: 999px;
          animation: pg-spin 620ms linear infinite;
        }
      `}</style>

      <form style={S.card} onSubmit={submit}>
        {/* A lock says what this page is before anything is read. */}
        <span style={S.icon}>
          <svg
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
          </svg>
        </span>

        <p style={S.eyebrow}>Protected document</p>
        <h1 style={S.title} title={fileName}>
          {fileName}
        </h1>
        <p style={S.text}>
          Enter the password you were given to open this document.
        </p>

        <label style={S.label} htmlFor="pg-pass">
          Password
        </label>
        <div style={S.wrapField}>
          <input
            id="pg-pass"
            className="pg-field"
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            autoComplete="off"
            style={S.input}
          />
          {/* Typing a password you were read out loud, blind, is how this
              page turns into three failed attempts. */}
          <button
            type="button"
            className="pg-eye"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide password" : "Show password"}
            tabIndex={-1}
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="currentColor"
              aria-hidden="true"
            >
              {show ? (
                <path d="M12 7a5 5 0 0 1 5 5c0 .65-.13 1.26-.36 1.83l2.92 2.92A11.8 11.8 0 0 0 23 12c-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16A5 5 0 0 1 12 7zM2.71 3.16 1.29 4.57l2.48 2.48A11.79 11.79 0 0 0 1 12c1.73 4.39 6 7.5 11 7.5 1.52 0 2.97-.3 4.31-.82l3.12 3.12 1.41-1.41L2.71 3.16zM7.53 9.8l1.55 1.55a3 3 0 0 0 3.57 3.57l1.55 1.55A5 5 0 0 1 7.53 9.8z" />
              ) : (
                <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
              )}
            </svg>
          </button>
        </div>

        {error ? (
          <p style={S.error} role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          className="pg-btn"
          disabled={busy || !password}
          style={busy || !password ? S.buttonOff : S.button}
        >
          {busy ? (
            <>
              <span className="pg-spin" />
              Checking…
            </>
          ) : (
            "View document"
          )}
        </button>

        <p style={S.foot}>
          Shared with you from Atlas. Only people with this link and password
          can open it.
        </p>
      </form>
    </div>
  );
}

const S = {
  wrap: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    background: "var(--bg)",
  },
  card: {
    width: "100%",
    maxWidth: 400,
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 14,
    padding: "32px 32px 26px",
    boxShadow: "0 1px 3px rgba(17,24,39,.06), 0 10px 30px rgba(17,24,39,.06)",
    textAlign: "left",
  },

  icon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    background: "var(--accent-soft)",
    color: "var(--accent)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
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
    fontSize: 18,
    fontWeight: 600,
    color: "var(--text)",
    margin: "7px 0 0",
    lineHeight: 1.35,
    wordBreak: "break-word",
  },
  text: {
    fontSize: 13.5,
    color: "var(--muted)",
    lineHeight: 1.55,
    margin: "10px 0 0",
  },

  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--text-2)",
    margin: "22px 0 7px",
  },
  wrapField: { position: "relative" },
  input: {
    width: "100%",
    boxSizing: "border-box",
    height: 44,
    padding: "0 44px 0 13px",
    fontSize: 14,
    background: "var(--bg)",
    color: "var(--text)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    transition: "border-color .14s ease, box-shadow .14s ease",
  },

  error: {
    fontSize: 13,
    color: "var(--danger)",
    background: "var(--danger-soft)",
    padding: "10px 13px",
    borderRadius: 8,
    margin: "14px 0 0",
    lineHeight: 1.5,
  },

  button: {
    width: "100%",
    height: 44,
    marginTop: 18,
    fontSize: 14.5,
    fontWeight: 600,
    cursor: "pointer",
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
  },
  buttonOff: {
    width: "100%",
    height: 44,
    marginTop: 18,
    fontSize: 14.5,
    fontWeight: 600,
    cursor: "default",
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    opacity: 0.45,
  },

  foot: {
    fontSize: 12,
    color: "var(--muted)",
    lineHeight: 1.5,
    margin: "20px 0 0",
    paddingTop: 16,
    borderTop: "1px solid var(--line-soft)",
  },
};
