import { prisma } from './db';

/**
 * The chain from the root down to this folder, for breadcrumbs.
 * Returns [] for the top level.
 */
export async function folderPath(folderId) {
  const chain = [];
  const guard = new Set();
  let id = folderId;

  while (id && !guard.has(id)) {
    guard.add(id);

    const folder = await prisma.folder.findUnique({
      where: { id },
      select: { id: true, name: true, parentId: true, companyId: true },
    });
    if (!folder) break;

    chain.unshift(folder);
    id = folder.parentId;
  }

  return chain;
}

/**
 * Whether this person may open this folder.
 *
 *   1. Super admin              -> yes
 *   2. Not in the company       -> no
 *   3. Company ADMIN or MANAGER -> yes
 *   4. Created it, or created a folder above it -> yes
 *   5. A grant on it or on a folder above it    -> yes
 *   6. Otherwise                -> no
 */
export async function canOpenFolder(user, folder) {
  if (user.isSuperAdmin) return true;

  const membership = user.memberships.find((m) => m.companyId === folder.companyId);
  if (!membership) return false;

  if (membership.role === 'ADMIN' || membership.role === 'MANAGER') return true;

  // You always keep access to what you made, the same way a file's
  // uploader keeps access to it. Without this, your own folders are
  // invisible to you until someone grants them back.
  if (folder.createdById === user.id) return true;

  let id = folder.parentId;
  const guard = new Set();

  // Check this folder for a grant first, then walk upward.
  const own = await prisma.permission.findFirst({
    where: {
      folderId: folder.id,
      canView: true,
      OR: [{ userId: user.id }, { role: membership.role }],
    },
  });
  if (own) return true;

  while (id && !guard.has(id)) {
    guard.add(id);

    const parent = await prisma.folder.findUnique({
      where: { id },
      select: { id: true, parentId: true, createdById: true },
    });
    if (!parent) break;

    if (parent.createdById === user.id) return true;

    const grant = await prisma.permission.findFirst({
      where: {
        folderId: parent.id,
        canView: true,
        OR: [{ userId: user.id }, { role: membership.role }],
      },
    });
    if (grant) return true;

    id = parent.parentId;
  }

  return false;
}

/**
 * Folder ids this person can reach, including everything nested
 * beneath them.
 *
 * Used by the file list, so a grant on a folder makes the files
 * inside it visible without needing a grant on each one.
 */
export async function grantedFolderIds(user) {
  // A role grant only counts inside the company where the person
  // actually holds that role. Matching on role alone would let an
  // EDITOR at one company inherit EDITOR grants at another.
  const clauses = [{ userId: user.id }];

  for (const m of user.memberships) {
    clauses.push({ role: m.role, folder: { companyId: m.companyId } });
  }

  const [grants, made] = await Promise.all([
    prisma.permission.findMany({
      where: { folderId: { not: null }, canView: true, OR: clauses },
      select: { folderId: true },
    }),
    prisma.folder.findMany({
      where: { createdById: user.id, deletedAt: null },
      select: { id: true },
    }),
  ]);

  const roots = [
    ...grants.map((g) => g.folderId).filter(Boolean),
    ...made.map((f) => f.id),
  ];

  if (roots.length === 0) return [];

  // Walk down from each reachable folder. Depth is small in practice,
  // and the seen set stops any accidental cycle.
  const seen = new Set(roots);
  let frontier = [...seen];

  while (frontier.length > 0) {
    const children = await prisma.folder.findMany({
      where: { parentId: { in: frontier }, deletedAt: null },
      select: { id: true },
    });

    frontier = children.map((c) => c.id).filter((id) => !seen.has(id));
    frontier.forEach((id) => seen.add(id));
  }

  return [...seen];
}