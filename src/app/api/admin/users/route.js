import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, hashPassword } from '@/lib/auth';
import { logActivity, ACTIONS } from '@/lib/activity';

/** Super admins run everything; company admins run one company. */
function canAdminister(user, companyId) {
  if (user.isSuperAdmin) return true;
  return user.memberships.some(
    (m) => m.companyId === companyId && m.role === 'ADMIN'
  );
}

// POST /api/admin/users
// A company admin creates a user on THEIR company's domain. They send just
// the local part (e.g. "john"); the server appends "@companydomain".
// Body: { localPart, name, password, companyId, role }
export async function POST(req) {
  const admin = await getCurrentUser();
  if (!admin) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const localPart = String(body.localPart || '').toLowerCase().trim().replace(/@.*$/, '');
  const name = String(body.name || '').trim();
  const password = String(body.password || '');
  const companyId = body.companyId;
  const role = body.role;

  if (!localPart || !name || !password || !companyId) {
    return NextResponse.json({ error: 'Fill in every field.' }, { status: 400 });
  }

  // The company id came from the browser, so check it against this
  // person's own memberships rather than trusting it.
  if (!canAdminister(admin, companyId)) {
    return NextResponse.json(
      { error: 'You can only add people to your own company.' },
      { status: 403 }
    );
  }

  if (!['VIEWER', 'EDITOR', 'MANAGER', 'ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Unknown role.' }, { status: 400 });
  }

  if (/[^a-z0-9._-]/.test(localPart)) {
    return NextResponse.json(
      { error: 'The email name can only use letters, numbers, dot, dash, underscore.' },
      { status: 400 }
    );
  }

  if (password.length < 12) {
    return NextResponse.json({ error: 'Use at least 12 characters.' }, { status: 400 });
  }

  // Look up the company's domain and build the email from it. The admin
  // never gets to choose the domain, so a user can't be created off-domain.
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { domain: true },
  });
  if (!company) {
    return NextResponse.json({ error: 'That company does not exist.' }, { status: 404 });
  }

  const email = `${localPart}@${company.domain}`;

  // Defence in depth: even if something upstream changed, refuse any email
  // that is not on this company's domain.
  if (!email.endsWith(`@${company.domain}`)) {
    return NextResponse.json(
      { error: `Users must use the @${company.domain} domain.` },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: `${email} already has an account.` }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: await hashPassword(password),
      // isSuperAdmin is never set here — only a direct DB change can do that.
      memberships: { create: { companyId, role } },
    },
  });

  await logActivity({
    action: ACTIONS.USER_CREATED,
    userId: admin.id,
    companyId,
    detail: { createdUserId: user.id, email, role },
    req,
  });

  return NextResponse.json({ id: user.id, email });
}