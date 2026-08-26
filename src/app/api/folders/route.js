import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { logActivity, ACTIONS } from '@/lib/activity';

/** Anyone in the company except a viewer may create folders. */
function canCreate(user, companyId) {
  if (user.isSuperAdmin) return true;
  const m = user.memberships.find((x) => x.companyId === companyId);
  return Boolean(m) && m.role !== 'VIEWER';
}

export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

  const { name, companyId, parentId } = await req.json();

  if (!name || !name.trim()) {
    return NextResponse.json({ error: 'Give the folder a name.' }, { status: 400 });
  }

  if (!canCreate(user, companyId)) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  }

  // A parent must exist and belong to the same company, or someone
  // could nest a folder inside another company's tree.
  if (parentId) {
    const parent = await prisma.folder.findUnique({ where: { id: parentId } });
    if (!parent || parent.companyId !== companyId || parent.deletedAt) {
      return NextResponse.json({ error: 'That parent folder is not valid.' }, { status: 400 });
    }
  }

  const clean = name.trim().replace(/[\\/:*?"<>|]/g, '');

  const folder = await prisma.folder.create({
    data: {
      name: clean,
      company: { connect: { id: companyId } },
      // Recorded so the creator can always open their own folder,
      // the same way a file's uploader always keeps access to it.
      createdBy: { connect: { id: user.id } },
      ...(parentId ? { parent: { connect: { id: parentId } } } : {}),
    },
  });

  await logActivity({
    action: ACTIONS.FOLDER_CREATED,
    userId: user.id,
    companyId,
    detail: { name: clean, folderId: folder.id, parentId: parentId ?? null },
    req,
  });

  return NextResponse.json({ id: folder.id, name: folder.name });
}