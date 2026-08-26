import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { logActivity } from '@/lib/activity';

/** Folder creator, super admin, or an admin/manager of its company. */
function mayManageFolder(user, folder) {
  if (user.isSuperAdmin) return true;
  if (folder.createdById && folder.createdById === user.id) return true;
  return user.memberships.some(
    (m) =>
      m.companyId === folder.companyId && (m.role === 'ADMIN' || m.role === 'MANAGER')
  );
}

// DELETE /api/folders/[id]  -> remove an empty folder
export async function DELETE(req, { params }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

  const folder = await prisma.folder.findUnique({ where: { id } });
  if (!folder || folder.deletedAt) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  if (!mayManageFolder(user, folder)) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  }

  // Must be empty: no live files and no live subfolders.
  const [fileCount, childCount] = await Promise.all([
    prisma.file.count({ where: { folderId: id, deletedAt: null } }),
    prisma.folder.count({ where: { parentId: id, deletedAt: null } }),
  ]);
  if (fileCount > 0 || childCount > 0) {
    return NextResponse.json(
      { error: 'This folder is not empty. Remove or move its contents first.' },
      { status: 400 }
    );
  }

  await prisma.folder.delete({ where: { id } });

  await logActivity({
    action: 'FOLDER_DELETED',
    userId: user.id,
    companyId: folder.companyId,
    detail: { name: folder.name, folderId: id },
    req,
  });

  return NextResponse.json({ ok: true });
}