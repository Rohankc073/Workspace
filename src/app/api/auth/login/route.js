import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyPassword, createSession } from '@/lib/auth';
import { logActivity, ACTIONS } from '@/lib/activity';

export async function POST(req) {
  const { email, password } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: 'Enter your email and password.' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  // One message for "no such user" and "wrong password" alike. Telling
  // them apart lets an attacker discover which emails are registered.
  const ok = user && user.isActive && (await verifyPassword(password, user.passwordHash));

  if (!ok) {
    await logActivity({
      action: ACTIONS.LOGIN_FAILED,
      userId: user?.id ?? null,
      detail: { email },
      req,
    });
    return NextResponse.json({ error: 'Those details did not match.' }, { status: 401 });
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    null;

  await createSession(user.id, { ip, userAgent: req.headers.get('user-agent') });

  await logActivity({ action: ACTIONS.LOGIN, userId: user.id, req });

  return NextResponse.json({ ok: true });
}