"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import CompanyActions from "./company-actions";
import PresenceDot from "./presence-dot";
import UserActions from "./user-actions";

const ROLE_LABELS = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  EDITOR: "Editor",
  VIEWER: "Viewer",
};

function initials(name) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * A magnifier that expands into a field. Filtering happens in memory —
 * every row is already on the page, so there's no reason to involve the
 * server or the URL. If these lists ever get paginated, this would only
 * search the current page and would need moving server-side.
 */
function SearchBox({ value, onChange, placeholder, matched, total }) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  function close() {
    onChange("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        className="adm-search-btn"
        onClick={() => setOpen(true)}
        style={T.iconBtn}
        aria-label={placeholder}
        title={placeholder}
      >
        <svg
          viewBox="0 0 24 24"
          width="17"
          height="17"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 5 1.5-1.5-5-5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z" />
        </svg>
      </button>
    );
  }

  return (
    <span style={T.searchWrap}>
      <span style={T.searchField}>
        <svg
          viewBox="0 0 24 24"
          width="15"
          height="15"
          fill="currentColor"
          aria-hidden="true"
          style={T.searchIcon}
        >
          <path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 5 1.5-1.5-5-5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              close();
            }
          }}
          placeholder={placeholder}
          style={T.searchInput}
          aria-label={placeholder}
        />
        <button
          type="button"
          onClick={close}
          style={T.searchClose}
          aria-label="Close search"
        >
          ×
        </button>
      </span>
      {value ? (
        <span style={T.matchCount}>
          {matched} of {total}
        </span>
      ) : null}
    </span>
  );
}

const norm = (s) => String(s ?? "").toLowerCase();

// ---------------------------------------------------------------- companies

