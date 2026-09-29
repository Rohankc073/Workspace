import { ACTIONS, logActivity } from "@/lib/activity";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

/**
 * Transfer everything one person created to someone else.
 *
 * Exists because ownership is now what grants permanent deletion: only the
 * creator may purge a file. When someone leaves, their documents would
 * otherwise be undeletable by anyone. Reassigning them makes that a normal
 * change of owner rather than a special case.
 *
 * Files AND folders move together — a folder whose creator has gone has the
 * same problem as a file.
 *
 * GET  -> who can receive them, and how much there is to move
 * POST -> { toUserId } does the transfer
 */

/** Companies the caller may act in. Super admins may act anywhere. */
function adminCompanyIds(user) {
  return user.memberships
    .filter((m) => m.role === "ADMIN")
    .map((m) => m.companyId);
}

/**
 * Which companies this transfer may touch.
 *
 * The intersection of: companies the caller administers, and companies the
 * RECIPIENT belongs to. Without the second half a transfer could hand
 * someone documents in a company they aren't a member of — a cross-company
 * leak dressed up as tidying.
 */
function scopeFor(caller, recipientCompanyIds, ownerCompanyIds) {
  const recipientSet = new Set(recipientCompanyIds);
  const ownerSet = new Set(ownerCompanyIds);

  const candidate = caller.isSuperAdmin
    ? [...ownerSet]
    : adminCompanyIds(caller).filter((id) => ownerSet.has(id));

  return candidate.filter((id) => recipientSet.has(id));
}

async function companyIdsOf(userId) {
  const rows = await prisma.membership.findMany({
    where: { userId },
    select: { companyId: true },
  });
  return rows.map((r) => r.companyId);
}

/** Can the caller manage this person at all? */
async function mayManage(caller, targetId) {
  if (caller.isSuperAdmin) return true;
  const mine = adminCompanyIds(caller);
  if (mine.length === 0) return false;
  const theirs = await companyIdsOf(targetId);
  return theirs.some((id) => mine.includes(id));
}

// GET /api/admin/users/[id]/transfer-files
export async function GET(req, { params }) {
  const { id } = await params;

  const caller = await getCurrentUser();
  if (!caller) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  if (!(await mayManage(caller, id))) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const owner = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!owner) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const ownerCompanies = await companyIdsOf(id);
  const reachable = caller.isSuperAdmin
    ? ownerCompanies
    : ownerCompanies.filter((c) => adminCompanyIds(caller).includes(c));

  // Trashed files are counted too: they still need an owner who can purge
  // them, which is the whole reason this endpoint exists.
  const [fileCount, folderCount, members] = await Promise.all([
    prisma.file.count({
      where: { uploadedById: id, companyId: { in: reachable } },
    }),
    prisma.folder.count({
      where: { createdById: id, companyId: { in: reachable } },
    }),
    prisma.user.findMany({
      where: {
        id: { not: id },
        isActive: true,
        memberships: { some: { companyId: { in: reachable } } },
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
  ]);

  return NextResponse.json({
    ownerName: owner.name,
    fileCount,
    folderCount,
    candidates: members,
  });
}

// POST /api/admin/users/[id]/transfer-files  { toUserId }
export async function POST(req, { params }) {
  const { id } = await params;

  const caller = await getCurrentUser();
  if (!caller) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  if (!(await mayManage(caller, id))) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const toUserId = typeof body.toUserId === "string" ? body.toUserId : "";

  if (!toUserId) {
    return NextResponse.json(
      { error: "Choose who receives them." },
      { status: 400 },
    );
  }
  if (toUserId === id) {
    return NextResponse.json(
      { error: "That's the same person." },
      { status: 400 },
    );
  }

  const [owner, recipient] = await Promise.all([
    prisma.user.findUnique({ where: { id }, select: { id: true, name: true } }),
    prisma.user.findUnique({
      where: { id: toUserId },
      select: { id: true, name: true, isActive: true },
    }),
  ]);

  if (!owner || !recipient) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (!recipient.isActive) {
    return NextResponse.json(
      { error: "That account is disabled — pick someone who can sign in." },
      { status: 400 },
    );
  }

  const [ownerCompanies, recipientCompanies] = await Promise.all([
    companyIdsOf(id),
    companyIdsOf(toUserId),
  ]);

  const scope = scopeFor(caller, recipientCompanies, ownerCompanies);

  if (scope.length === 0) {
    return NextResponse.json(
      {
        error:
          "They share no company you manage. Add them to the right company first.",
      },
      { status: 400 },
    );
  }

  // updateMany rather than a loop: one statement, and nothing is left
  // half-transferred if the connection drops midway.
  const [files, folders] = await prisma.$transaction([
    prisma.file.updateMany({
      where: { uploadedById: id, companyId: { in: scope } },
      data: { uploadedById: toUserId },
    }),
    prisma.folder.updateMany({
      where: { createdById: id, companyId: { in: scope } },
      data: { createdById: toUserId },
    }),
  ]);

  await logActivity({
    action: ACTIONS.PERMISSION_CHANGE,
    userId: caller.id,
    companyId: scope.length === 1 ? scope[0] : null,
    detail: {
      transfer: true,
      fromUserId: id,
      fromName: owner.name,
      toUserId,
      toName: recipient.name,
      files: files.count,
      folders: folders.count,
    },
    req,
  });

  return NextResponse.json({
    ok: true,
    files: files.count,
    folders: folders.count,
    toName: recipient.name,
  });
}
