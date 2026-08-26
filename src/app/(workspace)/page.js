import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { visibleFilesWhere } from "@/lib/permissions";
import Link from "next/link";

import { FileIcon } from "./files/file-icon";

/**
 * NOTE: these maps mirror the ones in activity/page.js. They had already
 * drifted — several actions were missing here and rendered as raw enum names
 * like FOLDER_DELETED. Kept in sync by hand for now; worth extracting to
 * lib/activity-labels.js if a third page ever needs them.
 */
const LABELS = {
  LOGIN: "signed in",
  LOGIN_FAILED: "failed to sign in",
  LOGOUT: "signed out",
  FILE_UPLOAD: "added",
  FILE_OPEN: "opened",
  FILE_SAVE: "saved",
  FILE_DOWNLOAD: "downloaded",
  FILE_DELETE: "moved to trash",
  FILE_UNDELETE: "restored from trash",
  FILE_PURGE: "permanently deleted",
  FILE_RESTORE: "rolled back",
  FILE_MOVED: "moved",
  EDIT_JOIN: "started editing",
  EDIT_LEAVE: "stopped editing",
  PERMISSION_CHANGE: "changed access to",
  USER_CREATED: "created an account",
  USER_DISABLED: "disabled an account",
  USER_DELETED: "deleted an account",
  USER_ROLE_CHANGED: "changed a role",
  COMPANY_CREATED: "created a company",
  COMPANY_UPDATED: "updated a company",
  COMPANY_DELETED: "deleted a company",
  FOLDER_CREATED: "created a folder",
  FOLDER_DELETED: "deleted a folder",
  PASSWORD_RESET: "reset a password",
};

const TONE = {
  LOGIN_FAILED: "danger",
  FILE_PURGE: "danger",
  USER_DELETED: "danger",
  COMPANY_DELETED: "danger",
  FILE_DELETE: "warn",
  FOLDER_DELETED: "warn",
  PERMISSION_CHANGE: "warn",
  USER_DISABLED: "warn",
  PASSWORD_RESET: "warn",
  COMPANY_UPDATED: "warn",
};

const ICONS = {
  company:
    "M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z",
  people:
    "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z",
  documents:
    "M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z",
  shield:
    "M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-1 15l-4-4 1.41-1.41L11 13.17l4.59-4.58L17 10l-6 6z",
  mine: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
  shared:
    "M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z",
  storage:
    "M12 3C7.58 3 4 4.79 4 7v10c0 2.21 3.58 4 8 4s8-1.79 8-4V7c0-2.21-3.58-4-8-4zm0 2c3.87 0 6 1.5 6 2s-2.13 2-6 2-6-1.5-6-2 2.13-2 6-2zm6 12c0 .5-2.13 2-6 2s-6-1.5-6-2v-2.23C7.61 15.5 9.72 16 12 16s4.39-.5 6-1.23V17zm0-4c0 .5-2.13 2-6 2s-6-1.5-6-2v-2.23C7.61 11.5 9.72 12 12 12s4.39-.5 6-1.23V13z",
  drive:
    "M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z",
  convert:
    "M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z",
  clock:
    "M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z",
};

const AVATAR_TONES = [
  "#4285f4",
  "#0f9d58",
  "#a142f4",
  "#f4b400",
  "#ea4335",
  "#00897b",
];

