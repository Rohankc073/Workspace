import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { resolveFilePermissions } from '@/lib/permissions';
import { deleteObject } from '@/lib/storage';
import { logActivity, ACTIONS } from '@/lib/activity';

/** POST — move to trash. The file stays on disk and can be brought back. */
export async function POST(req, { params }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

  const file = await prisma.file.findUnique({ where: { id } });
  if (!file || file.deletedAt) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const permissions = await resolveFilePermissions(user, file);
  if (!permissions.canDelete) {
    return NextResponse.json({ error: 'You cannot delete this file.' }, { status: 403 });
  }

  await prisma.file.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await logActivity({
    action: ACTIONS.FILE_DELETE,
    userId: user.id,
    companyId: file.companyId,
    fileId: file.id,
    detail: { name: file.name },
    req,
  });

  return NextResponse.json({ ok: true });
}

/** PUT — bring it back out of the trash. */
export async function PUT(req, { params }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

  const file = await prisma.file.findUnique({ where: { id } });
  if (!file || !file.deletedAt) {
    return NextResponse.json({ error: 'That file is not in the trash.' }, { status: 404 });
  }

  const permissions = await resolveFilePermissions(user, file);
  if (!permissions.canDelete) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  }

  await prisma.file.update({
    where: { id },
    data: { deletedAt: null },
  });

  await logActivity({
    action: ACTIONS.FILE_UNDELETE,
    userId: user.id,
    companyId: file.companyId,
    fileId: file.id,
    detail: { name: file.name },
    req,
  });

  return NextResponse.json({ ok: true });
}

/**
 * DELETE — permanent removal. Every version wiped from disk, the row
 * destroyed. Restricted to administrators because there is no undo.
 */
export async function DELETE(req, { params }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

  const file = await prisma.file.findUnique({
    where: { id },
    include: { versions: true },
  });
  if (!file) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const isAdmin =
    user.isSuperAdmin ||
    user.memberships.some(
      (m) => m.companyId === file.companyId && m.role === 'ADMIN'
    );

  if (!isAdmin) {
    return NextResponse.json(
      { error: 'Only an administrator can permanently delete.' },
      { status: 403 }
    );
  }

  // Storage first. If this fails we stop, rather than losing the
  // database rows that tell us which files to clean up.
  for (const v of file.versions) {
    await deleteObject(v.storageKey);
    if (v.changesKey) await deleteObject(v.changesKey);
  }
  await deleteObject(file.storageKey);

  // Activity rows point at this file. Break the link before removing it —
  // the log entries themselves must outlive what they describe.
  await prisma.activity.updateMany({
    where: { fileId: id },
    data: { fileId: null },
  });

  await prisma.file.delete({ where: { id } });

  await logActivity({
    action: ACTIONS.FILE_PURGE,
    userId: user.id,
    companyId: file.companyId,
    detail: { name: file.name, versions: file.versions.length },
    req,
  });

  return NextResponse.json({ ok: true });
}