import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { deleteObject } from '@/lib/storage';
import { logActivity, ACTIONS } from '@/lib/activity';

const ACTIONS_ALLOWED = ['trash', 'restore', 'purge'];

/** Uploader, super admin, or an admin/manager of the file's company. */
function mayManage(user, file) {
  if (user.isSuperAdmin) return true;
  if (file.uploadedById === user.id) return true;
  return user.memberships.some(
    (m) =>
      m.companyId === file.companyId && (m.role === 'ADMIN' || m.role === 'MANAGER')
  );
}

// POST /api/files/batch  { ids: string[], action: 'trash'|'restore'|'purge' }
export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

  const { ids, action } = await req.json().catch(() => ({}));

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'Nothing selected.' }, { status: 400 });
  }
  if (!ACTIONS_ALLOWED.includes(action)) {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }

  const files = await prisma.file.findMany({
    where: { id: { in: ids } },
    include: { versions: true },
  });

  let done = 0;

  for (const file of files) {
    // Skip anything this person may not manage — never fail the whole batch.
    if (!mayManage(user, file)) continue;

    if (action === 'trash') {
      if (file.deletedAt) continue;
      await prisma.file.update({ where: { id: file.id }, data: { deletedAt: new Date() } });
      await logActivity({
        action: ACTIONS.FILE_DELETE,
        userId: user.id,
        companyId: file.companyId,
        fileId: file.id,
        detail: { name: file.name },
        req,
      });
      done += 1;
    } else if (action === 'restore') {
      if (!file.deletedAt) continue;
      await prisma.file.update({ where: { id: file.id }, data: { deletedAt: null } });
      await logActivity({
        action: ACTIONS.FILE_UNDELETE,
        userId: user.id,
        companyId: file.companyId,
        fileId: file.id,
        detail: { name: file.name },
        req,
      });
      done += 1;
    } else {
      // purge — only trashed files, remove bytes then the row (cascades).
      if (!file.deletedAt) continue;
      const keys = new Set([file.storageKey, ...file.versions.map((v) => v.storageKey)]);
      for (const key of keys) {
        if (key) await deleteObject(key);
      }
      const name = file.name;
      const companyId = file.companyId;
      await prisma.file.delete({ where: { id: file.id } });
      await logActivity({
        action: ACTIONS.FILE_PURGE,
        userId: user.id,
        companyId,
        fileId: null,
        detail: { name, purged: true },
        req,
      });
      done += 1;
    }
  }

  return NextResponse.json({ ok: true, done });
}