export function CompanyTable({ companies, isSuperAdmin }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();

  const shown = needle
    ? companies.filter(
        (c) => norm(c.name).includes(needle) || norm(c.domain).includes(needle),
      )
    : companies;

  return (
    <>
      <div style={T.sectionHead}>
        <h2 style={T.h2}>{isSuperAdmin ? "Companies" : "Company"}</h2>
        <span style={T.count}>{companies.length}</span>
        <span style={T.spacer} />
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder="Search companies"
          matched={shown.length}
          total={companies.length}
        />
      </div>

      <div style={T.card}>
        {shown.length === 0 ? (
          <div style={T.cardEmpty}>
            <p style={T.mutedText}>No companies match “{q}”.</p>
          </div>
        ) : (
          <table style={T.table}>
            <thead>
              <tr>
                <th style={T.th}>Name</th>
                <th style={T.thNum}>People</th>
                <th style={T.thNum}>Documents</th>
                {isSuperAdmin ? <th style={T.thRight} /> : null}
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id} className="admin-row">
                  <td style={T.td}>
                    <Link
                      href={`/admin/companies/${c.id}`}
                      className="company-link"
                      style={T.orgRow}
                    >
                      <span style={T.orgMark}>
                        {c.name.slice(0, 1).toUpperCase()}
                      </span>
                      {c.name}
                    </Link>
                  </td>
                  <td style={T.tdNum}>{c.people}</td>
                  <td style={T.tdNum}>{c.files}</td>
                  {isSuperAdmin ? (
                    <td style={T.tdRight}>
                      <CompanyActions
                        companyId={c.id}
                        name={c.name}
                        domain={c.domain}
                      />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// ------------------------------------------------------------------- people

export function PeopleTable({ people, allCompanies, currentUserId }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();

  // Name, email, and company all searchable — "who's in Accounts?" is as
  // likely a question as "where's Rohan?".
  const shown = needle
    ? people.filter(
        (p) =>
          norm(p.name).includes(needle) ||
          norm(p.email).includes(needle) ||
          p.companies.some((m) => norm(m.name).includes(needle)),
      )
    : people;

  return (
    <>
      <div style={T.sectionHead}>
        <h2 style={T.h2}>People</h2>
        <span style={T.count}>{people.length}</span>
        <span style={T.spacer} />
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder="Search people"
          matched={shown.length}
          total={people.length}
        />
      </div>

      <div style={T.card}>
        {shown.length === 0 ? (
          <div style={T.cardEmpty}>
            <p style={T.mutedText}>No one matches “{q}”.</p>
          </div>
        ) : (
          <table style={T.table}>
            <thead>
              <tr>
                <th style={T.th}>Name</th>
                <th style={T.th}>Email</th>
                <th style={T.th}>Company</th>
                <th style={T.th}>Role</th>
                <th style={T.th}>Status</th>
                <th style={T.thRight} />
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id} className="admin-row">
                  <td style={T.td}>
                    <span style={T.person}>
                      <span style={p.isActive ? T.avatar : T.avatarOff}>
                        {initials(p.name)}
                      </span>
                      <span style={T.personName}>
                        {p.name}
                        {p.isSuperAdmin ? (
                          <span style={T.tag}>Super admin</span>
                        ) : null}
                        {!p.isActive ? (
                          <span style={T.off}>Disabled</span>
                        ) : null}
                      </span>
                    </span>
                  </td>
                  <td style={T.tdMuted}>{p.email}</td>
                  <td style={T.tdMuted}>
                    {p.companies.map((m) => m.name).join(", ") || "—"}
                  </td>
                  <td style={T.td}>
                    {p.companies.length === 0
                      ? "—"
                      : p.companies.map((m) => (
                          <span key={m.membershipId} style={T.role}>
                            {ROLE_LABELS[m.role] ?? m.role}
                          </span>
                        ))}
                  </td>
                  <td style={T.td}>
                    <PresenceDot lastSeenAt={p.lastSeenAt} />
                  </td>
                  <td style={T.tdRight}>
                    <UserActions
                      userId={p.id}
                      name={p.name}
                      isActive={p.isActive}
                      isSelf={p.id === currentUserId}
                      companies={p.companies.map((m) => ({
                        id: m.id,
                        name: m.name,
                        role: m.role,
                      }))}
                      allCompanies={allCompanies}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

const T = {
  sectionHead: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  h2: { fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em" },
  count: {
    fontSize: 12,
    fontWeight: 500,
    color: "var(--muted)",
    background: "var(--bg)",
    padding: "2px 9px",
    borderRadius: 999,
    fontVariantNumeric: "tabular-nums",
  },
  spacer: { flex: 1 },

  iconBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    borderRadius: 999,
    border: "none",
    background: "transparent",
    color: "var(--muted)",
    cursor: "pointer",
    transition: "background 90ms ease, color 90ms ease",
  },
  searchWrap: { display: "inline-flex", alignItems: "center", gap: 8 },
  searchField: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    height: 34,
    padding: "0 6px 0 11px",
    background: "var(--bg)",
    border: "1px solid var(--line)",
    borderRadius: 999,
  },
  searchIcon: { color: "var(--muted)", flexShrink: 0 },
  searchInput: {
    width: 170,
    height: "100%",
    border: "none",
    outline: "none",
    background: "transparent",
    color: "var(--text)",
    fontSize: 13,
  },
  searchClose: {
    border: "none",
    background: "transparent",
    color: "var(--muted)",
    fontSize: 18,
    lineHeight: 1,
    cursor: "pointer",
    padding: "0 6px",
  },
  matchCount: {
    fontSize: 12,
    color: "var(--muted)",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },

  card: {
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: "var(--r-card)",
    boxShadow: "0 1px 2px rgba(17,24,39,.04)",
    overflowX: "auto",
  },
  cardEmpty: { padding: "40px 24px", textAlign: "center" },
  mutedText: { color: "var(--muted)", fontSize: 14 },
  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    textAlign: "left",
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: ".04em",
    textTransform: "uppercase",
    color: "var(--muted)",
    padding: "15px 18px 13px",
    whiteSpace: "nowrap",
  },
  thNum: {
    textAlign: "right",
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: ".04em",
    textTransform: "uppercase",
    color: "var(--muted)",
    padding: "15px 18px 13px",
    whiteSpace: "nowrap",
  },
  thRight: { padding: "15px 18px 13px", width: 48 },
  td: {
    padding: "13px 18px",
    borderTop: "1px solid var(--line-soft)",
    fontSize: 14,
  },
  tdNum: {
    padding: "13px 18px",
    borderTop: "1px solid var(--line-soft)",
    fontSize: 14,
    textAlign: "right",
    color: "var(--text-2)",
    fontVariantNumeric: "tabular-nums",
  },
  tdMuted: {
    padding: "13px 18px",
    borderTop: "1px solid var(--line-soft)",
    fontSize: 13,
    color: "var(--muted)",
  },
  tdRight: {
    padding: "13px 18px",
    borderTop: "1px solid var(--line-soft)",
    textAlign: "right",
  },

  orgRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: 12,
    fontSize: 14,
  },
  orgMark: {
    width: 30,
    height: 30,
    borderRadius: 9,
    background: "var(--accent-soft)",
    color: "var(--accent)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 600,
  },
  person: { display: "inline-flex", alignItems: "center", gap: 12 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 999,
    background: "var(--accent-soft)",
    color: "var(--accent)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 600,
    flexShrink: 0,
  },
  avatarOff: {
    width: 32,
    height: 32,
    borderRadius: 999,
    background: "var(--bg)",
    color: "var(--muted)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 600,
    flexShrink: 0,
  },
  personName: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontWeight: 500,
  },
  tag: {
    fontSize: 11,
    fontWeight: 500,
    color: "var(--accent)",
    background: "var(--accent-soft)",
    padding: "2px 8px",
    borderRadius: 999,
  },
  off: {
    fontSize: 11,
    fontWeight: 500,
    color: "var(--danger)",
    background: "var(--danger-soft)",
    padding: "2px 8px",
    borderRadius: 999,
  },
  role: {
    display: "inline-block",
    fontSize: 12,
    color: "var(--text-2)",
    background: "var(--bg)",
    padding: "3px 10px",
    borderRadius: 999,
    marginRight: 6,
  },
};
