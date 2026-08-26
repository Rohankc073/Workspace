import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { FileIcon } from "../files/file-icon";

const ROLE_LABELS = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  EDITOR: "Editor",
  VIEWER: "Viewer",
};

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
  FILE_RESTORE: "rolled back a version of",
  FILE_MOVED: "moved",
  EDIT_JOIN: "started editing",
  EDIT_LEAVE: "stopped editing",
  PERMISSION_CHANGE: "changed access to",
  USER_CREATED: "created an account",
  USER_DISABLED: "disabled an account",
  USER_DELETED: "deleted an account",
  COMPANY_CREATED: "created the company",
  USER_ROLE_CHANGED: "changed a role",
  FOLDER_CREATED: "created a folder",
  FOLDER_DELETED: "deleted a folder",
  PASSWORD_RESET: "reset a password",
  COMPANY_UPDATED: "updated the company",
  COMPANY_DELETED: "deleted the company",
};

/** Events that deserve a colour, so the eye finds them in a long list. */
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

const AVATAR_TONES = [
  "#4285f4",
  "#0f9d58",
  "#a142f4",
  "#f4b400",
  "#ea4335",
  "#00897b",
];

/** A short, human device label from a user-agent string. */
function deviceFromUA(ua) {
  if (!ua) return null;
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS X|Macintosh/.test(ua)
      ? "macOS"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad|iOS/.test(ua)
          ? "iOS"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser || os || null;
}

const roleLabel = (r) => ROLE_LABELS[r] ?? r;

/**
 * Turns one activity row into a richer sentence: the verb, an optional target
 * (the company or account it acted on), and an optional secondary detail line.
 * Everything reads from `detail`, so it degrades gracefully — if a field isn't
 * there, we simply fall back to the plain verb.
 */
function describe(r) {
  const d = r.detail || {};
  const verb = LABELS[r.action] ?? r.action;

  switch (r.action) {
    case "COMPANY_CREATED":
      return {
        verb,
        target: d.name || r.company?.name || null,
        secondary: d.adminEmail ? `First admin: ${d.adminEmail}` : null,
      };

    case "COMPANY_UPDATED": {
      const target = d.name || r.company?.name || null;
      const renamed = d.prevName && d.name && d.prevName !== d.name;
      const domainMoved = d.prevDomain && d.domain && d.prevDomain !== d.domain;
      let secondary = null;
      if (renamed && domainMoved)
        secondary = `Renamed from ${d.prevName} · domain ${d.prevDomain} → ${d.domain}`;
      else if (renamed) secondary = `Renamed from ${d.prevName}`;
      else if (domainMoved) secondary = `Domain ${d.prevDomain} → ${d.domain}`;
      return { verb, target, secondary };
    }

    case "COMPANY_DELETED":
      return {
        verb,
        target: d.name || r.company?.name || null,
        secondary: d.domain || null,
      };

    case "USER_CREATED":
      return {
        verb,
        target: d.email || d.name || null,
        secondary: d.role ? roleLabel(d.role) : null,
      };

    case "USER_DISABLED":
      return {
        verb: d.enabled ? "enabled an account" : verb,
        target: d.email || d.name || null,
        secondary: null,
      };

    case "USER_DELETED":
    case "PASSWORD_RESET":
      return { verb, target: d.email || d.name || null, secondary: null };

    case "USER_ROLE_CHANGED":
      return {
        verb,
        target: d.email || d.name || null,
        secondary: d.role
          ? `Now ${roleLabel(d.role)}${d.companyName ? ` in ${d.companyName}` : ""}`
          : null,
      };

    case "LOGIN":
    case "LOGOUT":
    case "LOGIN_FAILED":
      return { verb, target: null, secondary: deviceFromUA(r.userAgent) };

    default:
      return { verb, target: null, secondary: null };
  }
}