export default async function DashboardPage() {
  const user = await getCurrentUser();

  const isSuper = user.isSuperAdmin;
  const oversees = user.memberships
    .filter((m) => m.role === "ADMIN" || m.role === "MANAGER")
    .map((m) => m.companyId);
  const isOverseer = isSuper || oversees.length > 0;
  const membershipCompanyIds = user.memberships.map((m) => m.companyId);

  const fileWhere = await visibleFilesWhere(user);
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  let activityWhere;

  if (isSuper) {
    activityWhere = {};
  } else if (oversees.length > 0) {
    activityWhere = { companyId: { in: oversees } };
  } else {
    // Must match the scope in activity/page.js: a regular user sees their own
    // actions, plus what others did to documents THEY created — never what an
    // admin did, on any file. Two places computing this independently is how
    // the old rule survived here after being fixed on the activity page.
    const myCompanyIds = user.memberships.map((m) => m.companyId);

    const privileged = await prisma.user.findMany({
      where: {
        OR: [
          { isSuperAdmin: true },
          {
            memberships: {
              some: {
                companyId: { in: myCompanyIds },
                role: { in: ["ADMIN", "MANAGER"] },
              },
            },
          },
        ],
      },
      select: { id: true },
    });

    const privilegedIds = privileged
      .map((u) => u.id)
      .filter((id) => id !== user.id);

    activityWhere = {
      OR: [
        { userId: user.id },
        {
          AND: [
            { file: { uploadedById: user.id } },
            { userId: { notIn: privilegedIds } },
          ],
        },
      ],
    };
  }

  const scopedPeople = isSuper
    ? {}
    : { memberships: { some: { companyId: { in: oversees } } } };

  const [
    recent,
    docCount,
    mineCount,
    sharedCount,
    activity,
    people,
    companies,
    failedLogins,
    storageAgg,
    companyFileStats,
    overviewCompanies,
  ] = await Promise.all([
    prisma.file.findMany({
      where: fileWhere,
      orderBy: { updatedAt: "desc" },
      take: 6,
      include: { company: true },
    }),
    prisma.file.count({ where: fileWhere }),
    prisma.file.count({ where: { ...fileWhere, uploadedById: user.id } }),
    prisma.permission.count({ where: { userId: user.id, canView: true } }),
    prisma.activity.findMany({
      where: activityWhere,
      orderBy: { createdAt: "desc" },
      take: 7,
      include: {
        user: { select: { id: true, name: true } },
        file: { select: { name: true, extension: true } },
      },
    }),
    isOverseer
      ? prisma.user.count({ where: scopedPeople })
      : Promise.resolve(null),
    isSuper ? prisma.company.count() : Promise.resolve(null),
    isOverseer
      ? prisma.activity.count({
          where: {
            action: "LOGIN_FAILED",
            createdAt: { gte: since },
            ...(isSuper ? {} : { companyId: { in: oversees } }),
          },
        })
      : Promise.resolve(null),
    prisma.file.aggregate({ where: fileWhere, _sum: { size: true } }),
    prisma.file.groupBy({
      by: ["companyId"],
      where: fileWhere,
      _count: { _all: true },
      _sum: { size: true },
    }),
    isSuper
      ? prisma.company.findMany({
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : prisma.company.findMany({
          where: { id: { in: membershipCompanyIds } },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
  ]);

  const firstName = user.name.split(" ")[0];
  const storageBytes = storageAgg._sum.size ?? 0;

  const statsByCompany = new Map(
    companyFileStats.map((g) => [
      g.companyId,
      { files: g._count._all, size: g._sum.size ?? 0 },
    ]),
  );
  const companyRows = overviewCompanies
    .map((c) => ({
      id: c.id,
      name: c.name,
      files: statsByCompany.get(c.id)?.files ?? 0,
      size: statsByCompany.get(c.id)?.size ?? 0,
    }))
    .sort((a, b) => b.files - a.files)
    .slice(0, 8);
  const maxCompanyFiles = Math.max(1, ...companyRows.map((r) => r.files));

  return (
    <>
      <style>{`
        .metric { transition: transform .16s ease, box-shadow .16s ease; }
        .metric:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(17,24,39,.08); }
        .hover-row { transition: background-color .12s ease; }
        .hover-row:hover { background: var(--bg); }
        .quick { transition: background .14s ease, border-color .14s ease, transform .14s ease; }
        .quick:hover { background: var(--accent-soft); border-color: var(--accent); transform: translateY(-1px); }
        .quiet-link:hover { text-decoration: underline; }
      `}</style>

      <header style={S.head}>
        <div style={S.headText}>
          <p style={S.eyebrow}>{today()}</p>
          <h1 style={S.h1}>
            {greeting()}, {firstName}
          </h1>
        </div>

        {/* Somewhere to go next — the dashboard was previously read-only. */}
        <nav style={S.quickRow}>
          <Quick href="/files" icon="drive" label="Open Drive" />
          <Quick href="/convert" icon="convert" label="Convert" />
          <Quick href="/activity" icon="clock" label="Activity" />
          {isOverseer ? (
            <Quick href="/admin" icon="people" label="Admin" />
          ) : null}
        </nav>
      </header>

      <div style={S.stats}>
        {isOverseer ? (
          <>
            {isSuper ? (
              <Stat icon="company" value={companies} label="Companies" />
            ) : null}
            <Stat icon="people" value={people} label="People" />
            <Stat icon="documents" value={docCount} label="Documents" />
            <Stat
              icon="storage"
              value={formatBytes(storageBytes)}
              label="Storage used"
            />
            <Stat
              icon="shield"
              value={failedLogins}
              label="Failed sign-ins this week"
              alert={failedLogins > 0}
            />
          </>
        ) : (
          <>
            <Stat
              icon="documents"
              value={docCount}
              label="Documents you can open"
            />
            <Stat icon="mine" value={mineCount} label="Created by you" />
            <Stat icon="shared" value={sharedCount} label="Shared with you" />
            <Stat
              icon="storage"
              value={formatBytes(storageBytes)}
              label="Storage used"
            />
          </>
        )}
      </div>

      <div style={S.columns}>
        <section style={S.panel}>
          <div style={S.panelHead}>
            <h2 style={S.h2}>Recent documents</h2>
            <Link href="/files" className="quiet-link" style={S.quietLink}>
              Open Drive
            </Link>
          </div>

          {recent.length === 0 ? (
            <Empty
              icon="documents"
              title="No documents yet"
              body="Upload a file or create one from the Drive, and it'll show up here."
              actionHref="/files"
              actionLabel="Go to Drive"
            />
          ) : (
            <ul style={S.list}>
              {recent.map((f) => (
                <li key={f.id}>
                  <Link
                    href={`/edit/${f.id}`}
                    className="hover-row"
                    style={S.fileRow}
                  >
                    <FileIcon extension={f.extension} size={26} />
                    <span style={S.fileText}>
                      <span style={S.fileName}>{f.name}</span>
                      <span style={S.fileMeta}>
                        {f.company.name} · {timeAgo(f.updatedAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section style={S.panel}>
          <div style={S.panelHead}>
            <h2 style={S.h2}>Latest activity</h2>
            <Link href="/activity" className="quiet-link" style={S.quietLink}>
              Full log
            </Link>
          </div>

          {activity.length === 0 ? (
            <Empty
              icon="clock"
              title="Nothing recorded yet"
              body="Sign-ins, edits and downloads all land here as people start using Atlas."
            />
          ) : (
            <ul style={S.list}>
              {activity.map((a) => {
                const tone = TONE[a.action];
                return (
                  <li key={a.id} style={S.actRow}>
                    <span
                      style={{
                        ...S.avatar,
                        background: `${avatarTone(a.user?.id)}1f`,
                        color: avatarTone(a.user?.id),
                      }}
                    >
                      {initials(a.user?.name)}
                    </span>

                    <span style={S.actText}>
                      <span style={S.line}>
                        <span style={S.who}>{a.user?.name ?? "Someone"}</span>{" "}
                        <span
                          style={
                            tone === "danger"
                              ? S.danger
                              : tone === "warn"
                                ? S.warn
                                : S.verb
                          }
                        >
                          {LABELS[a.action] ?? a.action}
                        </span>
                        {a.file ? (
                          <span style={S.fileRef}> {a.file.name}</span>
                        ) : null}
                      </span>
                      <span style={S.fileMeta}>{timeAgo(a.createdAt)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {companyRows.length > 0 ? (
        <section style={{ ...S.panel, marginTop: 16 }}>
          <div style={S.panelHead}>
            <h2 style={S.h2}>Companies</h2>
            <span style={S.muted}>By documents</span>
          </div>

          <div>
            {companyRows.map((c) => (
              <div key={c.id} style={S.coRow}>
                <span style={S.coMark}>{initials(c.name)}</span>
                <div style={S.coMain}>
                  <div style={S.coTop}>
                    <span style={S.coName}>{c.name}</span>
                    <span style={S.coMeta}>
                      {c.files} {c.files === 1 ? "doc" : "docs"} ·{" "}
                      {formatBytes(c.size)}
                    </span>
                  </div>
                  <div style={S.coBarTrack}>
                    <div
                      style={{
                        ...S.coBarFill,
                        // Empty companies still get a sliver, so the row
                        // doesn't look like a rendering failure.
                        width: `${Math.max(2, (c.files / maxCompanyFiles) * 100)}%`,
                        opacity: c.files === 0 ? 0.25 : 1,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function Quick({ href, icon, label }) {
  return (
    <Link href={href} className="quick" style={S.quick}>
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d={ICONS[icon]} />
      </svg>
      {label}
    </Link>
  );
}

function Empty({ icon, title, body, actionHref, actionLabel }) {
  return (
    <div style={S.empty}>
      <span style={S.emptyIcon}>
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d={ICONS[icon]} />
        </svg>
      </span>
      <p style={S.emptyTitle}>{title}</p>
      <p style={S.emptyBody}>{body}</p>
      {actionHref ? (
        <Link href={actionHref} style={S.emptyAction}>
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

function Stat({ icon, value, label, alert }) {
  return (
    <div className="metric" style={S.stat}>
      <span style={{ ...S.statIcon, ...(alert ? S.statIconAlert : null) }}>
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
        <p style={{ ...S.statValue, ...(alert ? S.statValueAlert : null) }}>
          {value ?? 0}
        </p>
        <p style={S.statLabel}>{label}</p>
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function today() {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function initials(name) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** Stable colour per person, so the same face keeps the same tone. */
function avatarTone(id) {
  if (!id) return "#5f6368";
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
  return AVATAR_TONES[sum % AVATAR_TONES.length];
}

function timeAgo(date) {
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

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

const S = {
  head: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 20,
    flexWrap: "wrap",
    paddingBottom: 22,
    borderBottom: "1px solid var(--line-soft)",
    marginBottom: 26,
  },
  headText: { minWidth: 0 },
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

  quickRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  quick: {
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

  stats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 16,
    marginBottom: 24,
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
  statIconAlert: { background: "rgba(234,67,53,.12)", color: "var(--danger)" },
  statValue: {
    fontSize: 32,
    fontWeight: 300,
    lineHeight: 1,
    letterSpacing: "-0.02em",
    fontVariantNumeric: "tabular-nums",
    color: "var(--text)",
  },
  statValueAlert: { color: "var(--danger)" },
  statLabel: { fontSize: 13, color: "var(--muted)", marginTop: 9 },

  columns: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
    gap: 16,
  },
  panel: {
    padding: "22px 24px 24px",
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: "var(--r-card)",
    boxShadow: "0 1px 2px rgba(17,24,39,.04)",
  },
  panelHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  h2: { fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" },
  quietLink: {
    fontSize: 13,
    fontWeight: 500,
    color: "var(--accent)",
    textDecoration: "none",
  },

  list: { listStyle: "none" },

  fileRow: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "11px 12px",
    margin: "0 -12px",
    borderRadius: 10,
    textDecoration: "none",
    color: "var(--text)",
  },
  fileText: { display: "flex", flexDirection: "column", minWidth: 0 },
  fileName: {
    fontSize: 14,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  fileMeta: { fontSize: 12, color: "var(--muted)", marginTop: 3 },

  actRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "12px 0",
    borderTop: "1px solid var(--line-soft)",
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 600,
    flexShrink: 0,
  },
  actText: { display: "flex", flexDirection: "column", minWidth: 0 },
  line: { fontSize: 14, lineHeight: 1.45 },
  who: { fontWeight: 600 },
  verb: { color: "var(--text-2)" },
  warn: { color: "#b06000", fontWeight: 500 },
  danger: { color: "var(--danger)", fontWeight: 500 },
  fileRef: { color: "var(--accent)", fontWeight: 500 },

  muted: { color: "var(--muted)", fontSize: 13 },

  // A first-run dashboard is mostly empty panels — give them something to
  // say and somewhere to go, rather than one grey sentence.
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    padding: "28px 16px 24px",
    background: "var(--bg)",
    borderRadius: "var(--r-card)",
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    background: "var(--panel)",
    border: "1px solid var(--line)",
    color: "var(--muted)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  emptyTitle: { fontSize: 14, fontWeight: 600, color: "var(--text)" },
  emptyBody: {
    fontSize: 13,
    color: "var(--muted)",
    marginTop: 5,
    lineHeight: 1.5,
    maxWidth: 300,
  },
  emptyAction: {
    marginTop: 14,
    padding: "8px 16px",
    fontSize: 13,
    fontWeight: 500,
    background: "var(--accent)",
    color: "#fff",
    borderRadius: 8,
    textDecoration: "none",
  },

  coRow: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "13px 0",
    borderTop: "1px solid var(--line-soft)",
  },
  coMark: {
    width: 34,
    height: 34,
    borderRadius: 9,
    background: "var(--accent-soft)",
    color: "var(--accent)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 600,
    flexShrink: 0,
  },
  coMain: { flex: 1, minWidth: 0 },
  coTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 12,
    marginBottom: 8,
  },
  coName: {
    fontSize: 14,
    fontWeight: 500,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  coMeta: {
    fontSize: 12,
    color: "var(--muted)",
    whiteSpace: "nowrap",
    flexShrink: 0,
    fontVariantNumeric: "tabular-nums",
  },
  coBarTrack: {
    height: 6,
    borderRadius: 999,
    background: "var(--bg)",
    overflow: "hidden",
  },
  coBarFill: {
    height: "100%",
    borderRadius: 999,
    background: "var(--accent)",
    transition: "width .3s ease",
  },
};
