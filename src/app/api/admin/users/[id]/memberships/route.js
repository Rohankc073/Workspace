import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { logActivity, ACTIONS } from '@/lib/activity';

/** Companies this admin runs. Super admins run all. */
function adminCompanies(admin) {
  if (admin.isSuperAdmin) return null; // null means "any"
  return admin.memberships
    .filter((m) => m.role === 'ADMIN')
    .map((m) => m.companyId);
}

function mayAct(admin, companyId) {
  const scope = adminCompanies(admin);
  return scope === null || scope.includes(companyId);
}

/** Add the person to a company. */
export async function POST(req, { params }) {
  const { id } = await params;

  const admin = await getCurrentUser();
  if (!admin) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: 'No such person.' }, { status: 404 });

  if (target.isSuperAdmin && !admin.isSuperAdmin) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  }

  const { companyId, role } = await req.json();

  if (!mayAct(admin, companyId)) {
    return NextResponse.json(
      { error: 'You can only add people to your own company.' },
      { status: 403 }
    );
  }

  if (!['VIEWER', 'EDITOR', 'MANAGER', 'ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Unknown role.' }, { status: 400 });
  }

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    return NextResponse.json({ error: 'No such company.' }, { status: 404 });
  }

  const existing = await prisma.membership.findFirst({
    where: { userId: id, companyId },
  });
  if (existing) {
    return NextResponse.json({ error: 'They are already in that company.' }, { status: 409 });
  }

  await prisma.membership.create({
    data: {
      user: { connect: { id } },
      company: { connect: { id: companyId } },
      role,
    },
  });

  await logActivity({
    action: ACTIONS.USER_ROLE_CHANGED,
    userId: admin.id,
    companyId,
    detail: { addedUserId: id, email: target.email, role, added: true },
    req,
  });

  return NextResponse.json({ ok: true });
}

/** Remove the person from a company. */
export async function DELETE(req, { params }) {
  const { id } = await params;

  const admin = await getCurrentUser();
  if (!admin) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

  const target = await prisma.user.findUnique({
    where: { id },
    include: { memberships: true },
  });
  if (!target) return NextResponse.json({ error: 'No such person.' }, { status: 404 });

  if (target.isSuperAdmin && !admin.isSuperAdmin) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  }

  const { companyId } = await req.json();

  if (!mayAct(admin, companyId)) {
    return NextResponse.json({ error: 'Not your company.' }, { status: 403 });
  }

  // Never strip a person's last company — they would still exist but
  // belong nowhere, invisible and unassignable. Disable them instead.
  if (target.memberships.length <= 1) {
    return NextResponse.json(
      { error: 'This is their only company. Disable the account instead of removing it.' },
      { status: 400 }
    );
  }

  // Removing a membership should also drop any file or folder grants
  // they held there, so access does not linger after they leave.
  const companyFiles = await prisma.file.findMany({
    where: { companyId },
    select: { id: true },
  });
  const companyFolders = await prisma.folder.findMany({
    where: { companyId },
    select: { id: true },
  });

  await prisma.permission.deleteMany({
    where: {
      userId: id,
      OR: [
        { fileId: { in: companyFiles.map((f) => f.id) } },
        { folderId: { in: companyFolders.map((f) => f.id) } },
      ],
    },
  });

  await prisma.membership.deleteMany({ where: { userId: id, companyId } });

  // Any active sessions may now show stale access, so end them.
  await prisma.session.deleteMany({ where: { userId: id } });

  await logActivity({
    action: ACTIONS.USER_ROLE_CHANGED,
    userId: admin.id,
    companyId,
    detail: { removedUserId: id, email: target.email, removed: true },
    req,
  });

  return NextResponse.json({ ok: true });
}