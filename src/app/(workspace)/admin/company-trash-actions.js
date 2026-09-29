"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MENU_CSS = `
.ct-menu { animation: ctIn 120ms ease-out; }
@keyframes ctIn { from { opacity: 0; transform: translateY(-4px);} to { opacity: 1; transform: none; } }
.ct-item { transition: background 90ms ease; }
.ct-item:hover, .ct-item:focus-visible { background: rgba(0,0,0,0.045); outline: none; }
.ct-item.ct-danger:hover, .ct-item.ct-danger:focus-visible { background: var(--danger-soft); }
`;

/**
 * Actions for a company sitting in the trash: restore it, or delete it
 * permanently.
 *
 * `companies` is the list of live companies, used by the "move them to
 * another company" option. Without it that choice is hidden.
 */
export default function CompanyTrashActions({
  companyId,
  name,
  companies = [],
}) {
  const router = useRouter();
  const trigger = useRef(null);
  const menuRef = useRef(null);

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function onDocClick(e) {
      const t = trigger.current;
      const m = menuRef.current;
      if (t && t.contains(e.target)) return;
      if (m && m.contains(e.target)) return;
      setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") {
        setOpen(false);
        setDialog(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useLayoutEffect(() => {
    if (!open || !trigger.current || !menuRef.current) return;
    const t = trigger.current.getBoundingClientRect();
    const h = menuRef.current.offsetHeight;
    const w = menuRef.current.offsetWidth;
    const margin = 8;
    const spaceBelow = window.innerHeight - t.bottom;
    let top;
    if (spaceBelow >= h + margin) top = t.bottom + 4;
    else if (t.top >= h + margin) top = t.top - 4 - h;
    else top = Math.max(margin, window.innerHeight - margin - h);
    let right = window.innerWidth - t.right;
    if (window.innerWidth - right - w < margin)
      right = window.innerWidth - w - margin;
    if (right < margin) right = margin;
    setPos({ top, right });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onScroll(e) {
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      setOpen(false);
    }
    function onResize() {
      setOpen(false);
    }
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  async function restore() {
    setOpen(false);
    setBusy(true);
    const res = await fetch(`/api/admin/companies/${companyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restore: true }),
    });
    setBusy(false);
    if (res.ok) {
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      window.alert(d.error || "Could not restore the company.");
    }
  }

  async function purge({ confirmName, fileAction, targetCompanyId }) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/admin/companies/${companyId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        purge: true,
        confirmName,
        fileAction,
        ...(targetCompanyId ? { targetCompanyId } : {}),
      }),
    });
    setBusy(false);
    if (res.ok) {
      setDialog(false);
      router.refresh();
      return;
    }
    const d = await res.json().catch(() => ({}));
    setError(d.error || "Could not delete the company.");
  }

  const menu =
    open && mounted
      ? createPortal(
          <div
            role="menu"
            ref={menuRef}
            className="ct-menu"
            style={{
              ...S.menu,
              ...(pos
                ? { top: pos.top, right: pos.right, visibility: "visible" }
                : { top: 0, right: 0, visibility: "hidden" }),
            }}
          >
            <style>{MENU_CSS}</style>
            <button
              type="button"
              role="menuitem"
              className="ct-item"
              style={S.item}
              onClick={restore}
            >
              Restore
            </button>
            <div style={S.divider} />
            <button
              type="button"
              role="menuitem"
              className="ct-item ct-danger"
              style={S.itemDanger}
              onClick={() => {
                setOpen(false);
                setError("");
                setDialog(true);
              }}
            >
              Delete permanently
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <div style={S.wrap}>
      <button
        type="button"
        ref={trigger}
        style={{ ...S.trigger, ...(open ? S.triggerOpen : null) }}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${name}`}
        disabled={busy}
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
        </svg>
      </button>

      {menu}

      {dialog ? (
        <PurgeDialog
          name={name}
          companies={companies}
          busy={busy}
          error={error}
          onCancel={() => setDialog(false)}
          onConfirm={purge}
        />
      ) : null}
    </div>
  );
}

/**
 * Two steps, deliberately.
 *
 * Step one is the decision that can't be undone — what happens to the
 * documents. Step two is the typed-name confirmation. Putting a radio choice
 * next to the confirm field would let someone type the name, click the button
 * and destroy everything without ever having read the options.
 */
function PurgeDialog({ name, companies, busy, error, onCancel, onConfirm }) {
  const [step, setStep] = useState("files");
  const [fileAction, setFileAction] = useState("archive");
  const [target, setTarget] = useState(companies[0]?.id ?? "");
  const [typed, setTyped] = useState("");

  const matches = typed.trim() === name;
  const needsTarget = fileAction === "transfer";
  const canContinue = !needsTarget || Boolean(target);

  const CHOICES = [
    {
      key: "archive",
      label: "Keep them in the archive",
      note: "Documents move to a holding area only super admins can see. You can move them into another company later.",
    },
    {
      key: "transfer",
      label: "Move them to another company",
      note: "They become ordinary documents there, visible to that company's admins and managers.",
      disabled: companies.length === 0,
      disabledNote: "No other company to move them to.",
    },
    {
      key: "delete",
      label: "Delete them too",
      note: "Documents, folders and every saved version are erased from disk. Only a backup could bring them back.",
      danger: true,
    },
  ];

  const chosen = CHOICES.find((c) => c.key === fileAction);

  return (
    <div style={M.backdrop} onClick={busy ? undefined : onCancel}>
      <div style={M.panel} onClick={(e) => e.stopPropagation()}>
        <style>{`
          .ct-choice { transition: border-color .14s ease, background .14s ease; }
          .ct-choice:hover:not(:disabled) { border-color: var(--accent); }
          .ct-choice:disabled { opacity: .5; cursor: default; }
          .ct-select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
        `}</style>

        <p className="eyebrow" style={{ ...M.eyebrow, color: "var(--danger)" }}>
          Delete permanently
        </p>
        <h3 style={M.title}>{name}</h3>

        {step === "files" ? (
          <>
            <p style={M.sub}>
              The company, its folders and everyone who belongs only to it will
              be erased. First, decide what happens to its documents.
            </p>

            <div style={M.choices}>
              {CHOICES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className="ct-choice"
                  onClick={() => setFileAction(c.key)}
                  disabled={c.disabled}
                  style={fileAction === c.key ? M.choiceOn : M.choice}
                >
                  <span style={fileAction === c.key ? M.radioOn : M.radio} />
                  <span style={M.choiceText}>
                    <span
                      style={c.danger ? M.choiceTitleDanger : M.choiceTitle}
                    >
                      {c.label}
                    </span>
                    <span style={M.choiceNote}>
                      {c.disabled ? c.disabledNote : c.note}
                    </span>
                  </span>
                </button>
              ))}
            </div>

            {needsTarget ? (
              <>
                <label style={M.label} htmlFor="purgetarget">
                  Move documents to
                </label>
                <select
                  id="purgetarget"
                  className="ct-select field"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  style={M.select}
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <p style={M.subSmall}>
                  Sharing set up inside {name} is dropped, and any outside links
                  to these documents are revoked.
                </p>
              </>
            ) : null}

            <div style={M.actions}>
              <button type="button" className="btn btn-text" onClick={onCancel}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canContinue}
                onClick={() => setStep("confirm")}
              >
                Continue
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={M.sub}>
              This <strong>cannot be undone</strong>. It permanently erases{" "}
              {name}:
            </p>
            <ul style={M.list}>
              <li>
                {fileAction === "delete"
                  ? "all of its documents, folders and file history — deleted from disk"
                  : fileAction === "archive"
                    ? "its documents are kept in the archive; its folders are not"
                    : `its documents move to ${companies.find((c) => c.id === target)?.name ?? "the chosen company"}; its folders are not kept`}
              </li>
              <li>
                everyone who belongs only to this company — their accounts are
                deleted
              </li>
              <li>
                the company name and domain — freed so they can be used again
              </li>
            </ul>
            <p style={M.subSmall}>
              People who also belong to another company are kept; they simply
              lose access here.
            </p>

            <label style={M.label} htmlFor="purgename">
              Type <strong style={{ color: "var(--text)" }}>{name}</strong> to
              confirm
            </label>
            <input
              id="purgename"
              className="field"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={name}
              autoFocus
              autoComplete="off"
            />

            {error ? <p style={M.error}>{error}</p> : null}

            <div style={M.actions}>
              <button
                type="button"
                className="btn btn-text"
                onClick={() => setStep("files")}
                disabled={busy}
              >
                Back
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy || !matches}
                onClick={() =>
                  onConfirm({
                    confirmName: typed.trim(),
                    fileAction,
                    targetCompanyId: needsTarget ? target : null,
                  })
                }
              >
                {busy ? "Deleting" : "Delete permanently"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const S = {
  wrap: { position: "relative", display: "inline-flex" },
  trigger: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    borderRadius: 999,
    border: "none",
    background: "none",
    color: "var(--muted)",
    cursor: "pointer",
    transition: "background 90ms ease, color 90ms ease",
  },
  triggerOpen: { background: "rgba(0,0,0,0.06)", color: "var(--text)" },
  menu: {
    position: "fixed",
    minWidth: 190,
    background: "var(--panel)",
    border: "1px solid var(--line-soft)",
    borderRadius: "var(--r-card)",
    boxShadow: "var(--shadow-raised)",
    padding: "6px 0",
    zIndex: 1000,
    maxHeight: "calc(100vh - 16px)",
    overflowY: "auto",
  },
  item: {
    display: "block",
    width: "100%",
    padding: "9px 18px",
    background: "none",
    border: "none",
    textAlign: "left",
    fontSize: 14,
    color: "var(--text)",
    cursor: "pointer",
  },
  itemDanger: {
    display: "block",
    width: "100%",
    padding: "9px 18px",
    background: "none",
    border: "none",
    textAlign: "left",
    fontSize: 14,
    color: "var(--danger)",
    cursor: "pointer",
  },
  divider: { height: 1, background: "var(--line-soft)", margin: "6px 0" },
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
    maxWidth: 470,
    background: "var(--panel)",
    borderRadius: 14,
    padding: 26,
    boxShadow: "var(--shadow-raised)",
    maxHeight: "88vh",
    overflowY: "auto",
    textAlign: "left",
  },
  eyebrow: { marginBottom: 6 },
  title: { fontSize: 18, fontWeight: 600 },
  sub: { fontSize: 13, color: "var(--muted)", marginTop: 8, lineHeight: 1.55 },
  subSmall: {
    fontSize: 12,
    color: "var(--muted)",
    marginTop: 10,
    lineHeight: 1.5,
  },
  list: {
    fontSize: 13,
    color: "var(--muted)",
    margin: "10px 0 0",
    paddingLeft: 18,
    lineHeight: 1.6,
  },

  choices: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginTop: 16,
  },
  choice: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "13px 15px",
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 10,
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
  },
  choiceOn: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "13px 15px",
    background: "var(--accent-soft)",
    border: "1px solid var(--accent)",
    borderRadius: 10,
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
  },
  radio: {
    width: 16,
    height: 16,
    borderRadius: 999,
    border: "2px solid var(--line)",
    marginTop: 2,
    flexShrink: 0,
  },
  radioOn: {
    width: 16,
    height: 16,
    borderRadius: 999,
    border: "5px solid var(--accent)",
    marginTop: 2,
    flexShrink: 0,
  },
  choiceText: { display: "flex", flexDirection: "column", gap: 3, minWidth: 0 },
  choiceTitle: { fontSize: 14, fontWeight: 500, color: "var(--text)" },
  choiceTitleDanger: { fontSize: 14, fontWeight: 500, color: "var(--danger)" },
  choiceNote: { fontSize: 12.5, color: "var(--muted)", lineHeight: 1.45 },

  label: {
    display: "block",
    fontSize: 13,
    color: "var(--muted)",
    margin: "18px 0 6px",
  },
  select: { width: "100%", boxSizing: "border-box" },
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
