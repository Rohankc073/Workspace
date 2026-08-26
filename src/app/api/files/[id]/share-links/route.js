import { ACTIONS, logActivity } from "@/lib/activity";
import { getCurrentUser, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveFilePermissions } from "@/lib/permissions";
import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

/**
 * Who may mint or list share links for a file.
 * Super admins always; otherwise you need edit + delete on the file
 * (the manager-level grant). Keep this identical to your revoke route.
 */
async function mayManage(user, file) {
  if (user.isSuperAdmin) return true;
  const perms = await resolveFilePermissions(user, file);
  return Boolean(perms && perms.canEdit && perms.canDelete);
}

/** URL-safe, unguessable. 24 random bytes ~= 32 chars of base64url. */
function newToken() {
  return randomBytes(24).toString("base64url");
}

/**
 * Allowed link lifetimes. The dialog sends a key ('30m' | '1h' | '1d' | '7d' | 'never');
 * the timestamp is computed HERE so a tampered request can't mint a link with
 * an arbitrary lifetime. To add a preset, add it here AND in the dialog.
 *
 * `never` is stored as expiresAt = null, which the schema already documents as
 * "no expiry" and which every read path already treats as still-valid. A
 * permanent link can only be killed by revoking it.
 */
const EXPIRY_MS = {
  "30m": 30 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  never: null,
};
const DEFAULT_EXPIRY = "30m";

/** Whitelist lookup. Unknown / missing / tampered -> default. */
function resolveExpiry(raw) {
  const choice = Object.prototype.hasOwnProperty.call(EXPIRY_MS, raw)
    ? raw
    : DEFAULT_EXPIRY;
  const ms = EXPIRY_MS[choice];
  return { choice, expiresAt: ms === null ? null : new Date(Date.now() + ms) };
}

// POST /api/files/[id]/share-links  -> create an outside link
export async function POST(req, { params }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const file = await prisma.file.findUnique({ where: { id } });
  if (!file || file.deletedAt) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (!(await mayManage(user, file))) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  const canEdit = Boolean(body.canEdit);
  const canDownload = Boolean(body.canDownload);
  const password =
    typeof body.password === "string" ? body.password.trim() : "";

  // Lifetime: whitelist only, computed server-side.
  const { choice, expiresAt } = resolveExpiry(body.expiresIn);

  const link = await prisma.shareLink.create({
    data: {
      token: newToken(),
      fileId: file.id,
      canDownload,
      canEdit,
      passwordHash: password ? await hashPassword(password) : null,
      expiresAt,
      createdById: user.id,
    },
  });

  await logActivity({
    action: ACTIONS.PERMISSION_CHANGE,
    userId: user.id,
    companyId: file.companyId,
    fileId: file.id,
    detail: {
      shareLink: true,
      created: true,
      canDownload,
      canEdit,
      expiresIn: choice,
      permanent: expiresAt === null,
      hasPassword: Boolean(password),
    },
    req,
  });

  return NextResponse.json({
    ok: true,
    link: {
      id: link.id,
      token: link.token,
      canDownload: link.canDownload,
      canEdit: link.canEdit,
      hasPassword: Boolean(link.passwordHash),
      expiresAt: link.expiresAt,
      createdAt: link.createdAt,
    },
  });
}

// GET /api/files/[id]/share-links  -> list this file's links (for the dialog)
export async function GET(req, { params }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const file = await prisma.file.findUnique({ where: { id } });
  if (!file || file.deletedAt) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (!(await mayManage(user, file))) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const links = await prisma.shareLink.findMany({
    where: { fileId: file.id },
    orderBy: { createdAt: "desc" },
  });

  const now = Date.now();
  return NextResponse.json({
    links: links.map((l) => ({
      id: l.id,
      token: l.token,
      canDownload: l.canDownload,
      canEdit: l.canEdit,
      hasPassword: Boolean(l.passwordHash),
      expiresAt: l.expiresAt,
      revokedAt: l.revokedAt,
      createdAt: l.createdAt,
      active: !l.revokedAt && (!l.expiresAt || l.expiresAt.getTime() > now),
    })),
  });
}
