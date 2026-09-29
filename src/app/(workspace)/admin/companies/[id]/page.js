import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import DownloadButton from "../../download-button";
import PresenceDot from "../../presence-dot";
import UserActions from "../../user-actions";
import UserDocuments from "../../user-documents";

const ROLE_LABELS = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  EDITOR: "Editor",
  VIEWER: "Viewer",
};

/** Rows per page, matching the Drive. */
const PAGE_SIZE = 20;

function initials(name) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function fmtSize(bytes) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// /admin/companies/[id] — everyone in one company (People tab) and every
// document in it (Documents tab), so an admin can see the whole picture
// without hunting through the global lists.
export default async function CompanyPeoplePage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = sp?.tab === "documents" ? "documents" : "people";

  /**
   * The two tabs share a URL, so they need separate page numbers. With one
   * `page` param, moving to page 3 of documents and then switching to People
   * would land on page 3 of a list that may only have one.
   */
  const peoplePage = Math.max(1, Number(sp?.ppage) || 1);
  const docsPage = Math.max(1, Number(sp?.dpage) || 1);

  const user = await getCurrentUser();

  const adminOf = user.memberships
    .filter((m) => m.role === "ADMIN")
    .map((m) => m.companyId);

  const allowed = user.isSuperAdmin || adminOf.includes(id);
  if (!allowed) {
    return (
      <div style={S.empty}>
        <p style={S.muted}>You don’t manage this company.</p>
      </div>
    );
  }

  const company = await prisma.company.findFirst({
    where: { id, deletedAt: null },
  });
  if (!company) notFound();

  const manageable = await prisma.company.findMany({
    where: user.isSuperAdmin
      ? { deletedAt: null }
      : { deletedAt: null, id: { in: adminOf } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // Counts first: the headers and tabs need them whichever tab is open, and
  // they decide how far the pagers go.
  const [peopleTotal, docsTotal, fileCount, trashedCount] = await Promise.all([
    prisma.user.count({ where: { memberships: { some: { companyId: id } } } }),
    // Everything, trashed included — the Documents table lists both.
    prisma.file.count({ where: { companyId: id } }),
    prisma.file.count({ where: { companyId: id, deletedAt: null } }),
    prisma.file.count({ where: { companyId: id, deletedAt: { not: null } } }),
  ]);

  const peoplePages = Math.max(1, Math.ceil(peopleTotal / PAGE_SIZE));
  const docsPages = Math.max(1, Math.ceil(docsTotal / PAGE_SIZE));

  // A page past the end lands on the last real one rather than an empty list.
  const pPage = Math.min(peoplePage, peoplePages);
  const dPage = Math.min(docsPage, docsPages);

  /**
   * Only the visible tab is fetched. Before, both lists were loaded in full
   * on every request — so opening People also pulled every document in the
   * company, and vice versa.
   */
  const people =
    tab === "people"
      ? await prisma.user.findMany({
          where: { memberships: { some: { companyId: id } } },
          orderBy: { createdAt: "desc" },
          skip: (pPage - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          include: { memberships: { include: { company: true } } },
        })
      : [];

  const files =
    tab === "documents"
      ? await prisma.file.findMany({
          where: { companyId: id },
          orderBy: { createdAt: "desc" },
          skip: (dPage - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          include: { uploadedBy: { select: { name: true } } },
        })
      : [];

  /** Keeps the tab, changes only that tab's page number. */
  function pageUrl(which, n) {
    const s = new URLSearchParams();
    if (tab === "documents") s.set("tab", "documents");
    if (which === "people" && n > 1) s.set("ppage", String(n));
    if (which === "documents" && n > 1) s.set("dpage", String(n));
    const str = s.toString();
    return str ? `/admin/companies/${id}?${str}` : `/admin/companies/${id}`;
  }

  return (
    <>
      <style>{`
        .admin-row { transition: background-color .12s ease; }
        .admin-row:hover { background: var(--bg); }
        .back-link { color: var(--muted); text-decoration: none; }
        .back-link:hover { color: var(--text); }
        .doc-link { text-decoration: none; }
        .doc-link:hover span { text-decoration: underline; }
        .doc-dl:hover { background: var(--bg); color: var(--text); }
        .pg-link { transition: background .12s ease, border-color .12s ease; }
        .pg-link:hover { background: var(--bg); border-color: var(--muted); }
      `}</style>

      <header style={S.head}>
        <Link href="/admin" className="back-link" style={S.back}>
          <svg
            viewBox="0 0 24 24"
            width="15"
            height="15"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
          </svg>
          All companies
        </Link>

        <div style={S.titleRow}>
          <span style={S.orgMark}>
            {company.name.slice(0, 1).toUpperCase()}
          </span>
          <h1 style={S.h1}>{company.name}</h1>
        </div>
        <p style={S.sub}>
          {company.domain} · {peopleTotal}{" "}
          {peopleTotal === 1 ? "person" : "people"} · {fileCount}{" "}
          {fileCount === 1 ? "document" : "documents"}
        </p>
      </header>

      <div style={S.tabs}>
        <Link
          href={`/admin/companies/${id}`}
          style={tab === "people" ? S.tabOn : S.tab}
        >
          People <span style={S.tabCount}>{peopleTotal}</span>
        </Link>
        <Link
          href={`/admin/companies/${id}?tab=documents`}
          style={tab === "documents" ? S.tabOn : S.tab}
        >
          Documents <span style={S.tabCount}>{fileCount}</span>
        </Link>
      </div>

      {tab === "people" ? (
        <>
          <PeopleTable
            people={people}
            user={user}
            adminOf={adminOf}
            manageable={manageable}
            companyId={id}
          />
          <Pager
            page={pPage}
            totalPages={peoplePages}
            total={peopleTotal}
            shown={people.length}
            skip={(pPage - 1) * PAGE_SIZE}
            hrefFor={(n) => pageUrl("people", n)}
          />
        </>
      ) : (
        <>
          <DocumentsTable files={files} trashedCount={trashedCount} />
          <Pager
            page={dPage}
            totalPages={docsPages}
            total={docsTotal}
            shown={files.length}
            skip={(dPage - 1) * PAGE_SIZE}
            hrefFor={(n) => pageUrl("documents", n)}
          />
        </>
      )}
    </>
  );
}

/** Shared by both tabs; renders nothing when everything fits on one page. */
function Pager({ page, totalPages, total, shown, skip, hrefFor }) {
  if (totalPages <= 1) return null;

  const first = total === 0 ? 0 : skip + 1;
  const last = skip + shown;

  return (
    <nav style={S.pager} aria-label="Pages">
      <span style={S.pagerCount}>
        {first.toLocaleString()}–{last.toLocaleString()} of{" "}
        {total.toLocaleString()}
      </span>

      <span style={S.pagerButtons}>
        {page > 1 ? (
          <Link
            href={hrefFor(page - 1)}
            className="pg-link"
            style={S.pagerBtn}
            rel="prev"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
            </svg>
            Previous
          </Link>
        ) : (
          <span style={S.pagerBtnOff}>
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
            </svg>
            Previous
          </span>
        )}

        <span style={S.pagerPage}>
          Page {page} of {totalPages}
        </span>

        {page < totalPages ? (
          <Link
            href={hrefFor(page + 1)}
            className="pg-link"
            style={S.pagerBtn}
            rel="next"
          >
            Next
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
            </svg>
          </Link>
        ) : (
          <span style={S.pagerBtnOff}>
            Next
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
            </svg>
          </span>
        )}
      </span>
    </nav>
  );
}

function PeopleTable({ people, user, adminOf, manageable, companyId }) {
  return (
    <div style={S.card}>
      {people.length === 0 ? (
        <div style={S.cardEmpty}>
          <p style={S.muted}>No one is in this company yet.</p>
        </div>
      ) : (
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Name</th>
              <th style={S.th}>Email</th>
              <th style={S.th}>Role here</th>
              <th style={S.th}>Status</th>
              <th style={S.thRight} />
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const shown = user.isSuperAdmin
                ? p.memberships
                : p.memberships.filter((m) => adminOf.includes(m.companyId));
              const here = p.memberships.find((m) => m.companyId === companyId);

              return (
                <tr key={p.id} className="admin-row">
                  <td style={S.td}>
                    <span style={S.person}>
                      <span style={p.isActive ? S.avatar : S.avatarOff}>
                        {initials(p.name)}
                      </span>
                      <span style={S.personName}>
                        <UserDocuments userId={p.id} name={p.name} />
                        {p.isSuperAdmin ? (
                          <span style={S.tag}>Super admin</span>
                        ) : null}
                        {!p.isActive ? (
                          <span style={S.off}>Disabled</span>
                        ) : null}
                      </span>
                    </span>
                  </td>
                  <td style={S.tdMuted}>{p.email}</td>
                  <td style={S.td}>
                    {here ? (
                      <span style={S.role}>
                        {ROLE_LABELS[here.role] ?? here.role}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td style={S.td}>
                    <PresenceDot lastSeenAt={p.lastSeenAt} />
                  </td>
                  <td style={S.tdRight}>
                    <UserActions
                      userId={p.id}
                      name={p.name}
                      isActive={p.isActive}
                      isSelf={p.id === user.id}
                      companies={shown.map((m) => ({
                        id: m.company.id,
                        name: m.company.name,
                        role: m.role,
                      }))}
                      allCompanies={manageable.map((c) => ({
                        id: c.id,
                        name: c.name,
                      }))}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function DocumentsTable({ files, trashedCount }) {
  return (
    <>
      {trashedCount > 0 ? (
        <p style={S.note}>
          {trashedCount} {trashedCount === 1 ? "document is" : "documents are"}{" "}
          in the trash and shown greyed out below.
        </p>
      ) : null}

      <div style={S.card}>
        {files.length === 0 ? (
          <div style={S.cardEmpty}>
            <p style={S.muted}>No documents in this company yet.</p>
          </div>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Name</th>
                <th style={S.th}>Created by</th>
                <th style={S.thNum}>Size</th>
                <th style={S.th}>Date added</th>
                <th style={S.thRight} />
              </tr>
            </thead>
            <tbody>
              {files.map((f) => {
                const trashed = Boolean(f.deletedAt);
                return (
                  <tr key={f.id} className="admin-row">
                    <td style={S.td}>
                      <Link
                        href={`/edit/${f.id}`}
                        className="doc-link"
                        style={S.fileName}
                      >
                        <span style={trashed ? S.nameOff : S.name}>
                          {f.name}
                        </span>
                        {trashed ? <span style={S.off}>Trashed</span> : null}
                      </Link>
                    </td>
                    <td style={S.tdMuted}>{f.uploadedBy?.name ?? "—"}</td>
                    <td style={S.tdNum}>{fmtSize(f.size)}</td>
                    <td style={S.tdMuted}>{fmtDate(f.createdAt)}</td>
                    <td style={S.tdRight}>
                      <DownloadButton fileId={f.id} fileName={f.name} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

const S = {
  head: {
    paddingBottom: 22,
    borderBottom: "1px solid var(--line-soft)",
    marginBottom: 20,
  },
  back: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 13,
    fontWeight: 500,
    marginBottom: 16,
  },
  titleRow: { display: "flex", alignItems: "center", gap: 14 },
  orgMark: {
    width: 38,
    height: 38,
    borderRadius: 10,
    background: "var(--accent-soft)",
    color: "var(--accent)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 16,
    fontWeight: 600,
    flexShrink: 0,
  },
  h1: {
    fontSize: 30,
    fontWeight: 400,
    letterSpacing: "-0.02em",
    color: "var(--text)",
  },
  sub: { fontSize: 14, color: "var(--muted)", marginTop: 10 },

  tabs: {
    display: "flex",
    gap: 4,
    borderBottom: "1px solid var(--line)",
    marginBottom: 20,
  },
  tab: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 14,
    color: "var(--muted)",
    textDecoration: "none",
    padding: "10px 14px",
    borderBottom: "3px solid transparent",
  },
  tabOn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 14,
    fontWeight: 500,
    color: "var(--accent)",
    textDecoration: "none",
    padding: "10px 14px",
    borderBottom: "3px solid var(--accent)",
  },
  tabCount: {
    fontSize: 12,
    fontWeight: 500,
    color: "var(--muted)",
    background: "var(--bg)",
    padding: "1px 8px",
    borderRadius: 999,
    fontVariantNumeric: "tabular-nums",
  },

  note: { fontSize: 13, color: "var(--muted)", margin: "0 0 12px 2px" },

  card: {
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: "var(--r-card)",
    boxShadow: "0 1px 2px rgba(17,24,39,.04)",
    overflowX: "auto",
  },
  cardEmpty: { padding: "40px 24px", textAlign: "center" },
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
  tdRight: {
    padding: "13px 18px",
    borderTop: "1px solid var(--line-soft)",
    textAlign: "right",
  },
  td: {
    padding: "13px 18px",
    borderTop: "1px solid var(--line-soft)",
    fontSize: 14,
  },
  tdMuted: {
    padding: "13px 18px",
    borderTop: "1px solid var(--line-soft)",
    fontSize: 13,
    color: "var(--muted)",
  },
  tdNum: {
    padding: "13px 18px",
    borderTop: "1px solid var(--line-soft)",
    fontSize: 13,
    color: "var(--text-2)",
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
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
  fileName: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
    textDecoration: "none",
    color: "var(--text)",
  },
  name: { fontWeight: 500 },
  nameOff: {
    fontWeight: 500,
    color: "var(--muted)",
    textDecoration: "line-through",
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
  },

  pager: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    marginTop: 18,
    paddingTop: 16,
    borderTop: "1px solid var(--line-soft)",
  },
  pagerCount: {
    fontSize: 13,
    color: "var(--muted)",
    fontVariantNumeric: "tabular-nums",
  },
  pagerButtons: { display: "flex", alignItems: "center", gap: 8 },
  pagerBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 36,
    padding: "0 14px",
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    color: "var(--text-2)",
    fontSize: 13,
    fontWeight: 500,
    textDecoration: "none",
    whiteSpace: "nowrap",
  },
  // Rendered rather than hidden, so the pager doesn't shift as you move
  // between the first and last pages.
  pagerBtnOff: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 36,
    padding: "0 14px",
    background: "transparent",
    border: "1px solid var(--line-soft)",
    borderRadius: 8,
    color: "var(--muted)",
    fontSize: 13,
    fontWeight: 500,
    whiteSpace: "nowrap",
    opacity: 0.5,
  },
  pagerPage: {
    fontSize: 13,
    color: "var(--text-2)",
    fontWeight: 500,
    padding: "0 4px",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },

  empty: {
    padding: "56px 28px",
    background: "var(--bg)",
    borderRadius: "var(--r-card)",
    textAlign: "center",
  },
  muted: { color: "var(--muted)", fontSize: 14 },
};
