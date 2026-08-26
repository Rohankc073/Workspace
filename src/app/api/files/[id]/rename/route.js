import { ACTIONS, logActivity } from "@/lib/activity";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveFilePermissions } from "@/lib/permissions";
import { copyObject, deleteObject, makeReadableKey } from "@/lib/storage";
import { NextResponse } from "next/server";

// PATCH /api/files/[id]/rename   { name }
// Renames a file's base name (extension stays fixed) and moves the current
// bytes to a matching readable path on disk. Old versions in .versions/ keep
// their own keys, so rollback is unaffected.
export async function PATCH(req, { params }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const file = await prisma.file.findUnique({ where: { id } });
  if (!file || file.deletedAt) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const permissions = await resolveFilePermissions(user, file);
  if (!permissions.canEdit) {
    return NextResponse.json(
      { error: "You cannot rename this file." },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => ({}));

  // Take just the base name; the extension never changes. Strip any extension
  // the user typed and any path-breaking characters.
  let base = String(body.name ?? "").trim();
  base = base.replace(/[\\/:*?"<>|]/g, "").trim();
  if (
    file.extension &&
    base.toLowerCase().endsWith("." + file.extension.toLowerCase())
  ) {
    base = base.slice(0, -(file.extension.length + 1)).trim();
  }
  if (!base) {
    return NextResponse.json(
      { error: "Give the file a name." },
      { status: 400 },
    );
  }

  const newName = file.extension ? `${base}.${file.extension}` : base;
  if (newName === file.name) {
    return NextResponse.json({ ok: true, name: newName }); // nothing to do
  }

  // Company name is the top folder on disk.
  const company = await prisma.company.findUnique({
    where: { id: file.companyId },
    select: { name: true },
  });

  // Build a fresh readable key and move the bytes there. Keep the old bytes
  // until the DB is updated, so a mid-way failure never loses the file.
  const oldKey = file.storageKey;
  let newKey = oldKey;
  let moved = false;
  try {
    newKey = await makeReadableKey({
      companyName: company?.name,
      fileName: newName,
      extension: file.extension,
    });
    if (newKey !== oldKey) {
      await copyObject(oldKey, newKey);
      moved = true;
    }
  } catch (err) {
    console.error("Rename: could not move file on disk:", err);
    // Fall back to renaming in the app only, leaving bytes where they are.
    newKey = oldKey;
    moved = false;
  }

  try {
    await prisma.file.update({
      where: { id },
      data: { name: newName, storageKey: newKey },
    });
  } catch (err) {
    // DB update failed — undo the disk copy so nothing is orphaned.
    if (moved) {
      try {
        await deleteObject(newKey);
      } catch {}
    }
    throw err;
  }

  // The DB now points at the new key; the old copy is safe to remove.
  if (moved) {
    try {
      await deleteObject(oldKey);
    } catch (err) {
      console.error("Rename: could not remove old file copy:", err);
    }
  }

  await logActivity({
    action: ACTIONS.FILE_MOVED,
    userId: user.id,
    companyId: file.companyId,
    fileId: file.id,
    detail: { renamed: true, from: file.name, to: newName },
    req,
  });

  return NextResponse.json({ ok: true, name: newName });
}
