import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canOpenFolder, folderPath, grantedFolderIds } from "@/lib/folders";
import { visibleFilesWhere } from "@/lib/permissions";
import Link from "next/link";
import { redirect } from "next/navigation";
import DriveToolbar from "./drive-toolbar";
import NewFolder from "./new-folder";
import NewMenu from "./new-menu";
import SelectableFiles from "./selectable-files";
import UploadButton from "./upload-button";

// Type groups mirror documentTypeFor() in lib/storage so an uploaded
// .csv shows under Spreadsheets, a .pdf under Documents, and so on.
const TYPE_EXTS = {
  spreadsheet: ["xlsx", "xls", "ods", "csv"],
  document: ["docx", "doc", "odt", "rtf", "txt", "pdf"],
  presentation: ["pptx", "ppt", "odp"],
};

const TYPE_LABEL = {
  spreadsheet: "Spreadsheets",
  document: "Documents",
  presentation: "Presentations",
};

/**
 * Files per page.
 *
 * Without a limit this page fetched every file the person could see on every
 * load — Postgres sorting them all, Prisma building an object for each, the
 * whole lot serialised into the RSC payload and rendered into the DOM. At a
 * few hundred that is invisible; at ten thousand it is megabytes and tens of
 * thousands of DOM nodes to show a dozen rows.
 */
const PAGE_SIZE = 20;

/** What <input type="date"> sends: YYYY-MM-DD. Anything else is ignored. */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Turns the range params into a Prisma createdAt filter, or undefined.
 *
 * The end date is pushed to the last millisecond of that day. Without this,
 * `lte: new Date('2026-08-24')` means midnight, so picking today as the end
 * date would hide everything actually added today.
 *
 * Dates are parsed without a Z suffix, so they mean midnight in the *server's*
 * timezone — which is what someone picking "24 August" expects, as long as the
 * server and the office are in the same zone.
 */
function dateFilter(range, from, to) {
  // A single day: midnight to the last millisecond of that same date.
  if (range === "day") {
    if (!DAY.test(from)) return undefined;
    return {
      gte: new Date(`${from}T00:00:00`),
      lte: new Date(`${from}T23:59:59.999`),
    };
  }

  if (range === "custom") {
    const createdAt = {};
    if (DAY.test(from)) createdAt.gte = new Date(`${from}T00:00:00`);
    if (DAY.test(to)) createdAt.lte = new Date(`${to}T23:59:59.999`);
    // Both blank -> no constraint, so "Custom range" alone shows everything.
    if (!createdAt.gte && !createdAt.lte) return undefined;
    // Backwards pair would match nothing and look like a bug; ignore it.
    if (createdAt.gte && createdAt.lte && createdAt.gte > createdAt.lte) {
      return undefined;
    }
    return createdAt;
  }

  const d = new Date();
  if (range === "week") d.setDate(d.getDate() - 7);
  else if (range === "month") d.setMonth(d.getMonth() - 1);
  else return undefined;
  return { gte: d };
}

// Which date bucket a file falls in, computed on the server so grouping is
// consistent between SSR and the browser (no hydration mismatch).
function bucketOf(iso) {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const d = new Date(iso);
  const startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startToday - startThat) / 86400000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays <= 7) return "Earlier this week";
  if (diffDays <= 30) return "Earlier this month";
  return "Older";
}

