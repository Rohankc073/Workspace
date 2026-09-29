import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { FileIcon } from "../files/file-icon";
import ActivitySearch from "./activity-search";

const ROLE_LABELS = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  EDITOR: "Editor",
  VIEWER: "Viewer",
};

/**
 * Events per page.
 *
 * This used to be `take: 200` with nothing behind it — the log grew forever
 * but only the most recent 200 entries were ever reachable, which is a real
 * gap in something called an audit log. Paging means the whole history is
 * available, and each page stays small: Activity is the fastest-growing
 * table here by a wide margin.
 */
const PAGE_SIZE = 50;

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

/**
 * Groups for the event-type filter. Must match CATS in activity-search.js.
 * Anything not listed stays out of the narrower views rather than being
 * silently lumped in somewhere wrong.
 */
const CATEGORIES = {
  documents: [
    "FILE_UPLOAD",
    "FILE_OPEN",
    "FILE_SAVE",
    "FILE_DOWNLOAD",
    "FILE_DELETE",
    "FILE_UNDELETE",
    "FILE_PURGE",
    "FILE_RESTORE",
    "FILE_MOVED",
    "EDIT_JOIN",
    "EDIT_LEAVE",
    "FOLDER_CREATED",
    "FOLDER_DELETED",
  ],
  sharing: ["PERMISSION_CHANGE"],
  signins: ["LOGIN", "LOGOUT", "LOGIN_FAILED"],
  admin: [
    "USER_CREATED",
    "USER_DISABLED",
    "USER_DELETED",
    "USER_ROLE_CHANGED",
    "PASSWORD_RESET",
    "COMPANY_CREATED",
    "COMPANY_UPDATED",
    "COMPANY_DELETED",
  ],
};

/** Reads better in a sentence than the raw preset keys. */
const EXPIRY_WORDS = {
  "30m": "expires in 30 min",
  "1h": "expires in 1 hour",
  "1d": "expires in 1 day",
  "7d": "expires in 7 days",
  never: "never expires",
};

const LEVEL_WORDS = {
  viewer: "can view",
  commenter: "can comment",
  editor: "can edit",
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
      return {
        verb: d.self ? "changed their own password" : verb,
        target: d.self ? null : d.email || d.name || null,
        secondary: null,
      };

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

    /**
     * PERMISSION_CHANGE covers four different things: sharing with a
     * colleague, revoking that, minting an outside link, and transferring
     * ownership. `target` renders BEFORE the filename, so people go in the
     * secondary line — otherwise it reads "Rohan shared Priya report.docx".
     */
    case "PERMISSION_CHANGE": {
      if (d.transfer) {
        const parts = [];
        if (d.files)
          parts.push(`${d.files} ${d.files === 1 ? "file" : "files"}`);
        if (d.folders)
          parts.push(`${d.folders} ${d.folders === 1 ? "folder" : "folders"}`);
        return {
          verb: "transferred files",
          target: null,
          secondary:
            `${parts.join(" and ") || "Nothing"} from ${d.fromName ?? "someone"}` +
            ` to ${d.toName ?? "someone"}`,
        };
      }

      if (d.shareLink) {
        if (d.revoked) {
          return {
            verb: "revoked an outside link to",
            target: null,
            secondary: null,
          };
        }
        const bits = [d.canEdit ? "Can edit" : "View only"];
        bits.push(
          d.permanent
            ? "never expires"
            : (EXPIRY_WORDS[d.expiresIn] ?? "expires"),
        );
        if (d.hasPassword) bits.push("password");
        return {
          verb: "created an outside link to",
          target: null,
          secondary: bits.join(" · "),
        };
      }

      if (d.grantedTo || d.grantedToName) {
        const who = d.grantedToName ?? "someone";
        return {
          verb: d.updated ? "changed access to" : "shared",
          target: null,
          secondary: `${who}${d.level ? ` — ${LEVEL_WORDS[d.level] ?? d.level}` : ""}`,
        };
      }

      if (d.removed || d.removedFromName) {
        return {
          verb: "removed access to",
          target: null,
          secondary: d.removedFromName
            ? `${d.removedFromName} can no longer open it`
            : null,
        };
      }

      return { verb, target: null, secondary: null };
    }

    default:
      return { verb, target: null, secondary: null };
  }
}

