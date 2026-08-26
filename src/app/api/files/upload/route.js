import { ACTIONS, logActivity } from "@/lib/activity";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { documentTypeFor, makeReadableKey, saveObject } from "@/lib/storage";
import { NextResponse } from "next/server";

const MAX_BYTES = 100 * 1024 * 1024; // 100 MB per file

// POST /api/files/upload  (multipart: file, companyId, folderId?)
export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const companyId = form.get("companyId");
  const folderId = form.get("folderId") || null;

  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No file was sent." }, { status: 400 });
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
      { error: "Viewers cannot upload documents." },
      { status: 403 },
    );
  }

  // Same guard as blank-file creation: never trust a folder id blindly.
  if (folderId) {
    const folder = await prisma.folder.findUnique({ where: { id: folderId } });
    if (!folder || folder.companyId !== companyId || folder.deletedAt) {
      return NextResponse.json(
        { error: "That folder is not valid." },
        { status: 400 },
      );
    }
  }

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

  const original = (file.name || "Untitled").trim();
  const dot = original.lastIndexOf(".");
  const ext = dot > 0 ? original.slice(dot + 1).toLowerCase() : "";
  const baseRaw = dot > 0 ? original.slice(0, dot) : original;
  const base = baseRaw.replace(/[\\/:*?"<>|]/g, "") || "Untitled";

  if (!documentTypeFor(ext)) {
    return NextResponse.json(
      { error: "That file type cannot be opened here." },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length === 0) {
    return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  }
  if (buffer.length > MAX_BYTES) {
    return NextResponse.json(
      { error: "That file is too large (100 MB max)." },
      { status: 413 },
    );
  }

  const fullName = `${base}.${ext}`;
  // Readable, collision-free path: "<Company Name>/<file name>.<ext>".
  const storageKey = await makeReadableKey({
    companyName: company.name,
    fileName: fullName,
    extension: ext,
  });
  const size = await saveObject(storageKey, buffer);

  const created = await prisma.file.create({
    data: {
      companyId,
      folderId: folderId ?? null,
      name: fullName,
      extension: ext,
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
    fileId: created.id,
    detail: { name: fullName, uploaded: true, folderId: folderId ?? null },
    req,
  });

  return NextResponse.json({ id: created.id });
}