export default async function FilesPage({ searchParams }) {
  const params = await searchParams;
  const view = params?.view ?? "documents";
  const layout = params?.layout === "grid" ? "grid" : "list";
  const folderId = params?.folder ?? null;
  const type = TYPE_EXTS[params?.type] ? params.type : "all";
  const q = (params?.q ?? "").trim();
  const SORTS = ["name", "created", "size", "modified"];
  const sort = SORTS.includes(params?.sort) ? params.sort : "modified";
  const group = params?.group === "date" ? "date" : null;
  const by = params?.by || null; // creator id
  const range = ["week", "month", "day", "custom"].includes(params?.range)
    ? params.range
    : "any";
  const from = DAY.test(params?.from ?? "") ? params.from : "";
  const to = DAY.test(params?.to ?? "") ? params.to : "";
  const vis = ["shared", "private"].includes(params?.vis) ? params.vis : "all";

  // Anything unparseable is page 1 rather than an error — a hand-edited or
  // stale URL should land somewhere sensible.
  const requestedPage = Math.max(1, Number(params?.page) || 1);

  const createdAtFilter = dateFilter(range, from, to);

  const user = await getCurrentUser();
  const companyIds = user.memberships.map((m) => m.companyId);
  const base = await visibleFilesWhere(user);

  // Flat mode: a drive-wide list, no folders. Triggered by a type
  // section or an active search. Otherwise it's normal folder browsing.
  const anyFilter =
    type !== "all" ||
    q !== "" ||
    Boolean(by) ||
    range !== "any" ||
    vis !== "all";
  const flat = view === "documents" && anyFilter;

  let folder = null;
  let crumbs = [];

  if (folderId && view === "documents" && !flat) {
    folder = await prisma.folder.findUnique({ where: { id: folderId } });
    if (!folder || folder.deletedAt) redirect("/files");
    if (!(await canOpenFolder(user, folder))) redirect("/files");
    crumbs = await folderPath(folderId);
  }

  const atRoot = view === "documents" && !flat && !folderId;

  /**
   * At the Drive root, show files that sit in a folder you cannot reach.
   *
   * Sharing a file grants nothing on its parent folder, so a file shared
   * from inside someone else's folder used to be invisible in My Drive —
   * it only appeared under "Shared with you", which people don't think to
   * check. Surfacing it at the root puts it where they expect.
   *
   * Once the folder itself becomes reachable the file is visible in its
   * real place, so this clause stops applying and it isn't listed twice.
   *
   * Admins and super admins reach every folder in their companies, so
   * `notIn` matches nothing for them and behaviour is unchanged.
   */
  let rootFolderClause = { folderId: null };

  if (atRoot && !user.isSuperAdmin) {
    const reachable = await grantedFolderIds(user);

    // Folders in companies this person runs are reachable too — those never
    // go through grantedFolderIds, which only tracks grants and authorship.
    const runsCompanyIds = user.memberships
      .filter((m) => m.role === "ADMIN" || m.role === "MANAGER")
      .map((m) => m.companyId);

    rootFolderClause = {
      OR: [
        { folderId: null },
        {
          AND: [
            { folderId: { not: null } },
            { folderId: { notIn: reachable } },
            runsCompanyIds.length
              ? { companyId: { notIn: runsCompanyIds } }
              : {},
          ],
        },
      ],
    };
  }

  let where;

  if (view === "trash") {
    where = { ...base, deletedAt: { not: null } };
  } else if (view === "shared") {
    where = {
      deletedAt: null,
      permissions: { some: { userId: user.id, canView: true } },
    };
  } else {
    // AND everything onto the base visibility rule — filters can only narrow,
    // never widen, what a user is allowed to see.
    const and = [base];
    if (!flat) {
      and.push(folderId ? { folderId } : rootFolderClause);
    }
    if (type !== "all") and.push({ extension: { in: TYPE_EXTS[type] } });
    if (by) and.push({ uploadedById: by });
    if (createdAtFilter) and.push({ createdAt: createdAtFilter });
    if (vis === "shared") and.push({ permissions: { some: {} } });
    else if (vis === "private") and.push({ permissions: { none: {} } });
    if (q) and.push({ name: { contains: q, mode: "insensitive" } });
    where = { AND: and };
  }

  // Search still applies in the trash / shared views.
  if (q && view !== "documents")
    where.name = { contains: q, mode: "insensitive" };

  const orderBy =
    view === "trash"
      ? { deletedAt: "desc" }
      : group === "date"
        ? { createdAt: "desc" }
        : sort === "name"
          ? { name: "asc" }
          : sort === "created"
            ? { createdAt: "desc" }
            : sort === "size"
              ? { size: "desc" }
              : { updatedAt: "desc" };

  const showFolders = view === "documents" && !flat;

  // How many match, so we can say "51–100 of 3,412" and know where the last
  // page is. One extra COUNT query, which Postgres answers from the same
  // index the page query uses.
  const totalFiles = await prisma.file.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalFiles / PAGE_SIZE));

  // A page number past the end (a bookmark from when there were more files,
  // or a filter that has since narrowed) lands on the last real page rather
  // than showing an empty list.
  const page = Math.min(requestedPage, totalPages);
  const skip = (page - 1) * PAGE_SIZE;

  const [files, trashCount, sharedCount, subfolders, creatorRows] =
    await Promise.all([
      prisma.file.findMany({
        where,
        orderBy,
        skip,
        take: PAGE_SIZE,
        include: { company: true, uploadedBy: { select: { name: true } } },
      }),
      prisma.file.count({ where: { ...base, deletedAt: { not: null } } }),
      prisma.file.count({
        where: {
          deletedAt: null,
          permissions: { some: { userId: user.id, canView: true } },
        },
      }),
      // Folders appear on the first page only. They are not paginated — there
      // are rarely many — and repeating them above every page of files would
      // be noise.
      showFolders && page === 1
        ? prisma.folder.findMany({
            where: {
              parentId: folderId ?? null,
              deletedAt: null,
              // A super admin has no memberships, so companyIds is empty —
              // and `in: []` matches nothing, which hid every folder from
              // them. Files inside those folders were then only reachable
              // through search, which drops the folder filter.
              ...(user.isSuperAdmin ? {} : { companyId: { in: companyIds } }),
            },
            orderBy: { name: "asc" },
            include: { _count: { select: { files: true, children: true } } },
          })
        : Promise.resolve([]),
      // Creators are taken from the files themselves, not from memberships.
      // A super admin has no memberships but sees every file, so a
      // membership-based list would come back empty for them.
      //
      // NOTE: this one is deliberately NOT paginated — it needs every
      // distinct uploader to populate the filter. `distinct` keeps the result
      // small but Postgres still walks the matching rows, so this is the next
      // query to address as the library grows.
      prisma.file.findMany({
        where: { AND: [base, { deletedAt: null }] },
        distinct: ["uploadedById"],
        select: { uploadedBy: { select: { id: true, name: true } } },
      }),
    ]);

  const creators = Array.from(
    new Map(
      creatorRows
        .map((r) => r.uploadedBy)
        .filter(Boolean)
        .map((u) => [u.id, u]),
    ).values(),
  ).sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  const allowed = await Promise.all(
    subfolders.map((f) => canOpenFolder(user, f)),
  );
  const visibleFolders = subfolders.filter((_, i) => allowed[i]);

  const heading =
    view === "trash"
      ? "Trash"
      : view === "shared"
        ? "Shared with you"
        : q
          ? "Search results"
          : type !== "all"
            ? TYPE_LABEL[type]
            : folder
              ? folder.name
              : "My Drive";

  /**
   * Rebuilds the query string, preserving every active filter.
   *
   * `next` optionally overrides one thing: "list"/"grid" for the layout
   * toggle, or { page: n } for the pager. Everything else carries through, so
   * paging never silently drops a filter and switching layout never jumps you
   * back to page 1 of a different list.
   */
  function url(next) {
    const s = new URLSearchParams();
    if (view !== "documents") s.set("view", view);
    if (folderId && !flat) s.set("folder", folderId);
    if (type !== "all") s.set("type", type);
    if (q) s.set("q", q);
    if (sort !== "modified") s.set("sort", sort);
    if (group) s.set("group", "date");
    if (by) s.set("by", by);
    if (range !== "any") s.set("range", range);
    if (from) s.set("from", from);
    if (to) s.set("to", to);
    if (vis !== "all") s.set("vis", vis);

    const wantLayout = next === "grid" || next === "list" ? next : layout;
    if (wantLayout === "grid") s.set("layout", "grid");

    const wantPage = next && typeof next === "object" ? next.page : page;
    if (wantPage > 1) s.set("page", String(wantPage));

    const str = s.toString();
    return str ? `/files?${str}` : "/files";
  }

  function mayManage(f) {
    const runsCompany =
      user.isSuperAdmin ||
      user.memberships.some(
        (m) =>
          m.companyId === f.companyId &&
          (m.role === "ADMIN" || m.role === "MANAGER"),
      );
    return f.uploadedById === user.id || runsCompany;
  }

  function mayManageFolder(f) {
    if (user.isSuperAdmin) return true;
    if (f.createdById && f.createdById === user.id) return true;
    return user.memberships.some(
      (m) =>
        m.companyId === f.companyId &&
        (m.role === "ADMIN" || m.role === "MANAGER"),
    );
  }

  const plainFolders = visibleFolders.map((f) => ({
    id: f.id,
    name: f.name,
    files: f._count.files,
    children: f._count.children,
    createdAt: f.createdAt.toISOString(),
    canManage: mayManageFolder(f),
  }));

  const plainFiles = files.map((f) => ({
    id: f.id,
    name: f.name,
    extension: f.extension,
    company: f.company?.name ?? "",
    createdBy: f.uploadedBy?.name ?? null,
    size: f.size ?? 0,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
    deletedAt: f.deletedAt ? f.deletedAt.toISOString() : null,
    bucket: bucketOf(f.createdAt.toISOString()),
    canManage: mayManage(f),
  }));

  const emptyText =
    view === "trash"
      ? "Nothing in the trash."
      : view === "shared"
        ? "Nothing has been shared with you yet."
        : q
          ? "No files match your search."
          : range === "day" && from
            ? "No files were added on that day."
            : range === "custom" && (from || to)
              ? "No files were added in that date range."
              : type !== "all"
                ? "No files of this type yet."
                : "Nothing here yet.";

  // Which kind "New" makes by default: the section you're standing in.
  const newType = type !== "all" ? type : "all";

  const firstShown = totalFiles === 0 ? 0 : skip + 1;
  const lastShown = skip + files.length;

  return (
    <>
      <style>{`
        .pg-link { transition: background .12s ease, border-color .12s ease; }
        .pg-link:hover { background: var(--bg); border-color: var(--muted); }
      `}</style>

      <div style={S.header}>
        <h1 style={S.h1}>{heading}</h1>

        {view === "documents" && companyIds[0] ? (
          <div style={S.actions}>
            <UploadButton
              companyId={folder?.companyId ?? companyIds[0]}
              folderId={flat ? null : folderId}
            />
            <NewFolder
              companyId={folder?.companyId ?? companyIds[0]}
              parentId={flat ? null : folderId}
            />
            <NewMenu
              companyId={folder?.companyId ?? companyIds[0]}
              folderId={flat ? null : folderId}
              activeType={newType}
            />
          </div>
        ) : null}
      </div>

      <div style={S.bar}>
        <div style={S.tabs}>
          <Link href="/files" style={view === "documents" ? S.tabOn : S.tab}>
            Documents
          </Link>
          <Link
            href="/files?view=shared"
            style={view === "shared" ? S.tabOn : S.tab}
          >
            Shared{sharedCount > 0 ? ` (${sharedCount})` : ""}
          </Link>
          <Link
            href="/files?view=trash"
            style={view === "trash" ? S.tabOn : S.tab}
          >
            Trash{trashCount > 0 ? ` (${trashCount})` : ""}
          </Link>
        </div>

        <div style={S.toggle}>
          <Link
            href={url("list")}
            style={layout === "list" ? S.toggleOn : S.toggleOff}
            aria-label="List view"
            title="List view"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" />
            </svg>
          </Link>
          <Link
            href={url("grid")}
            style={layout === "grid" ? S.toggleOn : S.toggleOff}
            aria-label="Grid view"
            title="Grid view"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M4 11h5V5H4v6zm0 7h5v-6H4v6zm6 0h5v-6h-5v6zm6 0h5v-6h-5v6zm-6-7h5V5h-5v6zm6-6v6h5V5h-5z" />
            </svg>
          </Link>
        </div>
      </div>

      <DriveToolbar creators={creators} />

      {crumbs.length > 0 ? (
        <p style={S.crumbs}>
          <Link href="/files" style={S.crumb}>
            My Drive
          </Link>
          {crumbs.map((c, i) => (
            <span key={c.id}>
              <span style={S.sep}>›</span>
              {i === crumbs.length - 1 ? (
                <span style={S.crumbNow}>{c.name}</span>
              ) : (
                <Link href={`/files?folder=${c.id}`} style={S.crumb}>
                  {c.name}
                </Link>
              )}
            </span>
          ))}
        </p>
      ) : null}

      <SelectableFiles
        view={view}
        layout={layout}
        group={group}
        folders={plainFolders}
        files={plainFiles}
        emptyText={emptyText}
      />

      {/* Only worth showing once there is more than one page of anything. */}
      {totalPages > 1 ? (
        <nav style={S.pager} aria-label="Pages">
          <span style={S.pagerCount}>
            {firstShown.toLocaleString()}–{lastShown.toLocaleString()} of{" "}
            {totalFiles.toLocaleString()}
          </span>

          <span style={S.pagerButtons}>
            {page > 1 ? (
              <Link
                href={url({ page: page - 1 })}
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
                href={url({ page: page + 1 })}
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
      ) : null}
    </>
  );
}

const S = {
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 20,
    flexWrap: "wrap",
  },
  h1: { fontSize: 28, fontWeight: 400, letterSpacing: "-0.01em" },
  actions: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },

  bar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    marginTop: 22,
    borderBottom: "1px solid var(--line)",
  },
  tabs: { display: "flex", gap: 4 },
  tab: {
    fontSize: 14,
    color: "var(--muted)",
    textDecoration: "none",
    padding: "10px 14px",
    borderBottom: "3px solid transparent",
  },
  tabOn: {
    fontSize: 14,
    fontWeight: 500,
    color: "var(--accent)",
    textDecoration: "none",
    padding: "10px 14px",
    borderBottom: "3px solid var(--accent)",
  },
  toggle: { display: "flex", gap: 2, paddingBottom: 6 },
  toggleOff: {
    display: "inline-flex",
    padding: 8,
    borderRadius: 999,
    color: "var(--muted)",
  },
  toggleOn: {
    display: "inline-flex",
    padding: 8,
    borderRadius: 999,
    color: "var(--accent)",
    background: "var(--accent-soft)",
  },

  crumbs: { marginTop: 16, fontSize: 14 },
  crumb: { color: "var(--muted)", textDecoration: "none" },
  crumbNow: { color: "var(--text)", fontWeight: 500 },
  sep: { color: "var(--muted)", margin: "0 8px" },

  pager: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    marginTop: 22,
    paddingTop: 18,
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
    marginTop: 20,
    padding: "56px 28px",
    background: "var(--bg)",
    borderRadius: "var(--r-card)",
    textAlign: "center",
  },
};
