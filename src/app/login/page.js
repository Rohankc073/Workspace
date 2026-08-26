"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

function EyeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 7a5 5 0 0 1 5 5c0 .65-.13 1.26-.36 1.83l2.92 2.92A11.8 11.8 0 0 0 23 12c-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16A5 5 0 0 1 12 7zM2.71 3.16 1.29 4.57l2.48 2.48A11.79 11.79 0 0 0 1 12c1.73 4.39 6 7.5 11 7.5 1.52 0 2.97-.3 4.31-.82l3.12 3.12 1.41-1.41L2.71 3.16zM7.53 9.8l1.55 1.55a3 3 0 0 0 3.57 3.57l1.55 1.55A5 5 0 0 1 7.53 9.8z" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  /** Warn about caps lock — the commonest cause of "my password stopped working". */
  function checkCaps(e) {
    if (typeof e.getModifierState === "function") {
      setCapsLock(e.getModifierState("CapsLock"));
    }
  }

  return (
    <main style={S.page}>
      <style>{`
        .pw-toggle {
          position: absolute;
          top: 50%;
          right: 6px;
          transform: translateY(-50%);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          padding: 0;
          border: none;
          border-radius: 999px;
          background: none;
          color: var(--muted);
          cursor: pointer;
          transition: background 90ms ease, color 90ms ease;
        }
        .pw-toggle:hover { background: var(--bg); color: var(--text); }
        .pw-toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
      `}</style>

      <div style={S.card}>
        <div style={S.brand}>
          <span style={S.mark}>A</span>
          <span style={S.brandName}>Atlas</span>
        </div>

        <h1 style={S.heading}>Sign in</h1>
        <p style={S.sub}>to continue to Atlas Workspace</p>

        <form onSubmit={handleSubmit} style={S.form}>
          <div style={S.group}>
            <label style={S.label} htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              className="field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </div>

          <div style={S.group}>
            <label style={S.label} htmlFor="password">
              Password
            </label>

            <div style={S.fieldWrap}>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                className="field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyUp={checkCaps}
                onKeyDown={checkCaps}
                onBlur={() => setCapsLock(false)}
                autoComplete="current-password"
                style={S.pwInput}
                required
              />
              <button
                type="button"
                className="pw-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                title={showPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>

            {capsLock ? <p style={S.hint}>Caps Lock is on.</p> : null}
          </div>

          {error ? (
            <p style={S.error} role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy}
            style={S.button}
          >
            {busy ? "Signing in" : "Sign in"}
          </button>
        </form>
      </div>

      <p style={S.foot}>Your documents, on your own servers.</p>
    </main>
  );
}

const S = {
  page: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    padding: 24,
    background: "var(--bg)",
  },
  card: {
    width: "100%",
    maxWidth: 420,
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 12,
    padding: "44px 40px 40px",
    boxShadow: "0 1px 3px rgba(17,24,39,.06), 0 8px 24px rgba(17,24,39,.05)",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginBottom: 26,
  },
  mark: {
    width: 36,
    height: 36,
    borderRadius: 9,
    background: "var(--accent)",
    color: "#fff",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 17,
    fontWeight: 500,
  },
  brandName: { fontSize: 21, fontWeight: 400, color: "var(--text-2)" },

  heading: {
    fontSize: 24,
    fontWeight: 400,
    textAlign: "center",
    letterSpacing: "-0.01em",
  },
  sub: {
    fontSize: 15,
    color: "var(--text-2)",
    textAlign: "center",
    marginTop: 8,
  },

  form: { marginTop: 32 },
  group: { marginBottom: 18 },
  label: {
    display: "block",
    fontSize: 13,
    color: "var(--muted)",
    marginBottom: 6,
  },

  // Anchors the toggle button to the field's right edge.
  fieldWrap: { position: "relative", display: "block" },
  // Keeps typed characters clear of the icon.
  pwInput: { paddingRight: 44 },

  hint: { fontSize: 12, color: "var(--muted)", marginTop: 6 },

  error: {
    fontSize: 13,
    color: "var(--danger)",
    background: "var(--danger-soft)",
    padding: "10px 14px",
    borderRadius: "var(--r-card)",
    marginBottom: 18,
  },
  button: { width: "100%", height: 40 },

  foot: { fontSize: 13, color: "var(--muted)" },
};
