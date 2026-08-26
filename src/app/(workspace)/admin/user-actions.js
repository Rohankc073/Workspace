"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const ROLES = [
  { value: "VIEWER", label: "Viewer" },
  { value: "EDITOR", label: "Editor" },
  { value: "MANAGER", label: "Manager" },
  { value: "ADMIN", label: "Admin" },
];

// Injected once, so the portalled menu can use :hover / :focus-visible states
// and a subtle open animation that inline styles can't express.
const MENU_CSS = `
.ua-menu {
  animation: uaMenuIn 120ms ease-out;
}
@keyframes uaMenuIn {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: none; }
}
.ua-menu .ua-item {
  transition: background 90ms ease;
}
.ua-menu .ua-item:hover,
.ua-menu .ua-item:focus-visible {
  background: rgba(0, 0, 0, 0.045);
  outline: none;
}
.ua-menu .ua-item.ua-danger:hover,
.ua-menu .ua-item.ua-danger:focus-visible {
  background: var(--danger-soft);
}
`;

/**
 * Per-person actions in the admin table: disable/enable, reset password,
 * change role, and company membership. The menu is rendered through a portal
 * onto document.body so it can never be clipped by the table's overflow or a
 * transformed ancestor, and it clamps itself to stay fully on screen.
 *
 * `companies` is the list this admin may act on for this person — each
 * { id, name, role }. `allCompanies` is every company this admin manages, used
 * to offer add/move targets.
 */
