import { ACTIONS, logActivity } from "@/lib/activity";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

/** Three levels, matching what people already know from Google Docs. */
const LEVELS = {
  viewer: {
    canView: true,
    canEdit: false,
    canComment: false,
    canDownload: true,
    canPrint: true,
    canDelete: false,
  },
  commenter: {
    canView: true,
    canEdit: false,
    canComment: true,
    canDownload: true,
    canPrint: true,
    canDelete: false,
  },
  editor: {
    canView: true,
    canEdit: true,
    canComment: true,
    canDownload: true,
    canPrint: true,
    canDelete: false,
  },
};

/** Company admins and managers, or the person who created the file. */
async function canManage(user, file) {
  if (user.isSuperAdmin) return true;
  if (file.uploadedById === user.id) return true;
  const m = user.memberships.find((x) => x.companyId === file.companyId);
  return m?.role === "ADMIN" || m?.role === "MANAGER";
}

export async function GET(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const file = await prisma.file.findUnique({ where: { id } });
  if (!file) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!(await canManage(user, file))) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const [grants, members] = await Promise.all([
    prisma.permission.findMany({
      where: { fileId: id },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.membership.findMany({
      where: { companyId: file.companyId },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
  ]);

  return NextResponse.json({
    fileName: file.name,
    grants: grants.map((g) => ({
      id: g.id,
      userId: g.userId,
      userName: g.user?.name ?? null,
      role: g.role,
      level: levelOf(g),
    })),
    // Leave the current user out — you cannot share a file with yourself,
    // and seeing your own name in the list is confusing.
    members: members
      .filter((m) => m.user.id !== user.id)
      .map((m) => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
      })),
  });
}

export async function POST(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const file = await prisma.file.findUnique({ where: { id } });
  if (!file) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!(await canManage(user, file))) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const { userId, level } = await req.json();
  const rights = LEVELS[level];

  if (!userId || !rights) {
    return NextResponse.json(
      { error: "Pick a person and a level." },
      { status: 400 },
    );
  }

  if (userId === user.id) {
    return NextResponse.json(
      { error: "You already have access to this file." },
      { status: 400 },
    );
  }

  // The person must be in this file's company. Otherwise a manager
  // could share a document outside their own organisation.
  // The user is included so the activity log can record a NAME — an id
  // alone leaves the log reading "changed access to" with no one in it.
  const member = await prisma.membership.findFirst({
    where: { userId, companyId: file.companyId },
    include: { user: { select: { name: true, email: true } } },
  });
  if (!member) {
    return NextResponse.json(
      { error: "That person is not in this company." },
      { status: 400 },
    );
  }

  const existing = await prisma.permission.findFirst({
    where: { fileId: id, userId },
  });

  if (existing) {
    await prisma.permission.update({
      where: { id: existing.id },
      data: rights,
    });
  } else {
    // Prisma 7 wants relations connected, not raw foreign keys, on create.
    // Reading by fileId in a where clause is still fine.
    await prisma.permission.create({
      data: {
        ...rights,
        file: { connect: { id } },
        user: { connect: { id: userId } },
      },
    });
  }

  await logActivity({
    action: ACTIONS.PERMISSION_CHANGE,
    userId: user.id,
    companyId: file.companyId,
    fileId: id,
    detail: {
      grantedTo: userId,
      grantedToName: member.user?.name ?? member.user?.email ?? null,
      level,
      // Sharing for the first time and changing an existing level read
      // differently in the log, so record which one happened.
      updated: Boolean(existing),
    },
    req,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const file = await prisma.file.findUnique({ where: { id } });
  if (!file) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!(await canManage(user, file))) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const { grantId } = await req.json();

  // Read the grant BEFORE deleting it — afterwards there's nothing left to
  // look the name up from, and the log would only have a dead id.
  const grant = await prisma.permission.findFirst({
    where: { id: grantId, fileId: id },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  await prisma.permission.deleteMany({ where: { id: grantId, fileId: id } });

  await logActivity({
    action: ACTIONS.PERMISSION_CHANGE,
    userId: user.id,
    companyId: file.companyId,
    fileId: id,
    detail: {
      removed: grantId,
      removedFrom: grant?.user?.id ?? null,
      removedFromName: grant?.user?.name ?? grant?.user?.email ?? null,
      removedRole: grant?.role ?? null,
    },
    req,
  });

  return NextResponse.json({ ok: true });
}

function levelOf(g) {
  if (g.canEdit) return "editor";
  if (g.canComment) return "commenter";
  return "viewer";
}
