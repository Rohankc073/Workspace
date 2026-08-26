import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { deleteObject } from '@/lib/storage';
import { logActivity, ACTIONS } from '@/lib/activity';

/** Uploader, super admin, or an admin/manager of the file's company. */
function mayManage(user, file) {
  if (user.isSuperAdmin) return true;
  if (file.uploadedById === user.id) return true;
  return user.memberships.some(
    (m) =>
      m.companyId === file.companyId && (m.role === 'ADMIN' || m.role === 'MANAGER')
  );
}

// DELETE /api/files/[id]/purge  -> permanently remove a trashed file
export async function DELETE(req, { params }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

  const file = await prisma.file.findUnique({
    where: { id },
    include: { versions: true },
  });
  if (!file) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  // Only trashed files can be purged, never live ones.
  if (!file.deletedAt) {
    return NextResponse.json({ error: 'Move it to trash first.' }, { status: 400 });
  }
  if (!mayManage(user, file)) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  }

  // Remove every stored object: the current file plus each version.
  const keys = new Set([file.storageKey, ...file.versions.map((v) => v.storageKey)]);
  for (const key of keys) {
    if (key) await deleteObject(key);
  }

  const name = file.name;
  const companyId = file.companyId;

  // Cascades FileVersion, Permission, and ShareLink; Activity.fileId is
  // set null automatically, so the log below keeps the name in detail.
  await prisma.file.delete({ where: { id } });

  await logActivity({
    action: ACTIONS.FILE_PURGE,
    userId: user.id,
    companyId,
    fileId: null,
    detail: { name, purged: true },
    req,
  });

  return NextResponse.json({ ok: true });
}