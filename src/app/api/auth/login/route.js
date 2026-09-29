import { ACTIONS, logActivity } from "@/lib/activity";
import { createSession, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

/**
 * Throttling is counted from the Activity table rather than an in-memory map.
 * That means it survives a PM2 restart and stays correct if the app is ever
 * run with more than one worker.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_EMAIL = 5;
const MAX_PER_IP = 30;

/** Length caps. bcrypt on a multi-megabyte string is a free CPU burn. */
const MAX_EMAIL_LEN = 254;
const MAX_PASSWORD_LEN = 200;

/**
 * IP throttling is OFF unless LOGIN_IP_LIMIT=true. Behind the Hyper-V switch
 * every request arrives from the same gateway address, so counting by IP
 * would throttle the whole company as one client. Turn this on only once a
 * reverse proxy is setting x-forwarded-for with real client addresses.
 */
const IP_LIMIT_ENABLED = process.env.LOGIN_IP_LIMIT === "true";

/**
 * A structurally valid bcrypt hash that nothing matches. When the email is
 * unknown we still run a comparison against this, so a missing account takes
 * about as long as a wrong password.
 */
const DUMMY_HASH =
  "$2b$12$3Zk1qW8oQ0YbN2vX9pL7ceR4tS6uV8wX0yZ2aB4cD6eF8gH0iJ2kL";

function clientIp(req) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    null
  );
}

export async function POST(req) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Enter your email and password." },
      { status: 400 },
    );
  }

  const { email, password } = body;

  if (typeof email !== "string" || typeof password !== "string") {
    return NextResponse.json(
      { error: "Enter your email and password." },
      { status: 400 },
    );
  }

  const cleanEmail = email.toLowerCase().trim();

  if (!cleanEmail || !password) {
    return NextResponse.json(
      { error: "Enter your email and password." },
      { status: 400 },
    );
  }

  if (cleanEmail.length > MAX_EMAIL_LEN || password.length > MAX_PASSWORD_LEN) {
    return NextResponse.json(
      { error: "Those details did not match." },
      { status: 401 },
    );
  }

  const ip = clientIp(req);
  const since = new Date(Date.now() - WINDOW_MS);

  // ---- throttle: too many recent failures for this email? ----
  const emailFailures = await prisma.activity.count({
    where: {
      action: ACTIONS.LOGIN_FAILED,
      createdAt: { gte: since },
      detail: { path: ["email"], equals: cleanEmail },
    },
  });

  if (emailFailures >= MAX_PER_EMAIL) {
    return NextResponse.json(
      {
        error:
          "Too many failed attempts. Wait 15 minutes and try again, or ask your administrator.",
      },
      { status: 429, headers: { "Retry-After": "900" } },
    );
  }

  // ---- throttle: too many recent failures from this address? ----
  if (IP_LIMIT_ENABLED && ip) {
    const ipFailures = await prisma.activity.count({
      where: {
        action: ACTIONS.LOGIN_FAILED,
        createdAt: { gte: since },
        ip,
      },
    });

    if (ipFailures >= MAX_PER_IP) {
      return NextResponse.json(
        {
          error: "Too many failed attempts from this network. Try again later.",
        },
        { status: 429, headers: { "Retry-After": "900" } },
      );
    }
  }

  // Memberships come along so we can tell whether every company this person
  // belongs to has been deleted.
  const user = await prisma.user.findUnique({
    where: { email: cleanEmail },
    include: {
      memberships: { include: { company: { select: { deletedAt: true } } } },
    },
  });

  // One message for "no such user" and "wrong password" alike. The
  // comparison runs even when there's no user, against a hash nothing
  // matches, so both paths cost roughly the same time.
  let passwordOk = false;
  try {
    passwordOk = await verifyPassword(
      password,
      user?.passwordHash ?? DUMMY_HASH,
    );
  } catch {
    passwordOk = false;
  }

  const ok = Boolean(user && user.isActive && passwordOk);

  if (!ok) {
    await logActivity({
      action: ACTIONS.LOGIN_FAILED,
      userId: user?.id ?? null,
      companyId: null,
      detail: {
        email: cleanEmail,
        reason: user ? "bad-credentials" : "no-account",
      },
      req,
    });

    return NextResponse.json(
      { error: "Those details did not match." },
      { status: 401 },
    );
  }

  /**
   * Deleting a company locks its people out.
   *
   * Only when EVERY company they belong to is gone: somebody who works
   * across two clients keeps working when one closes. Super admins are
   * exempt — they hold no memberships at all, which would otherwise read as
   * "all their companies are deleted".
   *
   * The credentials were correct, so this is a different message from a
   * failed sign-in. Saying "those details did not match" would send them
   * round in circles resetting a password that was never the problem.
   */
  if (!user.isSuperAdmin && user.memberships.length > 0) {
    const allClosed = user.memberships.every((m) => m.company?.deletedAt);
    if (allClosed) {
      await logActivity({
        action: ACTIONS.LOGIN_FAILED,
        userId: user.id,
        detail: { email: cleanEmail, reason: "company-closed" },
        req,
      });
      return NextResponse.json(
        {
          error:
            "Your company account has been closed. Contact your administrator.",
        },
        { status: 403 },
      );
    }
  }

  await createSession(user.id, {
    ip,
    userAgent: req.headers.get("user-agent"),
  });

  await logActivity({ action: ACTIONS.LOGIN, userId: user.id, req });

  return NextResponse.json({ ok: true });
}