export default async function ActivityPage({ searchParams }) {
  const params = await searchParams;
  const q = (params?.q ?? "").trim();
  const cat = CATEGORIES[params?.cat] ? params.cat : "all";
  // Anything unparseable is page 1 rather than an error.
  const requestedPage = Math.max(1, Number(params?.page) || 1);

  const user = await getCurrentUser();

  const oversees = user.memberships
    .filter((m) => m.role === "ADMIN" || m.role === "MANAGER")
    .map((m) => m.companyId);

  let scope;
  let scopeText;

  if (user.isSuperAdmin) {
    scope = {};
    scopeText = "Everything across every company.";
  } else if (oversees.length > 0) {
    scope = {
      OR: [
        { companyId: { in: oversees } },
        {
          companyId: null,
          user: { memberships: { some: { companyId: { in: oversees } } } },
        },
      ],
    };
    scopeText = "Everything in the companies you manage.";
  } else {
    // A regular user sees their own actions, plus what other people did to
    // documents THEY created — but never what an admin did, on any file.
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

    scope = {
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
    scopeText =
      "Your own actions, and what others have done with documents you created.";
  }

  // Filters are ANDed onto the scope: they can only narrow what someone is
  // allowed to see, never widen it.
  const and = [scope];

  if (cat !== "all") {
    and.push({ action: { in: CATEGORIES[cat] } });
  }

  if (q) {
    // Searching the log means searching who, what and where — the action
    // names themselves are internal enum strings and not worth matching.
    and.push({
      OR: [
        { user: { name: { contains: q, mode: "insensitive" } } },
        { user: { email: { contains: q, mode: "insensitive" } } },
        { file: { name: { contains: q, mode: "insensitive" } } },
        { company: { name: { contains: q, mode: "insensitive" } } },
      ],
    });
  }

  const where = { AND: and };

  const total = await prisma.activity.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // A page past the end — a bookmark, or a filter that has since narrowed —
  // lands on the last real page rather than showing an empty list.
  const page = Math.min(requestedPage, totalPages);
  const skip = (page - 1) * PAGE_SIZE;

  const rows = await prisma.activity.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip,
    take: PAGE_SIZE,
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
  //
  // A day can straddle a page boundary, so page 2 may open partway through a
  // date and repeat its header. That's the honest presentation: the
  // alternative is uneven page sizes.
  const days = [];
  for (const r of rows) {
    const key = r.createdAt.toDateString();
    const last = days[days.length - 1];
    if (last && last.key === key) last.rows.push(r);
    else days.push({ key, date: r.createdAt, rows: [r] });
  }

  const filtering = Boolean(q) || cat !== "all";

  /** Rebuilds the query string, keeping the search and the type filter. */
  function url(nextPage) {
    const s = new URLSearchParams();
    if (q) s.set("q", q);
    if (cat !== "all") s.set("cat", cat);
    if (nextPage > 1) s.set("page", String(nextPage));
    const str = s.toString();
    return str ? `/activity?${str}` : "/activity";
  }

  const firstShown = total === 0 ? 0 : skip + 1;
  const lastShown = skip + rows.length;

  return (
    <>
      <style>{`
        .act-row { transition: background-color .12s ease; }
        .act-row:hover { background: var(--bg); }
        .pg-link { transition: background .12s ease, border-color .12s ease; }
        .pg-link:hover { background: var(--bg); border-color: var(--muted); }
      `}</style>

      <header style={S.hero}>
        <p style={S.eyebrow}>Audit log</p>
        <h1 style={S.h1}>Activity</h1>
        <p style={S.sub}>{scopeText}</p>
      </header>

      {/* The match count is now the true total, not the size of one page. */}
      <ActivitySearch total={total} />

      {rows.length === 0 ? (
        <div style={S.empty}>
          <p style={S.emptyTitle}>
            {filtering
              ? "Nothing matches those filters"
              : "Nothing recorded yet"}
          </p>
          <p style={S.emptyBody}>
            {filtering
              ? "Try a different name, document or event type."
              : "Sign-ins, edits and downloads all land here as people start using Atlas."}
          </p>
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

          {totalPages > 1 ? (
            <nav style={S.pager} aria-label="Pages">
              <span style={S.pagerCount}>
                {firstShown.toLocaleString()}–{lastShown.toLocaleString()} of{" "}
                {total.toLocaleString()}
              </span>

              <span style={S.pagerButtons}>
                {page > 1 ? (
                  <Link
                    href={url(page - 1)}
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
                    Newer
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
                    Newer
                  </span>
                )}

                <span style={S.pagerPage}>
                  Page {page} of {totalPages}
                </span>

                {/* "Older" rather than "Next": this is a reverse-chronological
                    feed, so direction in time is what people are thinking. */}
                {page < totalPages ? (
                  <Link
                    href={url(page + 1)}
                    className="pg-link"
                    style={S.pagerBtn}
                    rel="next"
                  >
                    Older
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
                    Older
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
          ) : null}
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
  hero: {
    padding: "26px 28px",
    marginBottom: 20,
    borderRadius: 16,
    background:
      "linear-gradient(135deg, var(--accent-soft) 0%, rgba(161,66,244,.07) 55%, transparent 100%)",
    border: "1px solid var(--line-soft)",
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
    border: "1px solid var(--line-soft)",
    borderRadius: 14,
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

  pager: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    paddingTop: 4,
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
    padding: "48px 28px",
    background: "var(--bg)",
    borderRadius: 14,
    textAlign: "center",
  },
  emptyTitle: { fontSize: 15, fontWeight: 600, color: "var(--text)" },
  emptyBody: {
    fontSize: 13.5,
    color: "var(--muted)",
    marginTop: 7,
    lineHeight: 1.5,
  },
};
