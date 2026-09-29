import { ACTIONS, logActivity } from "@/lib/activity";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteObject } from "@/lib/storage";
import { moveFileToCompany } from "@/lib/transfer-files";
import { NextResponse } from "next/server";

/**
 * Actions on one archived document.
 *
 * Super admins only — the archive holds documents from companies that no
 * longer exist, which by definition nobody else has a claim to.
 *
 * POST   { targetCompanyId }  move it into a live company
 * DELETE                      destroy it and its bytes
 */

async function loadArchivedFile(id) {
  const file = await prisma.file.findUnique({
    where: { id },
    include: {
      company: { select: { id: true, name: true, isArchive: true } },
      versions: {
        select: { id: true, version: true, storageKey: true, changesKey: true },
      },
    },
  });
  if (!file || !file.company?.isArchive) return null;
  return file;
}

export async function POST(req, { params }) {
  const user = await getCurrentUser();
  if (!user?.isSuperAdmin) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const { fileId } = await params;
  const file = await loadArchivedFile(fileId);
  if (!file) {
    return NextResponse.json(
      { error: "That document isn't in the archive." },
      { status: 404 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const targetId = String(body.targetCompanyId || "");

  if (!targetId) {
    return NextResponse.json(
      { error: "Choose a company to move it to." },
      { status: 400 },
    );
  }

  const target = await prisma.company.findFirst({
    where: { id: targetId, deletedAt: null, isArchive: false },
  });
  if (!target) {
    return NextResponse.json(
      { error: "That company no longer exists." },
      { status: 400 },
    );
  }

  const failures = await moveFileToCompany(file, target);

  await logActivity({
    action: ACTIONS.FILE_MOVED,
    userId: user.id,
    companyId: target.id,
    fileId: file.id,
    detail: {
      fromArchive: true,
      name: file.name,
      originalCompany: file.archivedFrom ?? null,
      toCompany: target.name,
      moveFailures: failures,
    },
    req,
  });

  return NextResponse.json({
    ok: true,
    movedTo: target.name,
    moveFailures: failures,
  });
}

export async function DELETE(req, { params }) {
  const user = await getCurrentUser();
  if (!user?.isSuperAdmin) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const { fileId } = await params;
  const file = await loadArchivedFile(fileId);
  if (!file) {
    return NextResponse.json(
      { error: "That document isn't in the archive." },
      { status: 404 },
    );
  }

  // Collect the keys BEFORE the rows go, so the disk can be cleaned after
  // the database is consistent.
  const keys = new Set();
  if (file.storageKey) keys.add(file.storageKey);
  for (const v of file.versions) {
    if (v.storageKey) keys.add(v.storageKey);
    if (v.changesKey) keys.add(v.changesKey);
  }

  await prisma.file.delete({ where: { id: file.id } });

  for (const key of keys) {
    try {
      await deleteObject(key);
    } catch (err) {
      console.error("Archive purge: could not delete object", key, err);
    }
  }

  await logActivity({
    action: ACTIONS.FILE_PURGE,
    userId: user.id,
    companyId: null,
    detail: {
      fromArchive: true,
      name: file.name,
      originalCompany: file.archivedFrom ?? null,
    },
    req,
  });

  return NextResponse.json({ ok: true });
}
