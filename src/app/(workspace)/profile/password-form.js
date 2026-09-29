"use client";

import { useState } from "react";

const MIN_LENGTH = 12;

function EyeIcon({ off }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="currentColor"
      aria-hidden="true"
    >
      {off ? (
        <path d="M12 7a5 5 0 0 1 5 5c0 .65-.13 1.26-.36 1.83l2.92 2.92A11.8 11.8 0 0 0 23 12c-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16A5 5 0 0 1 12 7zM2.71 3.16 1.29 4.57l2.48 2.48A11.79 11.79 0 0 0 1 12c1.73 4.39 6 7.5 11 7.5 1.52 0 2.97-.3 4.31-.82l3.12 3.12 1.41-1.41L2.71 3.16zM7.53 9.8l1.55 1.55a3 3 0 0 0 3.57 3.57l1.55 1.55A5 5 0 0 1 7.53 9.8z" />
      ) : (
        <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
      )}
    </svg>
  );
}

/**
 * Changing your own password signs you out everywhere, this session
 * included — so the form redirects to /login on success rather than
 * pretending nothing happened and failing on the next request.
 */
export default function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const tooShort = next.length > 0 && next.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && next !== confirm;
  const ready =
    current.length > 0 && next.length >= MIN_LENGTH && next === confirm;

  async function submit(e) {
    e.preventDefault();
    if (!ready || busy) return;

    setBusy(true);
    setError("");

    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, next }),
      });
      const d = await res.json().catch(() => ({}));

      if (res.ok) {
        setDone(true);
        // A moment to read the message before the redirect.
        setTimeout(() => {
          window.location.href = "/login";
        }, 1800);
        return;
      }
      setError(d.error || "Could not change your password.");
    } catch {
      setError("Could not change your password.");
    }
    setBusy(false);
  }

  if (done) {
    return (
      <div style={S.doneBox}>
        <p style={S.doneTitle}>Password changed</p>
        <p style={S.doneBody}>
          You’ve been signed out everywhere. Taking you to the sign-in page…
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={S.form}>
      <style>{`
        .pf-field { width: 100%; box-sizing: border-box; height: 42px; padding: 0 44px 0 12px;
          background: var(--bg); border: 1px solid var(--line); border-radius: 8px;
          color: var(--text); font-size: 14px; transition: border-color .14s ease, box-shadow .14s ease; }
        .pf-field:hover { border-color: var(--muted); }
        .pf-field:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
        .pf-eye { position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
          width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center;
          border: none; background: none; border-radius: 999px; color: var(--muted); cursor: pointer; }
        .pf-eye:hover { background: var(--panel); color: var(--text); }
      `}</style>

      <label style={S.label} htmlFor="pf-current">
        Current password
      </label>
      <div style={S.wrap}>
        <input
          id="pf-current"
          className="pf-field"
          type={show ? "text" : "password"}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          required
        />
        <button
          type="button"
          className="pf-eye"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide passwords" : "Show passwords"}
          tabIndex={-1}
        >
          <EyeIcon off={show} />
        </button>
      </div>

      <label style={S.label} htmlFor="pf-next">
        New password
      </label>
      <div style={S.wrap}>
        <input
          id="pf-next"
          className="pf-field"
          type={show ? "text" : "password"}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
          required
        />
      </div>
      <p style={tooShort ? S.hintWarn : S.hint}>
        At least {MIN_LENGTH} characters. A short sentence works well.
      </p>

      <label style={S.label} htmlFor="pf-confirm">
        Confirm new password
      </label>
      <div style={S.wrap}>
        <input
          id="pf-confirm"
          className="pf-field"
          type={show ? "text" : "password"}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
        />
      </div>
      {mismatch ? (
        <p style={S.hintWarn}>The two passwords don’t match.</p>
      ) : null}

      {error ? (
        <p style={S.error} role="alert">
          {error}
        </p>
      ) : null}

      <p style={S.note}>
        Changing your password signs you out on every device, including this
        one.
      </p>

      <button
        type="submit"
        disabled={!ready || busy}
        style={!ready || busy ? S.buttonOff : S.button}
      >
        {busy ? "Changing…" : "Change password"}
      </button>
    </form>
  );
}

const S = {
  form: { maxWidth: 400 },
  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--text-2)",
    margin: "16px 0 7px",
  },
  wrap: { position: "relative" },
  hint: { fontSize: 12, color: "var(--muted)", marginTop: 7, lineHeight: 1.5 },
  hintWarn: {
    fontSize: 12,
    color: "#b06000",
    marginTop: 7,
    lineHeight: 1.5,
    fontWeight: 500,
  },
  note: {
    fontSize: 12.5,
    color: "var(--muted)",
    lineHeight: 1.5,
    margin: "18px 0 14px",
    background: "var(--bg)",
    borderRadius: 8,
    padding: "10px 12px",
  },
  error: {
    fontSize: 13,
    color: "var(--danger)",
    background: "var(--danger-soft)",
    padding: "10px 13px",
    borderRadius: 8,
    marginTop: 16,
  },
  button: {
    padding: "11px 20px",
    fontSize: 14,
    fontWeight: 600,
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
  },
  buttonOff: {
    padding: "11px 20px",
    fontSize: 14,
    fontWeight: 600,
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    cursor: "default",
    opacity: 0.45,
  },
  doneBox: {
    maxWidth: 400,
    background: "var(--bg)",
    border: "1px solid var(--line)",
    borderRadius: 10,
    padding: "18px 20px",
  },
  doneTitle: { fontSize: 14, fontWeight: 600, color: "var(--text)" },
  doneBody: {
    fontSize: 13,
    color: "var(--muted)",
    marginTop: 6,
    lineHeight: 1.5,
  },
};
