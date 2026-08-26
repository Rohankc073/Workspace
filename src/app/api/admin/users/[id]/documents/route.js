import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

// GET /api/admin/users/[id]/documents
// Documents created by a user. Super admins see them across every company;
// a company admin sees only the ones in companies they administer.
export async function GET(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const adminOf = user.memberships
    .filter((m) => m.role === "ADMIN")
    .map((m) => m.companyId);

  if (!user.isSuperAdmin && adminOf.length === 0) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { name: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const where = { uploadedById: id };
  // Company admins only see documents inside companies they manage.
  if (!user.isSuperAdmin) where.companyId = { in: adminOf };

  const files = await prisma.file.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { company: { select: { name: true } } },
  });

  return NextResponse.json({
    userName: target.name,
    documents: files.map((f) => ({
      id: f.id,
      name: f.name,
      company: f.company?.name ?? "—",
      size: f.size,
      createdAt: f.createdAt,
      trashed: Boolean(f.deletedAt),
    })),
  });
}
