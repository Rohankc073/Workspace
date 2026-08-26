import { ACTIONS, logActivity } from "@/lib/activity";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { makeReadableKey, saveObject } from "@/lib/storage";
import { NextResponse } from "next/server";

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const form = await req.formData();
  const upload = form.get("file");
  const companyId = form.get("companyId");
  const folderId = form.get("folderId") || null;

  if (!upload || typeof upload === "string") {
    return NextResponse.json(
      { error: "Choose a file to upload." },
      { status: 400 },
    );
  }

  // The user must belong to the company they are uploading into.
  // Without this check, anyone could post another company's id.
  const member = user.memberships.find((m) => m.companyId === companyId);
  if (!member && !user.isSuperAdmin) {
    return NextResponse.json(
      { error: "You are not in that company." },
      { status: 403 },
    );
  }

  // The folder id also comes from the browser. Confirm it exists and
  // belongs to this company — permissions inherit down the folder tree,
  // so an unchecked id is a way to place a file under someone else's rules.
  if (folderId) {
    const folder = await prisma.folder.findUnique({ where: { id: folderId } });
    if (!folder || folder.companyId !== companyId || folder.deletedAt) {
      return NextResponse.json(
        { error: "That folder is not valid." },
        { status: 400 },
      );
    }
  }

  if (upload.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Files must be under 50 MB." },
      { status: 413 },
    );
  }

  const name = upload.name;
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  if (!extension) {
    return NextResponse.json(
      { error: "That file has no extension." },
      { status: 400 },
    );
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

  const buffer = Buffer.from(await upload.arrayBuffer());
  // Readable, collision-free path: "<Company Name>/<file name>.<ext>".
  const storageKey = await makeReadableKey({
    companyName: company.name,
    fileName: name,
    extension,
  });
  const size = await saveObject(storageKey, buffer);

  const file = await prisma.file.create({
    data: {
      companyId,
      folderId,
      name,
      extension,
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
    detail: { name, size, folderId },
    req,
  });

  return NextResponse.json({ id: file.id, name: file.name });
}
