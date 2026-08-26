import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyPassword } from '@/lib/auth';
import { shareCookieName, shareCookieValue } from '@/lib/share-links';

// POST /api/s/[token]/verify  -> check a share link's password, set a cookie
export async function POST(req, { params }) {
  const { token } = await params;
  const { password } = await req.json().catch(() => ({}));

  const link = await prisma.shareLink.findUnique({ where: { token } });

  const now = Date.now();
  const invalid =
    !link ||
    link.revokedAt ||
    (link.expiresAt && link.expiresAt.getTime() <= now);
  if (invalid) return NextResponse.json({ error: 'Link unavailable.' }, { status: 404 });

  if (!link.passwordHash) return NextResponse.json({ ok: true });

  const ok =
    typeof password === 'string' && (await verifyPassword(password, link.passwordHash));
  if (!ok) return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });

  const res = NextResponse.json({ ok: true });
  const maxAge = link.expiresAt
    ? Math.max(1, Math.floor((link.expiresAt.getTime() - now) / 1000))
    : 60 * 60;
  res.cookies.set(shareCookieName(link), shareCookieValue(link), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: `/s/${token}`,
    maxAge,
  });
  return res;
}