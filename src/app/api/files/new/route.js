import { ACTIONS, logActivity } from "@/lib/activity";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { makeReadableKey, saveObject } from "@/lib/storage";
import fs from "fs/promises";
import { NextResponse } from "next/server";
import path from "path";

const KINDS = {
  spreadsheet: { ext: "xlsx", template: "blank.xlsx" },
  document: { ext: "docx", template: "blank.docx" },
  presentation: { ext: "pptx", template: "blank.pptx" },
};

export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const { kind, name, companyId, folderId } = await req.json();
  const spec = KINDS[kind];

  if (!spec) {
    return NextResponse.json(
      { error: "Unknown document type." },
      { status: 400 },
    );
  }

  const member = user.memberships.find((m) => m.companyId === companyId);
  if (!member && !user.isSuperAdmin) {
    return NextResponse.json(
      { error: "You are not in that company." },
      { status: 403 },
    );
  }

  if (member && member.role === "VIEWER" && !user.isSuperAdmin) {
    return NextResponse.json(
      { error: "Viewers cannot create documents." },
      { status: 403 },
    );
  }

  // Permissions inherit down the folder tree, so an unchecked folder id
  // is a way to place a file under rules that are not yours.
  if (folderId) {
    const folder = await prisma.folder.findUnique({ where: { id: folderId } });
    if (!folder || folder.companyId !== companyId || folder.deletedAt) {
      return NextResponse.json(
        { error: "That folder is not valid." },
        { status: 400 },
      );
    }
  }

  const safeName = (name || "Untitled").trim().replace(/[\\/:*?"<>|]/g, "");
  const fullName = `${safeName}.${spec.ext}`;

  // The company name is the top folder on disk, so we need it for the key.
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true },
  });
  if (!company) {
    return NextResponse.json(
      { error: "That company is not valid." },
      { status: 400 },
    );
  }

  const buffer = await fs.readFile(
    path.join(process.cwd(), "templates", spec.template),
  );

  // Readable, collision-free path: "<Company Name>/<file name>.<ext>".
  const storageKey = await makeReadableKey({
    companyName: company.name,
    fileName: fullName,
    extension: spec.ext,
  });
  const size = await saveObject(storageKey, buffer);

  const file = await prisma.file.create({
    data: {
      companyId,
      folderId: folderId ?? null,
      name: fullName,
      extension: spec.ext,
      size,
      storageKey,
      version: 1,
      uploadedById: user.id,
      versions: {
        create: { version: 1, storageKey, size, createdById: user.id },
      },
    },
  });

  await logActivity({
    action: ACTIONS.FILE_UPLOAD,
    userId: user.id,
    companyId,
    fileId: file.id,
    detail: { name: fullName, created: true, folderId: folderId ?? null },
    req,
  });

  return NextResponse.json({ id: file.id });
}
