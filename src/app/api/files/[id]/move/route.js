import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { resolveFilePermissions } from '@/lib/permissions';
import { canOpenFolder } from '@/lib/folders';
import { logActivity, ACTIONS } from '@/lib/activity';

/** Lists folders this person can move the file into. */
export async function GET(req, { params }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

  const file = await prisma.file.findUnique({ where: { id } });
  if (!file || file.deletedAt) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const permissions = await resolveFilePermissions(user, file);
  if (!permissions.canEdit) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  }

  // Only folders in the file's own company. A file never crosses
  // companies, because its permissions are scoped to one.
  const folders = await prisma.folder.findMany({
    where: { companyId: file.companyId, deletedAt: null },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      parentId: true,
      companyId: true,
      createdById: true,
    },
  });

  const allowed = await Promise.all(folders.map((f) => canOpenFolder(user, f)));

  return NextResponse.json({
    currentFolderId: file.folderId,
    folders: folders.filter((_, i) => allowed[i]).map((f) => ({
      id: f.id,
      name: f.name,
    })),
  });
}

export async function POST(req, { params }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

  const file = await prisma.file.findUnique({ where: { id } });
  if (!file || file.deletedAt) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const permissions = await resolveFilePermissions(user, file);
  if (!permissions.canEdit) {
    return NextResponse.json({ error: 'You cannot move this file.' }, { status: 403 });
  }

  const { folderId } = await req.json();

  if (folderId) {
    const folder = await prisma.folder.findUnique({ where: { id: folderId } });
    if (!folder || folder.companyId !== file.companyId || folder.deletedAt) {
      return NextResponse.json({ error: 'That folder is not valid.' }, { status: 400 });
    }
    // Moving into a folder you cannot open would hide the file
    // from yourself, which is almost never what someone means.
    if (!(await canOpenFolder(user, folder))) {
      return NextResponse.json({ error: 'You cannot use that folder.' }, { status: 403 });
    }
  }

  await prisma.file.update({
    where: { id },
    data: { folderId: folderId ?? null },
  });

  await logActivity({
    action: ACTIONS.FILE_MOVED,
    userId: user.id,
    companyId: file.companyId,
    fileId: id,
    detail: { from: file.folderId, to: folderId ?? null },
    req,
  });

  return NextResponse.json({ ok: true });
}