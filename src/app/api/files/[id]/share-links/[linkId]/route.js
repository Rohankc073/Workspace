import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { logActivity, ACTIONS } from '@/lib/activity';
import { resolveFilePermissions } from '@/lib/permissions';

/** Identical gate to the create/list route. Keep the two in sync. */
async function mayManage(user, file) {
  if (user.isSuperAdmin) return true;
  const perms = await resolveFilePermissions(user, file);
  return Boolean(perms && perms.canEdit && perms.canDelete);
}

// DELETE /api/files/[id]/share-links/[linkId]  -> revoke a link
export async function DELETE(req, { params }) {
  const { id, linkId } = await params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const file = await prisma.file.findUnique({ where: { id } });
  if (!file) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if (!(await mayManage(user, file))) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  }

  const link = await prisma.shareLink.findUnique({ where: { id: linkId } });
  if (!link || link.fileId !== file.id) {
    return NextResponse.json({ error: 'No such link on this file.' }, { status: 404 });
  }

  // Idempotent: revoking an already-revoked link is a no-op, still 200.
  if (!link.revokedAt) {
    await prisma.shareLink.update({
      where: { id: linkId },
      data: { revokedAt: new Date() },
    });

    await logActivity({
      action: ACTIONS.PERMISSION_CHANGE,
      userId: user.id,
      companyId: file.companyId,
      fileId: file.id,
      detail: { shareLink: true, revoked: true, linkId },
      req,
    });
  }

  return NextResponse.json({ ok: true });
}