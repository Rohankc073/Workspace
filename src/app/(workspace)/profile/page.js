import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import PasswordForm from "./password-form";

const ROLE_LABELS = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  EDITOR: "Editor",
  VIEWER: "Viewer",
};

/** What each role actually lets you do, in plain terms. */
const ROLE_NOTES = {
  ADMIN: "Manage people, documents and settings in this company.",
  MANAGER: "Manage every document in this company.",
  EDITOR: "Create and edit documents, and share your own.",
  VIEWER: "Open documents shared with you.",
};

const ICONS = {
  documents:
    "M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z",
  shared:
    "M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z",
  storage:
    "M12 3C7.58 3 4 4.79 4 7v10c0 2.21 3.58 4 8 4s8-1.79 8-4V7c0-2.21-3.58-4-8-4zm0 2c3.87 0 6 1.5 6 2s-2.13 2-6 2-6-1.5-6-2 2.13-2 6-2zm6 12c0 .5-2.13 2-6 2s-6-1.5-6-2v-2.23C7.61 15.5 9.72 16 12 16s4.39-.5 6-1.23V17zm0-4c0 .5-2.13 2-6 2s-6-1.5-6-2v-2.23C7.61 11.5 9.72 12 12 12s4.39-.5 6-1.23V13z",
  folder:
    "M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z",
};

