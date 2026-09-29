import { ACTIONS, logActivity } from "@/lib/activity";
import { getCurrentUser, hashPassword, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

const MIN_LENGTH = 12;
const MAX_LENGTH = 200;

/**
 * Change your OWN password.
 *
 * Separate from the admin reset in /api/admin/users/[id]: that one is a
 * privileged override and takes no current password. This one requires
 * proving you know the existing one, so a borrowed unlocked laptop can't be
 * used to lock the real owner out of their account.
 */
export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Something went wrong." },
      { status: 400 },
    );
  }

  const current = typeof body.current === "string" ? body.current : "";
  const next = typeof body.next === "string" ? body.next : "";

  if (!current || !next) {
    return NextResponse.json(
      { error: "Enter your current and new password." },
      { status: 400 },
    );
  }

  if (next.length < MIN_LENGTH) {
    return NextResponse.json(
      { error: `Use at least ${MIN_LENGTH} characters.` },
      { status: 400 },
    );
  }

  // bcrypt on a multi-megabyte string is a free way to burn CPU.
  if (next.length > MAX_LENGTH || current.length > MAX_LENGTH) {
    return NextResponse.json(
      { error: "That password is too long." },
      { status: 400 },
    );
  }

  if (next === current) {
    return NextResponse.json(
      { error: "That's your current password — pick a different one." },
      { status: 400 },
    );
  }

  // Read the hash fresh: the session's user object may be stale.
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });

  const ok = row && (await verifyPassword(current, row.passwordHash));
  if (!ok) {
    await logActivity({
      action: ACTIONS.LOGIN_FAILED,
      userId: user.id,
      detail: { context: "password-change", reason: "wrong-current" },
      req,
    });
    return NextResponse.json(
      { error: "That isn't your current password." },
      { status: 401 },
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(next) },
  });

  // Every session goes, including this one. If the old password was known to
  // someone else, leaving their session alive would defeat the change.
  await prisma.session.deleteMany({ where: { userId: user.id } });

  await logActivity({
    action: ACTIONS.PASSWORD_RESET,
    userId: user.id,
    detail: { self: true },
    req,
  });

  return NextResponse.json({ ok: true, signedOut: true });
}
