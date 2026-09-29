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
  storage:
    "M12 3C7.58 3 4 4.79 4 7v10c0 2.21 3.58 4 8 4s8-1.79 8-4V7c0-2.21-3.58-4-8-4zm0 2c3.87 0 6 1.5 6 2s-2.13 2-6 2-6-1.5-6-2 2.13-2 6-2zm6 12c0 .5-2.13 2-6 2s-6-1.5-6-2v-2.23C7.61 15.5 9.72 16 12 16s4.39-.5 6-1.23V17zm0-4c0 .5-2.13 2-6 2s-6-1.5-6-2v-2.23C7.61 11.5 9.72 12 12 12s4.39-.5 6-1.23V13z",
  archive:
    "M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.89 2 2 2h14c1.11 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z",
};

/** Icon tint per stat, so a row of identical blue chips reads as four things. */
const TONES = {
  blue: { bg: "rgba(26,115,232,.10)", fg: "#1a73e8" },
  green: { bg: "rgba(15,157,88,.10)", fg: "#0f9d58" },
  purple: { bg: "rgba(161,66,244,.10)", fg: "#a142f4" },
  amber: { bg: "rgba(244,180,0,.14)", fg: "#b06000" },
};

function formatBytes(n) {
  if (!n) return "0 KB";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const val = i === 0 || v >= 100 ? Math.round(v) : v.toFixed(1);
  return `${val} ${units[i]}`;
}

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

  // The archive is a Company row, but not a company anyone belongs to. It is
  // excluded from every list here: it has no members, no domain worth
  // showing, and it must never appear in a picker that could add someone to
  // it. Its contents live at /admin/archive instead.
  const companyFilter = user.isSuperAdmin
    ? { isArchive: false }
    : { id: { in: adminOf }, isArchive: false };

  const userFilter = user.isSuperAdmin
    ? {}
    : { memberships: { some: { companyId: { in: adminOf } } } };

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const scopedFiles = user.isSuperAdmin
    ? { deletedAt: null, company: { isArchive: false } }
    : { deletedAt: null, companyId: { in: adminOf } };

  const [
    companies,
    people,
    deletedCompanies,
    weekFiles,
    storageAgg,
    archiveCount,
  ] = await Promise.all([
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
          where: { deletedAt: { not: null }, isArchive: false },
          orderBy: { deletedAt: "desc" },
          include: { _count: { select: { memberships: true, files: true } } },
        })
      : Promise.resolve([]),
    // Context for the document count — a total on its own says nothing
    // about whether the system is being used.
    prisma.file.count({
      where: { ...scopedFiles, createdAt: { gte: since } },
    }),
    prisma.file.aggregate({ where: scopedFiles, _sum: { size: true } }),
    user.isSuperAdmin
      ? prisma.file.count({
          where: { deletedAt: null, company: { isArchive: true } },
        })
      : Promise.resolve(0),
  ]);

  const title = user.isSuperAdmin
    ? "All companies"
    : (companies[0]?.name ?? "Administration");
  const scope = user.isSuperAdmin
    ? "Every company in the group."
    : "You manage this company only.";

  const activeCount = people.filter((p) => p.isActive).length;
  const disabledCount = people.length - activeCount;
  const docCount = companies.reduce((sum, c) => sum + c._count.files, 0);
  const storageBytes = storageAgg._sum.size ?? 0;

  // Flatten to plain objects — the tables are client components, so anything
  // crossing that boundary has to be serialisable (no Prisma models, no Dates).
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
    // NewUser builds the address in front of you — without this the suffix
    // reads a literal "@domain" instead of the company's own.
    domain: c.domain,
  }));

  return (
    <>
      <style>{`
        .admin-metric { transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease; }
        .admin-metric:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(17,24,39,.08);
          border-color: var(--line);
        }
        .admin-row { transition: background-color .12s ease; }
        .admin-row:hover { background: var(--bg); }
        .company-link { color: inherit; text-decoration: none; cursor: pointer; }
        .company-link:hover { text-decoration: underline; }
        .adm-search-btn:hover { background: var(--bg); color: var(--text); }
        .adm-subtab:hover { color: var(--text); }
        .adm-archive-link { transition: background .14s ease, border-color .14s ease; }
        .adm-archive-link:hover { background: var(--accent-soft); border-color: var(--accent); }
      `}</style>

      {/* A tinted band, so the title has somewhere to sit rather than
          floating in white above a hairline. */}
      <header style={S.hero}>
        <div style={S.heroText}>
          <p style={S.eyebrow}>Administration</p>
          <h1 style={S.h1}>{title}</h1>
          <p style={S.sub}>{scope}</p>
        </div>

        {/* The archive has no other way in — it isn't in the sidebar and it
            isn't a company in any list. */}
        {user.isSuperAdmin ? (
          <Link
            href="/admin/archive"
            className="adm-archive-link"
            style={S.archiveLink}
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d={ICONS.archive} />
            </svg>
            Archive
            {archiveCount > 0 ? (
              <span style={S.archiveCount}>{archiveCount}</span>
            ) : null}
          </Link>
        ) : null}
      </header>

      <div style={S.stats}>
        {user.isSuperAdmin ? (
          <Stat
            icon="company"
            tone="purple"
            label="Companies"
            value={companies.length}
          />
        ) : null}
        <Stat
          icon="people"
          tone="green"
          label="People"
          value={people.length}
          note={disabledCount > 0 ? `${disabledCount} disabled` : "All active"}
        />
        <Stat
          icon="documents"
          tone="blue"
          label="Documents"
          value={docCount}
          note={
            weekFiles > 0
              ? `${weekFiles} added this week`
              : "None added this week"
          }
        />
        <Stat
          icon="storage"
          tone="amber"
          label="Storage used"
          value={formatBytes(storageBytes)}
        />
      </div>

      <section style={S.section}>
        {user.isSuperAdmin ? (
          <div style={S.subtabs}>
            <Link
              href="/admin"
              className="adm-subtab"
              style={ctab === "active" ? S.subtabOn : S.subtab}
            >
              Active
            </Link>
            <Link
              href="/admin?ctab=trash"
              className="adm-subtab"
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
                          {/* companies feeds the "move the documents to
                              another company" option in the purge dialog. */}
                          <CompanyTrashActions
                            companyId={c.id}
                            name={c.name}
                            companies={companyOptions}
                          />
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

function Stat({ icon, tone = "blue", value, label, note }) {
  const t = TONES[tone] ?? TONES.blue;
  return (
    <div className="admin-metric" style={S.stat}>
      {/* Icon and number on one line: stacked, each card was tall and
          mostly empty space. */}
      <div style={S.statTop}>
        <span style={{ ...S.statIcon, background: t.bg, color: t.fg }}>
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d={ICONS[icon]} />
          </svg>
        </span>
        <p style={S.statValue}>{value ?? 0}</p>
      </div>
      <p style={S.statLabel}>{label}</p>
      {note ? <p style={S.statNote}>{note}</p> : null}
    </div>
  );
}

const S = {
  hero: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 20,
    flexWrap: "wrap",
    padding: "26px 28px",
    marginBottom: 20,
    borderRadius: 16,
    background:
      "linear-gradient(135deg, var(--accent-soft) 0%, rgba(161,66,244,.07) 55%, transparent 100%)",
    border: "1px solid var(--line-soft)",
  },
  heroText: { minWidth: 0 },
  archiveLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    height: 38,
    padding: "0 16px",
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 999,
    color: "var(--text-2)",
    fontSize: 13.5,
    fontWeight: 500,
    textDecoration: "none",
    whiteSpace: "nowrap",
  },
  archiveCount: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--muted)",
    background: "var(--bg)",
    borderRadius: 999,
    padding: "1px 7px",
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
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 14,
  },
  stat: {
    padding: "18px 20px 16px",
    background: "var(--panel)",
    border: "1px solid var(--line-soft)",
    borderRadius: 14,
    boxShadow: "0 1px 2px rgba(17,24,39,.04)",
  },
  statTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 400,
    lineHeight: 1,
    letterSpacing: "-0.02em",
    fontVariantNumeric: "tabular-nums",
    color: "var(--text)",
  },
  statLabel: { fontSize: 13, color: "var(--text-2)", fontWeight: 500 },
  statNote: { fontSize: 12, color: "var(--muted)", marginTop: 4 },

  section: { marginTop: 30 },
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
    border: "1px solid var(--line-soft)",
    borderRadius: 14,
    boxShadow: "0 1px 2px rgba(17,24,39,.04)",
    overflowX: "auto",
  },
  cardEmpty: { padding: "40px 24px", textAlign: "center" },
  mutedText: { color: "var(--muted)", fontSize: 14 },
  subtabs: { display: "flex", gap: 4, marginBottom: 14 },
  subtab: {
    fontSize: 13,
    color: "var(--muted)",
    textDecoration: "none",
    padding: "7px 14px",
    borderRadius: 999,
    transition: "color .14s ease",
  },
  subtabOn: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--accent)",
    background: "var(--accent-soft)",
    textDecoration: "none",
    padding: "7px 14px",
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
