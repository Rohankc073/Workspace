import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canOpenFolder, folderPath } from "@/lib/folders";
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
    if (!flat) and.push({ folderId: folderId ?? null });
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

  const [files, trashCount, sharedCount, subfolders, creatorRows] =
    await Promise.all([
      prisma.file.findMany({
        where,
        orderBy,
        include: { company: true, uploadedBy: { select: { name: true } } },
      }),
      prisma.file.count({ where: { ...base, deletedAt: { not: null } } }),
      prisma.file.count({
        where: {
          deletedAt: null,
          permissions: { some: { userId: user.id, canView: true } },
        },
      }),
      showFolders
        ? prisma.folder.findMany({
            where: {
              parentId: folderId ?? null,
              deletedAt: null,
              companyId: { in: companyIds },
            },
            orderBy: { name: "asc" },
            include: { _count: { select: { files: true, children: true } } },
          })
        : Promise.resolve([]),
      // Creators are taken from the files themselves, not from memberships.
      // A super admin has no memberships but sees every file, so a
      // membership-based list would come back empty for them.
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

  // Keeps view, folder, type, search and sort when switching layout.
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
    if (next === "grid") s.set("layout", "grid");
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

  const empty = visibleFolders.length === 0 && files.length === 0;

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

  return (
    <>
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

  empty: {
    marginTop: 20,
    padding: "56px 28px",
    background: "var(--bg)",
    borderRadius: "var(--r-card)",
    textAlign: "center",
  },
};