export default async function ActivityPage() {
  const user = await getCurrentUser();

  const oversees = user.memberships
    .filter((m) => m.role === "ADMIN" || m.role === "MANAGER")
    .map((m) => m.companyId);

  let where;
  let scope;

  if (user.isSuperAdmin) {
    where = {};
    scope = "Everything across every company.";
  } else if (oversees.length > 0) {
    where = {
      OR: [
        { companyId: { in: oversees } },
        {
          companyId: null,
          user: { memberships: { some: { companyId: { in: oversees } } } },
        },
      ],
    };
    scope = "Everything in the companies you manage.";
  } else {
    // A regular user sees their own actions, plus what other people did to
    // documents THEY created — but never what an admin did, on any file.
    //
    // "Admin" here means a super admin, or anyone holding ADMIN/MANAGER in a
    // company this person belongs to. Their own row is excluded from that
    // list, so a user always sees themselves even if they hold a role
    // somewhere that isn't reflected in `oversees`.
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

    where = {
      OR: [
        { userId: user.id },
        {
          AND: [
            // Files this person uploaded — not merely ones they can open.
            { file: { uploadedById: user.id } },
            { userId: { notIn: privilegedIds } },
          ],
        },
      ],
    };
    scope =
      "Your own actions, and what others have done with documents you created.";
  }

  const rows = await prisma.activity.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      user: { select: { id: true, name: true } },
      file: { select: { name: true, extension: true } },
      company: { select: { name: true } },
    },
  });

  // The IP column is deliberately not shown. Behind the Hyper-V switch every
  // request arrives from the same gateway address, so it looked like data but
  // told you nothing. logActivity() still records it — once a reverse proxy
  // sets x-forwarded-for, the stored value becomes real and can be surfaced.

  // Group by day so a long list reads as a timeline rather than a wall.
  const days = [];
  for (const r of rows) {
    const key = r.createdAt.toDateString();
    const last = days[days.length - 1];
    if (last && last.key === key) last.rows.push(r);
    else days.push({ key, date: r.createdAt, rows: [r] });
  }

  return (
    <>
      <style>{`
        .act-row { transition: background-color .12s ease; }
        .act-row:hover { background: var(--bg); }
      `}</style>

      <header style={S.head}>
        <p style={S.eyebrow}>Audit log</p>
        <h1 style={S.h1}>Activity</h1>
        <p style={S.sub}>{scope}</p>
      </header>

      {rows.length === 0 ? (
        <div style={S.empty}>
          <p style={S.muted}>Nothing recorded yet.</p>
        </div>
      ) : (
        <div style={S.wrap}>
          {days.map((day) => (
            <section key={day.key}>
              <div style={S.dayHead}>
                <p style={S.dayLabel}>{dayName(day.date)}</p>
                <span style={S.dayRule} />
                <span style={S.dayCount}>
                  {day.rows.length} {day.rows.length === 1 ? "event" : "events"}
                </span>
              </div>

              <div style={S.card}>
                {day.rows.map((r, i) => {
                  const tone = TONE[r.action];
                  const { verb, target, secondary } = describe(r);
                  const isCompanyAction = r.action.startsWith("COMPANY_");
                  const verbStyle =
                    tone === "danger"
                      ? S.danger
                      : tone === "warn"
                        ? S.warn
                        : S.verb;

                  // A coloured spine on notable rows — scannable without
                  // shouting, and it survives a long list better than colour
                  // on the verb alone.
                  const spine =
                    tone === "danger"
                      ? S.rowDanger
                      : tone === "warn"
                        ? S.rowWarn
                        : S.rowPlain;

                  return (
                    <div
                      key={r.id}
                      className="act-row"
                      style={
                        i === 0
                          ? { ...S.row, ...spine }
                          : {
                              ...S.row,
                              ...spine,
                              borderTop: "1px solid var(--line-soft)",
                            }
                      }
                    >
                      <span
                        style={{
                          ...S.avatar,
                          background: `${avatarTone(r.user?.id)}1f`,
                          color: avatarTone(r.user?.id),
                        }}
                      >
                        {initials(r.user?.name)}
                      </span>

                      <span style={S.body}>
                        <span style={S.text}>
                          <span style={S.who}>{r.user?.name ?? "Someone"}</span>{" "}
                          <span style={verbStyle}>{verb}</span>
                          {target ? (
                            <span style={S.target}>{target}</span>
                          ) : null}
                          {r.file ? (
                            <span style={S.fileWrap}>
                              <FileIcon
                                extension={r.file.extension}
                                size={16}
                              />
                              <span style={S.fileName}>{r.file.name}</span>
                            </span>
                          ) : null}
                        </span>
                        {secondary ? (
                          <span style={S.secondary}>{secondary}</span>
                        ) : null}
                      </span>

                      {r.company && !isCompanyAction ? (
                        <span style={S.company}>{r.company.name}</span>
                      ) : null}
                      <span style={S.time}>{clock(r.createdAt)}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
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

function dayName(date) {
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function clock(date) {
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
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

  wrap: { display: "flex", flexDirection: "column", gap: 28 },
  dayHead: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
    paddingLeft: 2,
  },
  dayLabel: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: ".06em",
    textTransform: "uppercase",
    color: "var(--muted)",
    whiteSpace: "nowrap",
  },
  // A hairline that fills the gap between the label and the count, so the
  // day header reads as a divider rather than two floating scraps of text.
  dayRule: { flex: 1, height: 1, background: "var(--line-soft)" },
  dayCount: {
    fontSize: 11,
    fontWeight: 500,
    color: "var(--muted)",
    background: "var(--bg)",
    padding: "2px 8px",
    borderRadius: 999,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  card: {
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: "var(--r-card)",
    boxShadow: "0 1px 2px rgba(17,24,39,.04)",
    overflow: "hidden",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "14px 18px",
    fontSize: 14,
  },
  // Transparent spine keeps the text baseline identical across all rows.
  rowPlain: { borderLeft: "3px solid transparent" },
  rowWarn: { borderLeft: "3px solid #f4b400" },
  rowDanger: { borderLeft: "3px solid var(--danger)" },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 600,
    flexShrink: 0,
  },
  body: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 3,
  },
  text: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  who: { fontWeight: 600 },
  verb: { color: "var(--text-2)" },
  warn: { color: "#b06000", fontWeight: 500 },
  danger: { color: "var(--danger)", fontWeight: 500 },
  target: { fontWeight: 600, color: "var(--text)" },
  secondary: {
    fontSize: 12.5,
    color: "var(--muted)",
    lineHeight: 1.4,
  },
  fileWrap: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  fileName: {
    color: "var(--accent)",
    fontWeight: 500,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: 280,
  },
  company: {
    fontSize: 12,
    color: "var(--text-2)",
    background: "var(--bg)",
    padding: "3px 10px",
    borderRadius: 999,
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  time: {
    fontSize: 13,
    color: "var(--muted)",
    whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums",
    flexShrink: 0,
    minWidth: 64,
    textAlign: "right",
  },

  empty: {
    padding: "56px 28px",
    background: "var(--bg)",
    borderRadius: "var(--r-card)",
    textAlign: "center",
  },
  muted: { color: "var(--muted)", fontSize: 14 },
};
