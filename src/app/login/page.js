"use client";

import { LogoTile } from "@/components/logo";
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

function WarnIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden="true"
      style={{ flexShrink: 0, marginTop: 1 }}
    >
      <path d="M12 2 1 21h22L12 2zm1 14h-2v2h2v-2zm0-6h-2v4h2v-4z" />
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

        /* The .field class handles the base look; these add the states it
           doesn't cover, so a focused input is unmistakable. */
        .login-card .field {
          width: 100%;
          box-sizing: border-box;
          height: 42px;
          transition: border-color .14s ease, box-shadow .14s ease;
        }
        .login-card .field:hover { border-color: var(--muted); }
        .login-card .field:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-soft);
        }
        .login-card button[type="submit"]:disabled { opacity: .65; cursor: default; }

        @keyframes lg-spin { to { transform: rotate(360deg); } }
        .lg-spin {
          width: 15px; height: 15px; display: inline-block; vertical-align: -2px;
          margin-right: 8px;
          border: 2px solid rgba(255,255,255,.45);
          border-top-color: #fff; border-radius: 999px;
          animation: lg-spin 620ms linear infinite;
        }
      `}</style>

      <div className="login-card" style={S.card}>
        {/* Stacked rather than side by side — the mark gets to be the first
            thing you see, instead of competing with the wordmark. */}
        <div style={S.brand}>
          <LogoTile size={48} />
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

            {capsLock ? (
              <p style={S.hint}>
                <WarnIcon />
                Caps Lock is on.
              </p>
            ) : null}
          </div>

          {error ? (
            <p style={S.error} role="alert">
              <WarnIcon />
              <span>{error}</span>
            </p>
          ) : null}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy}
            style={S.button}
          >
            {busy ? (
              <>
                <span className="lg-spin" />
                Signing in
              </>
            ) : (
              "Sign in"
            )}
          </button>
        </form>

        {/* There's no self-service signup or password reset by design, so
            say where to go instead of leaving people stuck at a dead end. */}
        <p style={S.help}>
          Forgotten your password? Your company administrator can reset it.
        </p>
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
    gap: 22,
    padding: 24,
    background: "var(--bg)",
  },
  card: {
    width: "100%",
    maxWidth: 420,
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 14,
    padding: "40px 40px 32px",
    boxShadow: "0 1px 3px rgba(17,24,39,.06), 0 10px 30px rgba(17,24,39,.06)",
  },
  brand: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    marginBottom: 28,
  },
  brandName: {
    fontSize: 20,
    fontWeight: 500,
    color: "var(--text-2)",
    letterSpacing: "-0.01em",
  },

  heading: {
    fontSize: 25,
    fontWeight: 400,
    textAlign: "center",
    letterSpacing: "-0.015em",
  },
  sub: {
    fontSize: 14.5,
    color: "var(--muted)",
    textAlign: "center",
    marginTop: 8,
  },

  form: { marginTop: 30 },
  group: { marginBottom: 18 },
  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--text-2)",
    marginBottom: 7,
  },

  // Anchors the toggle button to the field's right edge.
  fieldWrap: { position: "relative", display: "block" },
  // Keeps typed characters clear of the icon.
  pwInput: { paddingRight: 44 },

  hint: {
    display: "flex",
    alignItems: "flex-start",
    gap: 6,
    fontSize: 12,
    color: "#b06000",
    marginTop: 8,
  },

  error: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--danger)",
    background: "var(--danger-soft)",
    padding: "11px 14px",
    borderRadius: 10,
    marginBottom: 18,
  },
  button: {
    width: "100%",
    height: 44,
    fontSize: 14.5,
    fontWeight: 500,
    borderRadius: 10,
  },

  help: {
    fontSize: 12.5,
    color: "var(--muted)",
    textAlign: "center",
    marginTop: 22,
    paddingTop: 18,
    borderTop: "1px solid var(--line-soft)",
    lineHeight: 1.5,
  },

  foot: { fontSize: 13, color: "var(--muted)" },
};
