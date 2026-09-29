import { prisma } from "./db";
import { grantedFolderIds } from "./folders";

const NONE = {
  canView: false,
  canEdit: false,
  canComment: false,
  canDownload: false,
  canPrint: false,
  canDelete: false,
  canPurge: false,
};

const FULL = {
  canView: true,
  canEdit: true,
  canComment: true,
  canDownload: true,
  canPrint: true,
  canDelete: true,
  canPurge: true,
};

/**
 * Works out what one person may do with one file.
 *
 * Closed by default: if nothing grants you access, you have none.
 *
 *   1. Super admin              -> everything, every company
 *   2. Not in the company       -> nothing
 *   3. Company ADMIN or MANAGER -> everything in that company
 *   4. You created the file     -> everything on that file
 *   5. A grant on the file      -> whatever it says
 *   6. A grant on a folder above it, nearest wins
 *   7. Otherwise                -> nothing
 *
 * At each level a grant naming the person beats a grant naming the role.
 *
 * `canDelete` and `canPurge` are deliberately different powers:
 *
 *   canDelete -> move to trash. Recoverable, logged, visible in the Trash
 *                tab. Admins keep this so a company can be tidied up and
 *                a departed employee's files can be cleared away.
 *
 *   canPurge  -> destroy permanently. Only the person who created the file,
 *                whoever they are. An admin cannot irreversibly delete
 *                someone else's work, and neither can a super admin.
 */
export async function resolveFilePermissions(user, file) {
  const perms = await basePermissions(user, file);

  // Applied last so it overrides every branch above, including the
  // super-admin and company-admin shortcuts that return FULL.
  perms.canPurge = perms.canView && file.uploadedById === user.id;

  return perms;
}

async function basePermissions(user, file) {
  if (user.isSuperAdmin) return { ...FULL };

  const membership = user.memberships.find(
    (m) => m.companyId === file.companyId,
  );
  if (!membership) return { ...NONE };

  if (membership.role === "ADMIN" || membership.role === "MANAGER")
    return { ...FULL };

  // You always control what you created.
  if (file.uploadedById === user.id) return { ...FULL };

  // A grant on the file itself.
  const fileGrants = await prisma.permission.findMany({
    where: {
      fileId: file.id,
      OR: [{ userId: user.id }, { role: membership.role }],
    },
  });

  const onFile = pick(fileGrants, user.id);
  if (onFile) return strip(onFile);

  // Otherwise walk up the folder tree.
  let folderId = file.folderId;
  const guard = new Set();

  while (folderId && !guard.has(folderId)) {
    guard.add(folderId);

    const grants = await prisma.permission.findMany({
      where: {
        folderId,
        OR: [{ userId: user.id }, { role: membership.role }],
      },
    });

    const found = pick(grants, user.id);
    if (found) return strip(found);

    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
      select: { parentId: true },
    });
    folderId = folder?.parentId ?? null;
  }

  // Nothing granted anywhere.
  return { ...NONE };
}

/** A person-specific grant outranks a role grant at the same level. */
function pick(grants, userId) {
  return (
    grants.find((g) => g.userId === userId) ??
    grants.find((g) => g.role) ??
    null
  );
}

/**
 * Copies a database row into a plain permissions object.
 *
 * There's no canPurge column — a shared grant never confers permanent
 * deletion. resolveFilePermissions sets it from authorship instead.
 */
function strip(g) {
  return {
    canView: g.canView,
    canEdit: g.canEdit,
    canComment: g.canComment,
    canDownload: g.canDownload,
    canPrint: g.canPrint,
    canDelete: g.canDelete,
    canPurge: false,
  };
}

/**
 * The Prisma `where` clause for "files this person may see".
 *
 * Must stay in step with resolveFilePermissions above. Async because
 * working out which folders were granted needs a query.
 */
export async function visibleFilesWhere(user) {
  if (user.isSuperAdmin) {
    return { deletedAt: null };
  }

  const folderIds = await grantedFolderIds(user);
  const clauses = [];

  for (const m of user.memberships) {
    if (m.role === "ADMIN" || m.role === "MANAGER") {
      // Runs the company: sees everything in it.
      clauses.push({ companyId: m.companyId });
    } else {
      // Owns it...
      clauses.push({ companyId: m.companyId, uploadedById: user.id });
      // ...or the file itself was shared with them.
      clauses.push({
        companyId: m.companyId,
        permissions: {
          some: {
            canView: true,
            OR: [{ userId: user.id }, { role: m.role }],
          },
        },
      });
    }
  }

  // ...or it sits in a folder that was shared with them.
  if (folderIds.length > 0) {
    clauses.push({ folderId: { in: folderIds } });
  }

  // An empty OR array matches everything in Prisma, which would undo
  // all of the above. The impossible clause keeps it closed.
  return { deletedAt: null, OR: clauses.length ? clauses : [{ id: "" }] };
}
