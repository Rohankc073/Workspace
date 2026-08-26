import { ACTIONS, logActivity } from "@/lib/activity";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveFilePermissions } from "@/lib/permissions";
import {
  copyObject,
  makeStorageKey,
  readObject,
  saveObject,
  versionKey,
} from "@/lib/storage";
import { NextResponse } from "next/server";

export async function GET(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const file = await prisma.file.findUnique({ where: { id } });
  if (!file || file.deletedAt) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const permissions = await resolveFilePermissions(user, file);
  if (!permissions.canView) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const versions = await prisma.fileVersion.findMany({
    where: { fileId: id },
    orderBy: { version: "desc" },
    include: { createdBy: { select: { name: true } } },
  });

  return NextResponse.json({
    fileName: file.name,
    current: file.version,
    canRestore: permissions.canEdit,
    canDownload: permissions.canDownload,
    versions: versions.map((v, i) => ({
      version: v.version,
      size: v.size,
      sizeDelta: i < versions.length - 1 ? v.size - versions[i + 1].size : null,
      by: v.createdBy?.name ?? "Unknown",
      at: v.createdAt,
    })),
  });
}

export async function POST(req, { params }) {
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
      { error: "You cannot change this file." },
      { status: 403 },
    );
  }

  const { version } = await req.json();

  const target = await prisma.fileVersion.findFirst({
    where: { fileId: id, version },
  });
  if (!target) {
    return NextResponse.json(
      { error: "That version does not exist." },
      { status: 404 },
    );
  }

  // Restoring adds a new version rather than rewinding. Nothing is
  // ever destroyed, so a mistaken restore is itself undoable.
  const buffer = await readObject(target.storageKey);
  const nextVersion = file.version + 1;

  // Same pattern as an edit-save: archive the current version's bytes to the
  // hidden .versions folder, then overwrite the readable file in place so its
  // name is preserved. Fall back to a fresh key if archiving fails.
  let storageKey = file.storageKey;
  let archivedOk = false;
  const archivedKey = versionKey(file.storageKey, file.version, file.extension);
  try {
    await copyObject(file.storageKey, archivedKey);
    await prisma.fileVersion.updateMany({
      where: { fileId: id, version: file.version, storageKey: file.storageKey },
      data: { storageKey: archivedKey },
    });
    archivedOk = true;
  } catch (err) {
    console.error("Could not archive current version before restore:", err);
  }
  if (!archivedOk) {
    storageKey = makeStorageKey(file.companyId, file.extension);
  }

  const size = await saveObject(storageKey, buffer);

  await prisma.file.update({
    where: { id },
    data: {
      storageKey,
      size,
      version: nextVersion,
      versions: {
        create: {
          version: nextVersion,
          storageKey,
          size,
          createdById: user.id,
        },
      },
    },
  });

  await logActivity({
    action: ACTIONS.FILE_RESTORE,
    userId: user.id,
    companyId: file.companyId,
    fileId: id,
    detail: { restoredFrom: version, newVersion: nextVersion },
    req,
  });

  return NextResponse.json({ ok: true, version: nextVersion });
}
