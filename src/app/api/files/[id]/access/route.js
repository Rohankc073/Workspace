import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { visibleFilesWhere } from "@/lib/permissions";
import { NextResponse } from "next/server";

/** Role-grant labels (a grant to a whole role rather than one person). */
const ROLE_LABELS = {
  ADMIN: "Company admins",
  MANAGER: "Managers",
  EDITOR: "Editors",
  VIEWER: "Viewers",
};

function levelOf(g) {
  if (g.canEdit) return "editor";
  if (g.canComment) return "commenter";
  return "viewer";
}

// GET /api/files/[id]/access
// Read-only. Anyone who can VIEW the file can see who created it and who it's
// shared with. Changing access still goes through /permissions (manager-only).
export async function GET(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  // Reuse the app's real visibility rules — if the file isn't in this set,
  // the user can't see it, so they can't see its access list either.
  const file = await prisma.file.findFirst({
    where: { id, ...(await visibleFilesWhere(user)) },
    select: { id: true, name: true, uploadedById: true },
  });
  if (!file) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const [grants, creator] = await Promise.all([
    prisma.permission.findMany({
      where: { fileId: id },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    file.uploadedById
      ? prisma.user.findUnique({
          where: { id: file.uploadedById },
          select: { name: true, email: true },
        })
      : Promise.resolve(null),
  ]);

  const access = grants.map((g) => ({
    id: g.id,
    kind: g.userId ? "user" : "role",
    name: g.userId
      ? (g.user?.name ?? g.user?.email ?? "Unknown")
      : (ROLE_LABELS[g.role] ?? `${g.role}`),
    email: g.user?.email ?? null,
    level: levelOf(g),
  }));

  return NextResponse.json({
    fileName: file.name,
    creator: creator ? { name: creator.name, email: creator.email } : null,
    access,
  });
}
