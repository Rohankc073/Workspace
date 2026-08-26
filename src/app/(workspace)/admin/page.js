import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { CompanyTable, PeopleTable } from "./admin-search-tables";
import CompanyTrashActions from "./company-trash-actions";
import NewCompany from "./new-company";
import NewUser from "./new-user";

const ICONS = {
  company:
    "M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z",
  people:
    "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z",
  active: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  documents:
    "M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z",
};

export default async function AdminPage({ searchParams }) {
  const user = await getCurrentUser();
  const sp = await searchParams;
  const ctab = sp?.ctab === "trash" ? "trash" : "active";

  // Companies this person administers. Super admins administer all.
  const adminOf = user.memberships
    .filter((m) => m.role === "ADMIN")
    .map((m) => m.companyId);

  if (!user.isSuperAdmin && adminOf.length === 0) {
    return (
      <div style={S.empty}>
        <p style={S.muted}>This area is for administrators.</p>
      </div>
    );
  }

  const companyFilter = user.isSuperAdmin ? {} : { id: { in: adminOf } };
  const userFilter = user.isSuperAdmin
    ? {}
    : { memberships: { some: { companyId: { in: adminOf } } } };

  const [companies, people, deletedCompanies] = await Promise.all([
    prisma.company.findMany({
      where: { ...companyFilter, deletedAt: null },
      orderBy: { name: "asc" },
      include: { _count: { select: { memberships: true, files: true } } },
    }),
    prisma.user.findMany({
      where: userFilter,
      orderBy: { createdAt: "desc" },
      include: { memberships: { include: { company: true } } },
    }),
    user.isSuperAdmin
      ? prisma.company.findMany({
          where: { deletedAt: { not: null } },
          orderBy: { deletedAt: "desc" },
          include: { _count: { select: { memberships: true, files: true } } },
        })
      : Promise.resolve([]),
  ]);

  const title = user.isSuperAdmin
    ? "All companies"
    : (companies[0]?.name ?? "Administration");
  const scope = user.isSuperAdmin
    ? "Every company in the group."
    : "You manage this company only.";

  // Flatten to plain objects — the tables are client components now, so
  // anything crossing that boundary has to be serialisable (no Prisma
  // model instances, no Date objects).
  const plainCompanies = companies.map((c) => ({
    id: c.id,
    name: c.name,
    domain: c.domain,
    people: c._count.memberships,
    files: c._count.files,
  }));

  const plainPeople = people.map((p) => {
    // A company admin should only see this person's roles in the
    // companies they themselves administer.
    const shown = user.isSuperAdmin
      ? p.memberships
      : p.memberships.filter((m) => adminOf.includes(m.companyId));

    return {
      id: p.id,
      name: p.name,
      email: p.email,
      isActive: p.isActive,
      isSuperAdmin: p.isSuperAdmin,
      lastSeenAt: p.lastSeenAt ? p.lastSeenAt.toISOString() : null,
      companies: shown.map((m) => ({
        membershipId: m.id,
        id: m.company.id,
        name: m.company.name,
        role: m.role,
      })),
    };
  });

  const companyOptions = plainCompanies.map((c) => ({
    id: c.id,
    name: c.name,
  }));

  return (
    <>
      <style>{`
        .admin-metric { transition: transform .16s ease, box-shadow .16s ease; }
        .admin-metric:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(17,24,39,.08); }
        .admin-row { transition: background-color .12s ease; }
        .admin-row:hover { background: var(--bg); }
        .company-link { color: inherit; text-decoration: none; cursor: pointer; }
        .company-link:hover { text-decoration: underline; }
        .adm-search-btn:hover { background: var(--bg); color: var(--text); }
      `}</style>

      <header style={S.head}>
        <p style={S.eyebrow}>Administration</p>
        <h1 style={S.h1}>{title}</h1>
        <p style={S.sub}>{scope}</p>
      </header>

      <div style={S.stats}>
        {user.isSuperAdmin ? (
          <Stat icon="company" label="Companies" value={companies.length} />
        ) : null}
        <Stat icon="people" label="People" value={people.length} />
        <Stat
          icon="active"
          label="Active accounts"
          value={people.filter((p) => p.isActive).length}
        />
        <Stat
          icon="documents"
          label="Documents"
          value={companies.reduce((sum, c) => sum + c._count.files, 0)}
        />
      </div>

      <section style={S.section}>
        {user.isSuperAdmin ? (
          <div style={S.subtabs}>
            <Link
              href="/admin"
              style={ctab === "active" ? S.subtabOn : S.subtab}
            >
              Active
            </Link>
            <Link
              href="/admin?ctab=trash"
              style={ctab === "trash" ? S.subtabOn : S.subtab}
            >
              Trash
              {deletedCompanies.length > 0
                ? ` (${deletedCompanies.length})`
                : ""}
            </Link>
          </div>
        ) : null}

        {ctab === "trash" && user.isSuperAdmin ? (
          <>
            <div style={S.sectionHead}>
              <h2 style={S.h2}>Companies</h2>
              <span style={S.count}>{deletedCompanies.length}</span>
            </div>

            <div style={S.card}>
              {deletedCompanies.length === 0 ? (
                <div style={S.cardEmpty}>
                  <p style={S.mutedText}>No companies in the trash.</p>
                </div>
              ) : (
                <table style={S.table}>
                  <thead>
                    <tr>
                      <th style={S.th}>Name</th>
                      <th style={S.th}>Domain</th>
                      <th style={S.thNum}>People</th>
                      <th style={S.thNum}>Documents</th>
                      <th style={S.th}>Deleted</th>
                      <th style={S.thRight} />
                    </tr>
                  </thead>
                  <tbody>
                    {deletedCompanies.map((c) => (
                      <tr key={c.id} className="admin-row">
                        <td style={S.td}>
                          <span style={S.orgRow}>
                            <span style={S.orgMarkOff}>
                              {c.name.slice(0, 1).toUpperCase()}
                            </span>
                            {c.name}
                          </span>
                        </td>
                        <td style={S.tdMutedCell}>{c.domain}</td>
                        <td style={S.tdNum}>{c._count.memberships}</td>
                        <td style={S.tdNum}>{c._count.files}</td>
                        <td style={S.tdMutedCell}>
                          {new Date(c.deletedAt).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          })}
                        </td>
                        <td style={S.tdRight}>
                          <CompanyTrashActions companyId={c.id} name={c.name} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        ) : (
          <>
            <CompanyTable
              companies={plainCompanies}
              isSuperAdmin={user.isSuperAdmin}
            />
            {user.isSuperAdmin ? <NewCompany /> : null}
          </>
        )}
      </section>

      <section style={S.section}>
        <PeopleTable
          people={plainPeople}
          allCompanies={companyOptions}
          currentUserId={user.id}
        />

        <NewUser companies={companyOptions} />
      </section>
    </>
  );
}

function Stat({ icon, label, value }) {
  return (
    <div className="admin-metric" style={S.stat}>
      <span style={S.statIcon}>
        <svg
          viewBox="0 0 24 24"
          width="19"
          height="19"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d={ICONS[icon]} />
        </svg>
      </span>
      <div>
        <p style={S.statValue}>{value}</p>
        <p style={S.statLabel}>{label}</p>
      </div>
    </div>
  );
}

const S = {
  head: {
    paddingBottom: 22,
    borderBottom: "1px solid var(--line-soft)",
    marginBottom: 26,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: ".09em",
    textTransform: "uppercase",
    color: "var(--muted)",
    marginBottom: 10,
  },
  h1: {
    fontSize: 30,
    fontWeight: 400,
    letterSpacing: "-0.02em",
    color: "var(--text)",
  },
  sub: { fontSize: 14, color: "var(--muted)", marginTop: 8 },

  stats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 16,
  },
  stat: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
    padding: "22px 22px 20px",
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: "var(--r-card)",
    boxShadow: "0 1px 2px rgba(17,24,39,.04)",
  },
  statIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    background: "var(--accent-soft)",
    color: "var(--accent)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  statValue: {
    fontSize: 32,
    fontWeight: 300,
    lineHeight: 1,
    letterSpacing: "-0.02em",
    fontVariantNumeric: "tabular-nums",
    color: "var(--text)",
  },
  statLabel: { fontSize: 13, color: "var(--muted)", marginTop: 9 },

  section: { marginTop: 34 },
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

  card: {
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: "var(--r-card)",
    boxShadow: "0 1px 2px rgba(17,24,39,.04)",
    overflowX: "auto",
  },
  cardEmpty: { padding: "40px 24px", textAlign: "center" },
  mutedText: { color: "var(--muted)", fontSize: 14 },
  subtabs: { display: "flex", gap: 4, marginBottom: 12 },
  subtab: {
    fontSize: 13,
    color: "var(--muted)",
    textDecoration: "none",
    padding: "6px 12px",
    borderRadius: 999,
  },
  subtabOn: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--accent)",
    background: "var(--accent-soft)",
    textDecoration: "none",
    padding: "6px 12px",
    borderRadius: 999,
  },
  orgMarkOff: {
    width: 30,
    height: 30,
    borderRadius: 9,
    background: "var(--bg)",
    color: "var(--muted)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 600,
  },
  tdMutedCell: {
    padding: "13px 18px",
    borderTop: "1px solid var(--line-soft)",
    fontSize: 13,
    color: "var(--muted)",
    whiteSpace: "nowrap",
  },
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
  thRight: { padding: "15px 18px 13px", width: 48 },
  tdRight: {
    padding: "13px 18px",
    borderTop: "1px solid var(--line-soft)",
    textAlign: "right",
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

  orgRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: 12,
    fontSize: 14,
  },

  empty: {
    padding: "56px 28px",
    background: "var(--bg)",
    borderRadius: "var(--r-card)",
    textAlign: "center",
  },
  muted: { color: "var(--muted)", fontSize: 14 },
};
