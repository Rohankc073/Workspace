"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const MIN_PASSWORD = 12;

/**
 * Super-admin only. Creates a company AND its single admin in one step.
 * The admin's email is built as <localPart>@<domain>.
 */
export default function NewCompany() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    name: "",
    domain: "",
    adminName: "",
    adminLocalPart: "",
    adminPassword: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function set(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  function close() {
    setOpen(false);
    setError("");
    setShowPassword(false);
    setForm({
      name: "",
      domain: "",
      adminName: "",
      adminLocalPart: "",
      adminPassword: "",
    });
  }

  // Escape closes. On the document so it works wherever focus is, not only
  // when something inside the panel has it.
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape" && !busy) close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, busy]);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        close();
        router.refresh();
      } else {
        setError(data.error || "Could not create the company.");
      }
    } catch {
      setError("Could not create the company.");
    }
    setBusy(false);
  }

  const domainClean = form.domain.toLowerCase().trim().replace(/^@/, "");
  const previewEmail =
    form.adminLocalPart && domainClean
      ? `${form.adminLocalPart.toLowerCase()}@${domainClean}`
      : "";

  const shortPassword =
    form.adminPassword.length > 0 && form.adminPassword.length < MIN_PASSWORD;

  // The button stayed enabled with every field blank, so the only feedback on
  // a half-filled form was a round trip and a red box.
  const ready =
    form.name.trim().length >= 2 &&
    domainClean.includes(".") &&
    form.adminName.trim().length > 0 &&
    form.adminLocalPart.trim().length > 0 &&
    form.adminPassword.length >= MIN_PASSWORD;

  return (
    <>
      <button
        type="button"
        className="nc-trigger"
        onClick={() => setOpen(true)}
        style={S.trigger}
      >
        <svg
          viewBox="0 0 24 24"
          width="17"
          height="17"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
        </svg>
        New company
      </button>

      {open ? (
        <div style={S.backdrop} onClick={busy ? undefined : close}>
          <div
            style={S.panel}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <style>{`
              .nc-trigger { transition: background .12s ease, border-color .12s ease; }
              .nc-trigger:hover { background: var(--bg); border-color: var(--muted); }
              .nc-field:hover { border-color: var(--muted); }
              .nc-field:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
              .nc-eye { position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
                width: 32px; height: 32px; display: inline-flex; align-items: center;
                justify-content: center; border: none; background: none; border-radius: 999px;
                color: var(--muted); cursor: pointer; }
              .nc-eye:hover { background: var(--bg); color: var(--text); }
              .nc-ghost:hover { background: var(--bg); }
              .nc-primary:hover:not(:disabled) { filter: brightness(1.06); }
            `}</style>

            {/* An icon chip gives the dialog a focal point instead of
                opening on stacked text. */}
            <span style={S.icon}>
              <svg
                viewBox="0 0 24 24"
                width="22"
                height="22"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z" />
              </svg>
            </span>

            {/* One heading, not two saying the same thing. */}
            <h3 style={S.title}>Create a company</h3>
            <p style={S.sub}>
              You also create its first administrator, who can then add everyone
              else.
            </p>

            {/* Two things are being created at once — say so, rather than
                running them together under a hairline. */}
            <p style={S.step}>
              <span style={S.stepNum}>1</span> The company
            </p>

            <label style={S.label} htmlFor="co-name">
              Company name
            </label>
            <input
              id="co-name"
              className="field nc-field"
              value={form.name}
              onChange={set("name")}
              autoFocus
              style={S.input}
            />

            <label style={S.label} htmlFor="co-domain">
              Email domain
            </label>
            <input
              id="co-domain"
              className="field nc-field"
              value={form.domain}
              onChange={set("domain")}
              placeholder="acme.com"
              style={S.input}
            />
            <p style={S.hint}>
              Everyone in this company gets an @{domainClean || "domain"}{" "}
              address.
            </p>

            <p style={S.step}>
              <span style={S.stepNum}>2</span> Its first administrator
            </p>

            <label style={S.label} htmlFor="ad-name">
              Name
            </label>
            <input
              id="ad-name"
              className="field nc-field"
              value={form.adminName}
              onChange={set("adminName")}
              style={S.input}
            />

            <label style={S.label} htmlFor="ad-local">
              Email
            </label>
            <div style={S.emailRow}>
              <input
                id="ad-local"
                className="field nc-field"
                value={form.adminLocalPart}
                onChange={set("adminLocalPart")}
                placeholder="admin"
                style={{ ...S.input, flex: 1, marginBottom: 0 }}
              />
              <span style={S.emailSuffix}>@{domainClean || "domain"}</span>
            </div>
            {previewEmail ? (
              <p style={S.hint}>They will sign in as {previewEmail}</p>
            ) : null}

            <label style={S.label} htmlFor="ad-pass">
              Password
            </label>
            <div style={S.wrap}>
              <input
                id="ad-pass"
                className="field nc-field"
                type={showPassword ? "text" : "password"}
                value={form.adminPassword}
                onChange={set("adminPassword")}
                placeholder={`At least ${MIN_PASSWORD} characters`}
                autoComplete="new-password"
                style={{ ...S.input, paddingRight: 44, marginBottom: 0 }}
              />
              {/* This password gets handed to someone else — being unable to
                  see what you typed is how it turns into a support call. */}
              <button
                type="button"
                className="nc-eye"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  {showPassword ? (
                    <path d="M12 7a5 5 0 0 1 5 5c0 .65-.13 1.26-.36 1.83l2.92 2.92A11.8 11.8 0 0 0 23 12c-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16A5 5 0 0 1 12 7zM2.71 3.16 1.29 4.57l2.48 2.48A11.79 11.79 0 0 0 1 12c1.73 4.39 6 7.5 11 7.5 1.52 0 2.97-.3 4.31-.82l3.12 3.12 1.41-1.41L2.71 3.16zM7.53 9.8l1.55 1.55a3 3 0 0 0 3.57 3.57l1.55 1.55A5 5 0 0 1 7.53 9.8z" />
                  ) : (
                    <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
                  )}
                </svg>
              </button>
            </div>
            {shortPassword ? (
              <p style={S.hintWarn}>
                {MIN_PASSWORD - form.adminPassword.length} more character
                {MIN_PASSWORD - form.adminPassword.length === 1 ? "" : "s"}{" "}
                needed.
              </p>
            ) : (
              <p style={S.hint}>
                Share it with them directly. They can change it from their
                profile.
              </p>
            )}

            {error ? <p style={S.error}>{error}</p> : null}

            <div style={S.actions}>
              <button
                type="button"
                className="nc-ghost"
                onClick={close}
                disabled={busy}
                style={busy ? { ...S.cancel, opacity: 0.5 } : S.cancel}
              >
                Cancel
              </button>
              <button
                type="button"
                className="nc-primary"
                disabled={busy || !ready}
                onClick={submit}
                style={busy || !ready ? S.confirmOff : S.confirm}
              >
                {busy ? "Creating…" : "Create company"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

const S = {
  trigger: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    padding: "9px 16px",
    background: "transparent",
    color: "var(--text)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
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
    maxWidth: 440,
    background: "var(--panel)",
    borderRadius: 14,
    padding: "24px 26px 22px",
    boxShadow: "0 12px 32px rgba(0,0,0,0.22)",
    maxHeight: "88vh",
    overflowY: "auto",
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
  title: { fontSize: 19, fontWeight: 600, letterSpacing: "-0.01em" },
  sub: {
    fontSize: 13.5,
    color: "var(--muted)",
    marginTop: 6,
    lineHeight: 1.55,
  },

  step: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: ".05em",
    textTransform: "uppercase",
    color: "var(--muted)",
    margin: "24px 0 4px",
    paddingTop: 18,
    borderTop: "1px solid var(--line-soft)",
  },
  stepNum: {
    width: 20,
    height: 20,
    borderRadius: 999,
    background: "var(--accent-soft)",
    color: "var(--accent)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 700,
    flexShrink: 0,
  },

  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--text-2)",
    margin: "14px 0 6px",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    marginBottom: 0,
    transition: "border-color .14s ease, box-shadow .14s ease",
  },
  wrap: { position: "relative" },
  hint: { fontSize: 12, color: "var(--muted)", marginTop: 7, lineHeight: 1.5 },
  hintWarn: {
    fontSize: 12,
    color: "#b06000",
    fontWeight: 500,
    marginTop: 7,
    lineHeight: 1.5,
  },
  emailRow: { display: "flex", alignItems: "center", gap: 8 },
  emailSuffix: {
    fontSize: 14,
    color: "var(--muted)",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },

  error: {
    fontSize: 13,
    color: "var(--danger)",
    background: "var(--danger-soft)",
    padding: "10px 14px",
    borderRadius: 8,
    marginTop: 16,
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 26,
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
    transition: "background .12s ease",
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
    transition: "filter .12s ease",
  },
  confirmOff: {
    padding: "10px 20px",
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontWeight: 600,
    fontSize: 13.5,
    cursor: "default",
    opacity: 0.45,
  },
};
