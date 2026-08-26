import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, hashPassword } from '@/lib/auth';
import { logActivity, ACTIONS } from '@/lib/activity';

/** Companies where this admin is entitled to act on the target person. */
function sharedCompanies(admin, target) {
  if (admin.isSuperAdmin) return target.memberships.map((m) => m.companyId);

  const adminOf = admin.memberships
    .filter((m) => m.role === 'ADMIN')
    .map((m) => m.companyId);

  return target.memberships
    .filter((m) => adminOf.includes(m.companyId))
    .map((m) => m.companyId);
}

export async function PATCH(req, { params }) {
  const { id } = await params;

  const admin = await getCurrentUser();
  if (!admin) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

  const target = await prisma.user.findUnique({
    where: { id },
    include: { memberships: true },
  });
  if (!target) return NextResponse.json({ error: 'No such person.' }, { status: 404 });

  const shared = sharedCompanies(admin, target);
  if (shared.length === 0) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  }

  // A company admin cannot act on a super admin. Only another super
  // admin can, which prevents a company admin escalating past them.
  if (target.isSuperAdmin && !admin.isSuperAdmin) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  }

  const { action, value } = await req.json();

  if (action === 'setActive') {
    if (target.id === admin.id && value === false) {
      return NextResponse.json(
        { error: 'You cannot disable your own account.' },
        { status: 400 }
      );
    }

    await prisma.user.update({
      where: { id },
      data: { isActive: Boolean(value) },
    });

    // Disabling should take effect immediately, not whenever their
    // session happens to expire. Dropping the sessions signs them out.
    if (value === false) {
      await prisma.session.deleteMany({ where: { userId: id } });
    }

    await logActivity({
      action: ACTIONS.USER_DISABLED,
      userId: admin.id,
      companyId: shared[0],
      detail: { targetUserId: id, email: target.email, active: Boolean(value) },
      req,
    });

    return NextResponse.json({ ok: true });
  }

  if (action === 'resetPassword') {
    if (!value || String(value).length < 12) {
      return NextResponse.json(
        { error: 'Use at least 12 characters.' },
        { status: 400 }
      );
    }

    await prisma.user.update({
      where: { id },
      data: { passwordHash: await hashPassword(String(value)) },
    });

    // Any session opened with the old password is no longer trusted.
    await prisma.session.deleteMany({ where: { userId: id } });

    await logActivity({
      action: ACTIONS.PASSWORD_RESET,
      userId: admin.id,
      companyId: shared[0],
      detail: { targetUserId: id, email: target.email },
      req,
    });

    return NextResponse.json({ ok: true });
  }

  if (action === 'setRole') {
    const { companyId, role } = value ?? {};

    if (!shared.includes(companyId)) {
      return NextResponse.json({ error: 'Not your company.' }, { status: 403 });
    }
    if (!['VIEWER', 'EDITOR', 'MANAGER', 'ADMIN'].includes(role)) {
      return NextResponse.json({ error: 'Unknown role.' }, { status: 400 });
    }

    await prisma.membership.updateMany({
      where: { userId: id, companyId },
      data: { role },
    });

    await logActivity({
      action: ACTIONS.USER_ROLE_CHANGED,
      userId: admin.id,
      companyId,
      detail: { targetUserId: id, email: target.email, role },
      req,
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}

// DELETE /api/.../users/[id]  -> permanently remove an account.
// Documents the person authored are kept; their authorship is cleared
// (the schema sets those relations null on delete). Memberships,
// sessions, and permission grants are removed with the account.
export async function DELETE(req, { params }) {
  const { id } = await params;

  const admin = await getCurrentUser();
  if (!admin) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

  // You can never delete your own account.
  if (id === admin.id) {
    return NextResponse.json(
      { error: 'You cannot delete your own account.' },
      { status: 400 }
    );
  }

  const target = await prisma.user.findUnique({
    where: { id },
    include: { memberships: true },
  });
  if (!target) return NextResponse.json({ error: 'No such person.' }, { status: 404 });

  const shared = sharedCompanies(admin, target);
  if (shared.length === 0) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  }

  // A company admin cannot delete a super admin.
  if (target.isSuperAdmin && !admin.isSuperAdmin) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  }

  // A company admin may only delete someone whose companies are all ones
  // they administer. If the person also sits in another company, deleting
  // the whole account would reach beyond this admin's authority.
  if (!admin.isSuperAdmin) {
    const adminOf = admin.memberships
      .filter((m) => m.role === 'ADMIN')
      .map((m) => m.companyId);
    const belongsElsewhere = target.memberships.some(
      (m) => !adminOf.includes(m.companyId)
    );
    if (belongsElsewhere) {
      return NextResponse.json(
        {
          error:
            'This person also belongs to a company you do not administer. A super admin must delete them.',
        },
        { status: 403 }
      );
    }
  }

  const email = target.email;
  const companyForLog = shared[0];

  // Cascades memberships, sessions, and permissions; authored files,
  // folders, versions and share links have their owner set to null.
  await prisma.user.delete({ where: { id } });

  await logActivity({
    action: 'USER_DELETED',
    userId: admin.id,
    companyId: companyForLog,
    detail: { targetUserId: id, email },
    req,
  });

  return NextResponse.json({ ok: true });
}