const TONES = {
  blue: { bg: "rgba(26,115,232,.10)", fg: "#1a73e8" },
  green: { bg: "rgba(15,157,88,.10)", fg: "#0f9d58" },
  purple: { bg: "rgba(161,66,244,.10)", fg: "#a142f4" },
  amber: { bg: "rgba(244,180,0,.14)", fg: "#b06000" },
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

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default async function ProfilePage() {
  const user = await getCurrentUser();

  const [memberships, myFiles, myFolders, sharedWithMe, storageAgg] =
    await Promise.all([
      prisma.membership.findMany({
        where: { userId: user.id },
        include: {
          company: { select: { id: true, name: true, domain: true } },
        },
      }),
      prisma.file.count({ where: { uploadedById: user.id, deletedAt: null } }),
      prisma.folder.count({ where: { createdById: user.id, deletedAt: null } }),
      prisma.permission.count({ where: { userId: user.id, canView: true } }),
      prisma.file.aggregate({
        where: { uploadedById: user.id, deletedAt: null },
        _sum: { size: true },
      }),
    ]);

  const storageBytes = storageAgg._sum.size ?? 0;

  const companies = memberships
    .map((m) => ({
      id: m.company.id,
      name: m.company.name,
      domain: m.company.domain,
      role: m.role,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <style>{`
        .pr-metric { transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease; }
        .pr-metric:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(17,24,39,.08);
          border-color: var(--line);
        }
      `}</style>

      <header style={S.hero}>
        <span style={S.bigAvatar}>{initials(user.name)}</span>
        <div style={S.heroText}>
          <p style={S.eyebrow}>Your account</p>
          <h1 style={S.h1}>{user.name}</h1>
          <p style={S.email}>{user.email}</p>
          {user.isSuperAdmin ? (
            <span style={S.superTag}>Super admin</span>
          ) : null}
        </div>
      </header>

      <div style={S.stats}>
        <Stat
          icon="documents"
          tone="blue"
          value={myFiles}
          label="Documents created"
        />
        <Stat
          icon="folder"
          tone="green"
          value={myFolders}
          label="Folders created"
        />
        <Stat
          icon="shared"
          tone="amber"
          value={sharedWithMe}
          label="Shared with you"
        />
        <Stat
          icon="storage"
          tone="purple"
          value={formatBytes(storageBytes)}
          label="Storage used by your files"
        />
      </div>

      <div style={S.columns}>
        <section style={S.panel}>
          <div style={S.panelHead}>
            <h2 style={S.h2}>Companies</h2>
            <span style={S.count}>
              {user.isSuperAdmin && companies.length === 0
                ? "All"
                : companies.length}
            </span>
          </div>

          {companies.length === 0 ? (
            user.isSuperAdmin ? (
              /* A super admin holds no memberships by design — that IS the
                 role. Telling them to ask an administrator to add them is
                 both wrong and slightly absurd, since they are one. */
              <p style={S.muted}>
                Super admins aren’t members of individual companies — you have
                full access to every one of them.
              </p>
            ) : (
              <p style={S.muted}>
                You aren’t in any company yet. An administrator can add you.
              </p>
            )
          ) : (
            <div>
              {companies.map((c) => (
                <div key={c.id} style={S.coRow}>
                  <span style={S.coMark}>
                    {c.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div style={S.coMain}>
                    <p style={S.coName}>{c.name}</p>
                    <p style={S.coDomain}>{c.domain}</p>
                    <p style={S.coNote}>{ROLE_NOTES[c.role] ?? ""}</p>
                  </div>
                  <span style={S.roleTag}>{ROLE_LABELS[c.role] ?? c.role}</span>
                </div>
              ))}
            </div>
          )}

          <div style={S.factRow}>
            <span style={S.factLabel}>Account created</span>
            <span style={S.factValue}>{fmtDate(user.createdAt)}</span>
          </div>
          {user.lastSeenAt ? (
            <div style={S.factRow}>
              <span style={S.factLabel}>Last seen</span>
              <span style={S.factValue}>{fmtDate(user.lastSeenAt)}</span>
            </div>
          ) : null}
        </section>

        <section style={S.panel}>
          <div style={S.panelHead}>
            <h2 style={S.h2}>Change password</h2>
          </div>
          <PasswordForm />
        </section>
      </div>
    </>
  );
}

function Stat({ icon, tone = "blue", value, label }) {
  const t = TONES[tone] ?? TONES.blue;
  return (
    <div className="pr-metric" style={S.stat}>
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
    </div>
  );
}

const S = {
  hero: {
    display: "flex",
    alignItems: "center",
    gap: 20,
    padding: "26px 28px",
    marginBottom: 20,
    borderRadius: 16,
    background:
      "linear-gradient(135deg, var(--accent-soft) 0%, rgba(161,66,244,.07) 55%, transparent 100%)",
    border: "1px solid var(--line-soft)",
    flexWrap: "wrap",
  },
  bigAvatar: {
    width: 64,
    height: 64,
    borderRadius: 999,
    background: "var(--panel)",
    border: "1px solid var(--line)",
    color: "var(--accent)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 22,
    fontWeight: 600,
    flexShrink: 0,
  },
  heroText: { minWidth: 0 },
  eyebrow: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: ".09em",
    textTransform: "uppercase",
    color: "var(--muted)",
    marginBottom: 8,
  },
  h1: {
    fontSize: 28,
    fontWeight: 400,
    letterSpacing: "-0.02em",
    color: "var(--text)",
  },
  email: { fontSize: 14, color: "var(--muted)", marginTop: 6 },
  superTag: {
    display: "inline-block",
    marginTop: 10,
    fontSize: 11,
    fontWeight: 600,
    color: "var(--accent)",
    background: "var(--panel)",
    border: "1px solid var(--accent)",
    borderRadius: 999,
    padding: "3px 10px",
  },

  stats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 14,
    marginBottom: 16,
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

  columns: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))",
    gap: 16,
    alignItems: "start",
  },
  panel: {
    padding: "20px 22px 22px",
    background: "var(--panel)",
    border: "1px solid var(--line-soft)",
    borderRadius: 14,
    boxShadow: "0 1px 2px rgba(17,24,39,.04)",
  },
  panelHead: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
    paddingBottom: 12,
    borderBottom: "1px solid var(--line-soft)",
  },
  h2: { fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" },
  count: {
    fontSize: 12,
    fontWeight: 500,
    color: "var(--muted)",
    background: "var(--bg)",
    padding: "2px 9px",
    borderRadius: 999,
  },
  muted: { color: "var(--muted)", fontSize: 13, lineHeight: 1.5 },

  coRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 14,
    padding: "14px 0",
    borderBottom: "1px solid var(--line-soft)",
  },
  coMark: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: "var(--accent-soft)",
    color: "var(--accent)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    fontWeight: 600,
    flexShrink: 0,
  },
  coMain: { flex: 1, minWidth: 0 },
  coName: { fontSize: 14, fontWeight: 600 },
  coDomain: { fontSize: 12.5, color: "var(--muted)", marginTop: 2 },
  // Roles mean nothing on their own — say what each one actually allows.
  coNote: {
    fontSize: 12.5,
    color: "var(--text-2)",
    marginTop: 6,
    lineHeight: 1.45,
  },
  roleTag: {
    fontSize: 12,
    fontWeight: 500,
    color: "var(--text-2)",
    background: "var(--bg)",
    borderRadius: 999,
    padding: "4px 11px",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },

  factRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "11px 0",
    borderBottom: "1px solid var(--line-soft)",
    fontSize: 13,
  },
  factLabel: { color: "var(--muted)" },
  factValue: { color: "var(--text-2)", fontWeight: 500 },
};
