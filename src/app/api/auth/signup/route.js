// import { NextResponse } from 'next/server';
// import crypto from 'crypto';
// import { prisma } from '@/lib/db';
// import { hashPassword, createSession } from '@/lib/auth';
// import { logActivity, ACTIONS } from '@/lib/activity';

// function slugify(s) {
//   return s
//     .toLowerCase()
//     .trim()
//     .replace(/[^a-z0-9]+/g, '-')
//     .replace(/^-+|-+$/g, '')
//     .slice(0, 40);
// }

// // POST /api/auth/signup  { name, email, password, companyName }
// export async function POST(req) {
//   const body = await req.json().catch(() => ({}));
//   const name = (body.name || '').trim();
//   const email = (body.email || '').toLowerCase().trim();
//   const password = body.password || '';
//   const companyName = (body.companyName || '').trim();

//   if (!name || !email || !password || !companyName) {
//     return NextResponse.json({ error: 'Fill in every field.' }, { status: 400 });
//   }
//   if (!email.includes('@') || email.length < 3) {
//     return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
//   }
//   if (password.length < 8) {
//     return NextResponse.json(
//       { error: 'Use a password of at least 8 characters.' },
//       { status: 400 }
//     );
//   }

//   const existing = await prisma.user.findUnique({ where: { email } });
//   if (existing) {
//     return NextResponse.json(
//       { error: 'An account with that email already exists.' },
//       { status: 409 }
//     );
//   }

//   // A readable slug from the company name; add a short suffix if taken.
//   let slug = slugify(companyName) || 'company';
//   const slugTaken = await prisma.company.findUnique({ where: { slug } });
//   if (slugTaken) slug = `${slug}-${crypto.randomBytes(3).toString('hex')}`;

//   const passwordHash = await hashPassword(password);

//   let created;
//   try {
//     created = await prisma.$transaction(async (tx) => {
//       const company = await tx.company.create({ data: { name: companyName, slug } });
//       const user = await tx.user.create({
//         data: {
//           name,
//           email,
//           passwordHash,
//           memberships: { create: { companyId: company.id, role: 'ADMIN' } },
//         },
//       });
//       return { company, user };
//     });
//   } catch (err) {
//     // Unique-constraint race (email or slug taken between check and write).
//     if (err && err.code === 'P2002') {
//       return NextResponse.json(
//         { error: 'That email or company name is already taken.' },
//         { status: 409 }
//       );
//     }
//     throw err;
//   }

//   const ip =
//     req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
//     req.headers.get('x-real-ip') ??
//     null;

//   // Signs them in immediately, exactly like the login route.
//   await createSession(created.user.id, {
//     ip,
//     userAgent: req.headers.get('user-agent'),
//   });

//   await logActivity({
//     action: ACTIONS.COMPANY_CREATED,
//     userId: created.user.id,
//     companyId: created.company.id,
//     detail: { company: companyName, viaSignup: true },
//     req,
//   });

//   // Record the sign-in too, exactly like the login route, so a new
//   // admin's first session shows up in the activity feed.
//   await logActivity({ action: ACTIONS.LOGIN, userId: created.user.id, req });

//   return NextResponse.json({ ok: true });
// }
