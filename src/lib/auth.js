import bcrypt from "bcryptjs";
import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "./db";

const COOKIE_NAME = "atlas_session";
const SESSION_DAYS = 7;

export function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

/** Creates a session row and sets the cookie. */
export async function createSession(userId, { ip, userAgent } = {}) {
  // 32 random bytes. Not guessable, not derived from the user id.
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: { userId, token, expiresAt, ip, userAgent },
  });

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true, // JavaScript in the page cannot read it
    sameSite: "lax", // not sent from other sites
    // secure: process.env.NODE_ENV === 'production',

    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    expires: expiresAt,
  });

  return token;
}

// How stale lastSeenAt must be before we bother writing again. Keeps this to
// at most one write per user per minute, instead of one per request.
const SEEN_THROTTLE_MS = 60 * 1000;

/** Returns the logged-in user, or null. */
export async function getCurrentUser() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: {
      user: {
        include: { memberships: { include: { company: true } } },
      },
    },
  });

  if (!session || session.expiresAt < new Date()) return null;
  if (!session.user.isActive) return null;

  // Mark the user as recently active, throttled so it's not a write on every
  // request. Best-effort: presence tracking must never break auth, so a
  // failure here is swallowed. Update the in-memory value so this request
  // already reflects "online".
  const now = new Date();
  const last = session.user.lastSeenAt;
  if (!last || now.getTime() - new Date(last).getTime() > SEEN_THROTTLE_MS) {
    session.user.lastSeenAt = now;
    prisma.user
      .update({ where: { id: session.user.id }, data: { lastSeenAt: now } })
      .catch((err) => console.error("lastSeenAt update failed:", err));
  }

  return session.user;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { token } });
  }
  jar.delete(COOKIE_NAME);
}