export default function UserActions({
  userId,
  name,
  isActive,
  isSelf,
  companies,
  allCompanies,
}) {
  const router = useRouter();
  const trigger = useRef(null);
  const menuRef = useRef(null);
  const memberIds = new Set(companies.map((c) => c.id));
  const addable = (allCompanies ?? []).filter((c) => !memberIds.has(c.id));

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setMounted(true), []);

  // Close on outside click or Escape. The menu lives in the body now, so we
  // check both the trigger and the menu itself.
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
        setDialog(null);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // Position the menu against the viewport the moment it opens. Runs before
  // paint, so there's no flicker. Prefers dropping down; opens upward when the
  // row is near the bottom; pins to the edge if it's taller than either side.
  useLayoutEffect(() => {
    if (!open || !trigger.current || !menuRef.current) return;
    const t = trigger.current.getBoundingClientRect();
    const h = menuRef.current.offsetHeight;
    const w = menuRef.current.offsetWidth;
    const margin = 8;

    const spaceBelow = window.innerHeight - t.bottom;
    let top;
    if (spaceBelow >= h + margin) {
      top = t.bottom + 4;
    } else if (t.top >= h + margin) {
      top = t.top - 4 - h;
    } else {
      top = Math.max(margin, window.innerHeight - margin - h);
    }

    // Align the menu's right edge to the trigger's, then keep it on screen.
    let right = window.innerWidth - t.right;
    if (window.innerWidth - right - w < margin)
      right = window.innerWidth - w - margin;
    if (right < margin) right = margin;

    setPos({ top, right });
  }, [open]);

  // Move focus into the menu once it's placed, for keyboard users.
  useEffect(() => {
    if (!open || !pos || !menuRef.current) return;
    const first = menuRef.current.querySelector(".ua-item");
    if (first) first.focus();
  }, [open, pos]);

  // A fixed menu doesn't follow the page — close it if the user scrolls or
  // resizes (scrolling inside the menu itself is exempt).
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

  function onMenuKeyDown(e) {
    if (!menuRef.current) return;
    const items = Array.from(menuRef.current.querySelectorAll(".ua-item"));
    if (items.length === 0) return;
    const i = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(i + 1) % items.length].focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length].focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0].focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1].focus();
    }
  }

  function openDialog(which) {
    setOpen(false);
    setError("");
    setDialog(which);
  }

  async function send(body) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);

    if (res.ok) {
      setDialog(null);
      router.refresh();
      return true;
    }
    const d = await res.json().catch(() => ({}));
    setError(d.error || "Could not complete that action.");
    return false;
  }

  function toggleActive() {
    setOpen(false);
    const ok = window.confirm(
      isActive
        ? `Disable ${name}? They will be signed out immediately and cannot sign back in.`
        : `Enable ${name}? They will be able to sign in again.`,
    );
    if (!ok) return;
    send({ action: "setActive", value: !isActive });
  }

  async function deleteAccount() {
    setOpen(false);
    const ok = window.confirm(
      `Delete ${name}'s account? This cannot be undone. Their documents are kept but will no longer show a creator.`,
    );
    if (!ok) return;

    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        window.alert(d.error || "Could not delete the account.");
      }
    } catch {
      window.alert("Could not delete the account.");
    }
    setBusy(false);
  }

  const menu =
    open && mounted
      ? createPortal(
          <div
            role="menu"
            aria-label={`Actions for ${name}`}
            ref={menuRef}
            className="ua-menu"
            onKeyDown={onMenuKeyDown}
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
              className="ua-item"
              style={S.item}
              onClick={() => openDialog("password")}
            >
              Reset password
            </button>

            {companies.length > 0 ? (
              <button
                type="button"
                role="menuitem"
                className="ua-item"
                style={S.item}
                onClick={() => openDialog("role")}
              >
                Change role
              </button>
            ) : null}

            {addable.length > 0 ? (
              <button
                type="button"
                role="menuitem"
                className="ua-item"
                style={S.item}
                onClick={() => openDialog("add")}
              >
                Add to company
              </button>
            ) : null}

            {addable.length > 0 && companies.length > 0 ? (
              <button
                type="button"
                role="menuitem"
                className="ua-item"
                style={S.item}
                onClick={() => openDialog("move")}
              >
                Move to company
              </button>
            ) : null}

            {companies.length > 1 ? (
              <button
                type="button"
                role="menuitem"
                className="ua-item"
                style={S.item}
                onClick={() => openDialog("remove")}
              >
                Remove from company
              </button>
            ) : null}

            {!isSelf ? (
              <>
                <div style={S.divider} />
                <button
                  type="button"
                  role="menuitem"
                  className={isActive ? "ua-item ua-danger" : "ua-item"}
                  style={isActive ? S.itemDanger : S.item}
                  onClick={toggleActive}
                >
                  {isActive ? "Disable account" : "Enable account"}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="ua-item ua-danger"
                  style={S.itemDanger}
                  onClick={deleteAccount}
                >
                  Delete account
                </button>
              </>
            ) : null}
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

      {dialog === "password" ? (
        <PasswordDialog
          name={name}
          busy={busy}
          error={error}
          onCancel={() => setDialog(null)}
          onSubmit={(pw) => send({ action: "resetPassword", value: pw })}
        />
      ) : null}

      {dialog === "role" ? (
        <RoleDialog
          name={name}
          companies={companies}
          busy={busy}
          error={error}
          onCancel={() => setDialog(null)}
          onSubmit={(companyId, role) =>
            send({ action: "setRole", value: { companyId, role } })
          }
        />
      ) : null}

      {dialog === "add" ? (
        <AddDialog
          name={name}
          userId={userId}
          companies={addable}
          busy={busy}
          error={error}
          setBusy={setBusy}
          setError={setError}
          onCancel={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            router.refresh();
          }}
        />
      ) : null}

      {dialog === "move" ? (
        <MoveDialog
          name={name}
          userId={userId}
          from={companies}
          to={addable}
          busy={busy}
          error={error}
          setBusy={setBusy}
          setError={setError}
          onCancel={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            router.refresh();
          }}
        />
      ) : null}

      {dialog === "remove" ? (
        <RemoveDialog
          name={name}
          userId={userId}
          companies={companies}
          busy={busy}
          error={error}
          setBusy={setBusy}
          setError={setError}
          onCancel={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function MoveDialog({
  name,
  userId,
  from,
  to,
  busy,
  error,
  setBusy,
  setError,
  onCancel,
  onDone,
}) {
  const [fromId, setFromId] = useState(from[0]?.id ?? "");
  const [toId, setToId] = useState(to[0]?.id ?? "");
  const [role, setRole] = useState("VIEWER");

  async function submit() {
    const fromName = from.find((c) => c.id === fromId)?.name;
    const toName = to.find((c) => c.id === toId)?.name;
    const ok = window.confirm(
      `Move ${name} from ${fromName} to ${toName}? They lose access in ${fromName}.`,
    );
    if (!ok) return;

    setBusy(true);
    setError("");

    // Add to the destination first, so a failure never leaves them
    // belonging nowhere. Only remove the origin once the add succeeded.
    const add = await fetch(`/api/admin/users/${userId}/memberships`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: toId, role }),
    });

    if (!add.ok) {
      setBusy(false);
      const d = await add.json().catch(() => ({}));
      setError(d.error || "Could not add to the new company.");
      return;
    }

    const remove = await fetch(`/api/admin/users/${userId}/memberships`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: fromId }),
    });

    setBusy(false);

    if (remove.ok) {
      onDone();
    } else {
      const d = await remove.json().catch(() => ({}));
      // The add worked but the remove failed — they are now in both.
      setError(
        (d.error ||
          "Added to the new company, but could not remove the old one.") +
          " They are in both for now.",
      );
    }
  }

  return (
    <Modal onCancel={onCancel}>
      <p className="eyebrow" style={M.eyebrow}>
        Move to company
      </p>
      <h3 style={M.title}>{name}</h3>
      <p style={M.sub}>
        Moves them out of one company and into another in a single step.
      </p>

      <label style={M.label} htmlFor="fromco">
        From
      </label>
      <select
        id="fromco"
        className="field"
        value={fromId}
        onChange={(e) => setFromId(e.target.value)}
      >
        {from.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <label style={M.label} htmlFor="toco">
        To
      </label>
      <select
        id="toco"
        className="field"
        value={toId}
        onChange={(e) => setToId(e.target.value)}
      >
        {to.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <label style={M.label} htmlFor="moverole">
        Role in new company
      </label>
      <select
        id="moverole"
        className="field"
        value={role}
        onChange={(e) => setRole(e.target.value)}
      >
        {ROLES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>

      {error ? <p style={M.error}>{error}</p> : null}

      <div style={M.actions}>
        <button type="button" className="btn btn-text" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={submit}
        >
          {busy ? "Moving" : "Move"}
        </button>
      </div>
    </Modal>
  );
}

function AddDialog({
  name,
  userId,
  companies,
  busy,
  error,
  setBusy,
  setError,
  onCancel,
  onDone,
}) {
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [role, setRole] = useState("VIEWER");

  async function submit() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/admin/users/${userId}/memberships`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, role }),
    });
    setBusy(false);
    if (res.ok) onDone();
    else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Could not add them.");
    }
  }

  return (
    <Modal onCancel={onCancel}>
      <p className="eyebrow" style={M.eyebrow}>
        Add to company
      </p>
      <h3 style={M.title}>{name}</h3>

      <label style={M.label} htmlFor="addco">
        Company
      </label>
      <select
        id="addco"
        className="field"
        value={companyId}
        onChange={(e) => setCompanyId(e.target.value)}
      >
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <label style={M.label} htmlFor="addrole">
        Role
      </label>
      <select
        id="addrole"
        className="field"
        value={role}
        onChange={(e) => setRole(e.target.value)}
      >
        {ROLES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>

      {error ? <p style={M.error}>{error}</p> : null}

      <div style={M.actions}>
        <button type="button" className="btn btn-text" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={submit}
        >
          {busy ? "Adding" : "Add to company"}
        </button>
      </div>
    </Modal>
  );
}

function RemoveDialog({
  name,
  userId,
  companies,
  busy,
  error,
  setBusy,
  setError,
  onCancel,
  onDone,
}) {
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");

  async function submit() {
    const c = companies.find((x) => x.id === companyId);
    const ok = window.confirm(
      `Remove ${name} from ${c?.name}? They lose all access there, including anything shared with them.`,
    );
    if (!ok) return;

    setBusy(true);
    setError("");
    const res = await fetch(`/api/admin/users/${userId}/memberships`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId }),
    });
    setBusy(false);
    if (res.ok) onDone();
    else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Could not remove them.");
    }
  }

  return (
    <Modal onCancel={onCancel}>
      <p className="eyebrow" style={M.eyebrow}>
        Remove from company
      </p>
      <h3 style={M.title}>{name}</h3>
      <p style={M.sub}>
        They keep their account and any other companies. Their access here is
        removed straight away.
      </p>

      <label style={M.label} htmlFor="rmco">
        Company
      </label>
      <select
        id="rmco"
        className="field"
        value={companyId}
        onChange={(e) => setCompanyId(e.target.value)}
      >
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      {error ? <p style={M.error}>{error}</p> : null}

      <div style={M.actions}>
        <button type="button" className="btn btn-text" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-danger"
          disabled={busy}
          onClick={submit}
        >
          {busy ? "Removing" : "Remove"}
        </button>
      </div>
    </Modal>
  );
}

function PasswordDialog({ name, busy, error, onCancel, onSubmit }) {
  const [pw, setPw] = useState("");
  return (
    <Modal onCancel={onCancel}>
      <p className="eyebrow" style={M.eyebrow}>
        Reset password
      </p>
      <h3 style={M.title}>{name}</h3>
      <p style={M.sub}>
        They will be signed out everywhere and must use the new password next
        time.
      </p>

      <label style={M.label} htmlFor="newpw">
        New password
      </label>
      <input
        id="newpw"
        className="field"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        placeholder="At least 12 characters"
        autoFocus
      />

      {error ? <p style={M.error}>{error}</p> : null}

      <div style={M.actions}>
        <button type="button" className="btn btn-text" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || pw.length < 12}
          onClick={() => onSubmit(pw)}
        >
          {busy ? "Saving" : "Set password"}
        </button>
      </div>
    </Modal>
  );
}

function RoleDialog({ name, companies, busy, error, onCancel, onSubmit }) {
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const current = companies.find((c) => c.id === companyId);
  const [role, setRole] = useState(current?.role ?? "VIEWER");

  function pickCompany(id) {
    setCompanyId(id);
    const c = companies.find((x) => x.id === id);
    if (c) setRole(c.role);
  }

  return (
    <Modal onCancel={onCancel}>
      <p className="eyebrow" style={M.eyebrow}>
        Change role
      </p>
      <h3 style={M.title}>{name}</h3>

      {companies.length > 1 ? (
        <>
          <label style={M.label} htmlFor="co">
            Company
          </label>
          <select
            id="co"
            className="field"
            value={companyId}
            onChange={(e) => pickCompany(e.target.value)}
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </>
      ) : (
        <p style={M.sub}>In {companies[0]?.name}</p>
      )}

      <label style={M.label} htmlFor="role">
        Role
      </label>
      <select
        id="role"
        className="field"
        value={role}
        onChange={(e) => setRole(e.target.value)}
      >
        {ROLES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>

      {error ? <p style={M.error}>{error}</p> : null}

      <div style={M.actions}>
        <button type="button" className="btn btn-text" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => onSubmit(companyId, role)}
        >
          {busy ? "Saving" : "Save role"}
        </button>
      </div>
    </Modal>
  );
}

function Modal({ children, onCancel }) {
  return (
    <div style={M.backdrop} onClick={onCancel}>
      <div style={M.panel} onClick={(e) => e.stopPropagation()}>
        {children}
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
  triggerOpen: {
    background: "rgba(0, 0, 0, 0.06)",
    color: "var(--text)",
  },
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
    maxWidth: 420,
    background: "var(--panel)",
    borderRadius: 12,
    padding: 26,
    boxShadow: "var(--shadow-raised)",
  },
  eyebrow: { marginBottom: 6 },
  title: { fontSize: 18, fontWeight: 500 },
  sub: { fontSize: 13, color: "var(--muted)", marginTop: 4, lineHeight: 1.5 },
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
