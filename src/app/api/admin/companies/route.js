import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, hashPassword } from '@/lib/auth';
import { logActivity, ACTIONS } from '@/lib/activity';

/** Normalises a domain: lowercase, strip protocol/@, trim dots/spaces. */
function cleanDomain(raw) {
  return String(raw || '')
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^@/, '')
    .replace(/\/.*$/, '')
    .replace(/^\.+|\.+$/g, '');
}

// A real domain: at least one dot, valid characters.
function isDomain(d) {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d);
}

// POST /api/admin/companies
// Super admin only. Creates the company AND its single admin user in one step.
// Body: { name, domain, adminName, adminLocalPart, adminPassword }
export async function POST(req) {
  const user = await getCurrentUser();
  if (!user?.isSuperAdmin) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  const domain = cleanDomain(body.domain);
  const adminName = String(body.adminName || '').trim();
  const adminLocalPart = String(body.adminLocalPart || '').toLowerCase().trim().replace(/@.*$/, '');
  const adminPassword = String(body.adminPassword || '');

  if (name.length < 2) {
    return NextResponse.json({ error: 'Give the company a name.' }, { status: 400 });
  }
  if (!isDomain(domain)) {
    return NextResponse.json({ error: 'Enter a valid company domain, e.g. acme.com.' }, { status: 400 });
  }
  if (!adminName) {
    return NextResponse.json({ error: "Enter the admin's name." }, { status: 400 });
  }
  if (!adminLocalPart || /[^a-z0-9._-]/.test(adminLocalPart)) {
    return NextResponse.json(
      { error: "Enter the admin's email name (letters, numbers, dot, dash)." },
      { status: 400 }
    );
  }
  if (adminPassword.length < 12) {
    return NextResponse.json({ error: 'Admin password must be at least 12 characters.' }, { status: 400 });
  }

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!slug) {
    return NextResponse.json({ error: 'That name has no usable letters.' }, { status: 400 });
  }

  const adminEmail = `${adminLocalPart}@${domain}`;

  // Pre-checks for friendlier errors (unique constraints still enforce it).
  if (await prisma.company.findUnique({ where: { slug } })) {
    return NextResponse.json({ error: 'A company with that name exists.' }, { status: 409 });
  }
  if (await prisma.company.findUnique({ where: { domain } })) {
    return NextResponse.json({ error: 'That domain is already used by another company.' }, { status: 409 });
  }
  if (await prisma.user.findUnique({ where: { email: adminEmail } })) {
    return NextResponse.json({ error: `${adminEmail} already has an account.` }, { status: 409 });
  }

  const passwordHash = await hashPassword(adminPassword);

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({ data: { name, slug, domain } });
      const adminUser = await tx.user.create({
        data: {
          email: adminEmail,
          name: adminName,
          passwordHash,
          memberships: { create: { companyId: company.id, role: 'ADMIN' } },
        },
      });
      return { company, adminUser };
    });
  } catch (err) {
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: 'That name, domain, or admin email is already taken.' }, { status: 409 });
    }
    throw err;
  }

  await logActivity({
    action: ACTIONS.COMPANY_CREATED,
    userId: user.id,
    companyId: created.company.id,
    detail: { name, domain, adminEmail },
    req,
  });
  await logActivity({
    action: ACTIONS.USER_CREATED,
    userId: user.id,
    companyId: created.company.id,
    detail: { createdUserId: created.adminUser.id, email: adminEmail, role: 'ADMIN', seedAdmin: true },
    req,
  });

  return NextResponse.json({
    id: created.company.id,
    name: created.company.name,
    domain,
    adminEmail,
  });
}