"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const ROLES = [
  {
    value: "VIEWER",
    label: "Viewer",
    note: "Can open documents shared with them.",
  },
  {
    value: "EDITOR",
    label: "Editor",
    note: "Can create and edit documents, and share their own.",
  },
  {
    value: "MANAGER",
    label: "Manager",
    note: "Can manage every document in the company.",
  },
  {
    value: "ADMIN",
    label: "Admin",
    note: "Can manage people, documents and settings.",
  },
];

const MIN_PASSWORD = 6;

export default function NewUser({ companies }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    name: "",
    localPart: "",
    password: "",
    role: "VIEWER",
    companyId: companies[0]?.id ?? "",
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
      localPart: "",
      password: "",
      role: "VIEWER",
      companyId: companies[0]?.id ?? "",
    });
  }

  // Escape closes. On the document so it works wherever focus is.
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
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        close();
        router.refresh();
      } else {
        setError(data.error || "Could not create the user.");
      }
    } catch {
      setError("Could not create the user.");
    }
    setBusy(false);
  }

  const company = companies.find((c) => c.id === form.companyId);
  // The suffix showed a literal "@domain". The company already has one —
  // seeing the real address is the point of building it in front of you.
  const domain = company?.domain ?? null;
  const previewEmail =
    form.localPart && domain ? `${form.localPart.toLowerCase()}@${domain}` : "";

  const shortPassword =
    form.password.length > 0 && form.password.length < MIN_PASSWORD;

  const chosenRole = ROLES.find((r) => r.value === form.role);

  // The button stayed enabled with every field blank, so the only feedback on
  // a half-filled form was a round trip and a red box.
  const ready =
    form.name.trim().length > 0 &&
    form.localPart.trim().length > 0 &&
    form.password.length >= MIN_PASSWORD &&
    Boolean(form.companyId);

  return (
    <>
      <button
        type="button"
        className="nu-trigger"
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
          <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
        </svg>
        New user
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
              .nu-trigger { transition: background .12s ease, border-color .12s ease; }
              .nu-trigger:hover { background: var(--bg); border-color: var(--muted); }
              .nu-field:hover { border-color: var(--muted); }
              .nu-field:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
              .nu-eye { position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
                width: 32px; height: 32px; display: inline-flex; align-items: center;
                justify-content: center; border: none; background: none; border-radius: 999px;
                color: var(--muted); cursor: pointer; }
              .nu-eye:hover { background: var(--bg); color: var(--text); }
              .nu-ghost:hover { background: var(--bg); }
              .nu-primary:hover:not(:disabled) { filter: brightness(1.06); }
            `}</style>

            <span style={S.icon}>
              <svg
                viewBox="0 0 24 24"
                width="22"
                height="22"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            </span>

            {/* One heading, not two saying the same thing. */}
            <h3 style={S.title}>Add someone</h3>
            <p style={S.sub}>
              They get an account straight away and can sign in with the
              password you set here.
            </p>

            {companies.length > 1 ? (
              <>
                <label style={S.label} htmlFor="nu-co">
                  Company
                </label>
                <select
                  id="nu-co"
                  className="field nu-field"
                  value={form.companyId}
                  onChange={set("companyId")}
                  style={S.input}
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </>
            ) : null}

            <label style={S.label} htmlFor="nu-name">
              Full name
            </label>
            <input
              id="nu-name"
              className="field nu-field"
              value={form.name}
              onChange={set("name")}
              autoFocus
              style={S.input}
            />

            <label style={S.label} htmlFor="nu-local">
              Email
            </label>
            <div style={S.emailRow}>
              <input
                id="nu-local"
                className="field nu-field"
                value={form.localPart}
                onChange={set("localPart")}
                placeholder="firstname"
                style={{ ...S.input, flex: 1 }}
              />
              <span style={S.emailSuffix}>@{domain ?? "domain"}</span>
            </div>
            {previewEmail ? (
              <p style={S.hint}>They will sign in as {previewEmail}</p>
            ) : null}

            <label style={S.label} htmlFor="nu-role">
              Role
            </label>
            <select
              id="nu-role"
              className="field nu-field"
              value={form.role}
              onChange={set("role")}
              style={S.input}
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            {/* A role name says nothing on its own — this is where someone
                decides what another person can do. */}
            {chosenRole ? <p style={S.hint}>{chosenRole.note}</p> : null}

            <label style={S.label} htmlFor="nu-pass">
              Temporary password
            </label>
            <div style={S.wrap}>
              <input
                id="nu-pass"
                className="field nu-field"
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={set("password")}
                placeholder={`At least ${MIN_PASSWORD} characters`}
                autoComplete="new-password"
                style={{ ...S.input, paddingRight: 44 }}
              />
              {/* This one gets read out to someone. Not being able to check
                  what you typed is how it becomes a support call. */}
              <button
                type="button"
                className="nu-eye"
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
                {MIN_PASSWORD - form.password.length} more character
                {MIN_PASSWORD - form.password.length === 1 ? "" : "s"} needed.
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
                className="nu-ghost"
                onClick={close}
                disabled={busy}
                style={busy ? { ...S.cancel, opacity: 0.5 } : S.cancel}
              >
                Cancel
              </button>
              <button
                type="button"
                className="nu-primary"
                disabled={busy || !ready}
                onClick={submit}
                style={busy || !ready ? S.confirmOff : S.confirm}
              >
                {busy ? "Creating…" : "Create user"}
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

  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--text-2)",
    margin: "16px 0 6px",
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
