import { ACTIONS, logActivity } from "@/lib/activity";
import { prisma } from "@/lib/db";
import { verifyToken } from "@/lib/onlyoffice";
import {
  copyObject,
  makeStorageKey,
  saveObject,
  versionKey,
} from "@/lib/storage";
import { NextResponse } from "next/server";

export async function POST(req) {
  const body = await req.json();

  const header = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const token = header || body.token;

  if (!token) {
    return NextResponse.json(
      { error: 1, message: "No token" },
      { status: 401 },
    );
  }

  try {
    await verifyToken(token);
  } catch {
    return NextResponse.json(
      { error: 1, message: "Bad token" },
      { status: 401 },
    );
  }

  const fileId = String(body.key || "").split("-v")[0];
  const file = await prisma.file.findUnique({ where: { id: fileId } });

  if (!file) {
    return NextResponse.json({ error: 0 });
  }

  const status = body.status;

  if (status === 1) {
    for (const action of body.actions ?? []) {
      const realUserId = await resolveRealUser(action.userid);
      await logActivity({
        action: action.type === 1 ? ACTIONS.EDIT_JOIN : ACTIONS.EDIT_LEAVE,
        userId: realUserId,
        companyId: file.companyId,
        fileId: file.id,
        detail: realUserId
          ? null
          : { editorId: action.userid ?? null, guest: true },
      });
    }
    return NextResponse.json({ error: 0 });
  }

  if (status === 2 || status === 6) {
    const res = await fetch(rewriteHost(body.url));

    if (!res.ok) {
      console.error("Could not fetch saved document:", res.status);
      return NextResponse.json({ error: 0 });
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const nextVersion = file.version + 1;

    // Keep the current file at its readable key and overwrite it in place, so
    // "Idea Town/report.docx" never turns back into a random blob. Before the
    // overwrite, archive the current version's bytes into a hidden .versions
    // folder and repoint that version's row, so rollback still works.
    let storageKey = file.storageKey;
    let archivedOk = false;
    const archivedKey = versionKey(
      file.storageKey,
      file.version,
      file.extension,
    );
    try {
      await copyObject(file.storageKey, archivedKey);
      await prisma.fileVersion.updateMany({
        where: {
          fileId: file.id,
          version: file.version,
          storageKey: file.storageKey,
        },
        data: { storageKey: archivedKey },
      });
      archivedOk = true;
    } catch (err) {
      console.error("Could not archive previous version:", err);
    }

    // If archiving failed, fall back to a fresh key so the old version's bytes
    // are never lost (this one save just won't keep the readable name).
    if (!archivedOk) {
      storageKey = makeStorageKey(file.companyId, file.extension);
    }

    const size = await saveObject(storageKey, buffer);

    let changesKey = null;
    let serverVersion = null;
    let changesSummary = null;

    if (body.changesurl) {
      try {
        const changesRes = await fetch(rewriteHost(body.changesurl));
        if (changesRes.ok) {
          const changesBuffer = Buffer.from(await changesRes.arrayBuffer());
          // Tuck the change archive into the same hidden .versions folder.
          changesKey = versionKey(storageKey, nextVersion, "changes.zip");
          await saveObject(changesKey, changesBuffer);
          serverVersion = body.history?.serverVersion ?? null;
          changesSummary = body.history?.changes ?? null;
        }
      } catch (err) {
        console.error("Could not fetch changes archive:", err);
      }
    }

    const realEditorId = await resolveRealUser(body.users?.[0]);

    await prisma.file.update({
      where: { id: file.id },
      data: {
        storageKey,
        size,
        version: nextVersion,
        versions: {
          create: {
            version: nextVersion,
            storageKey,
            size,
            changesKey,
            serverVersion,
            changesSummary,
            ...(realEditorId
              ? { createdBy: { connect: { id: realEditorId } } }
              : {}),
          },
        },
      },
    });

    await logActivity({
      action: ACTIONS.FILE_SAVE,
      userId: realEditorId,
      companyId: file.companyId,
      fileId: file.id,
      detail: {
        version: nextVersion,
        forced: status === 6,
        editors: body.users ?? [],
        guest: realEditorId ? false : true,
      },
    });
  }

  return NextResponse.json({ error: 0 });
}

async function resolveRealUser(editorId) {
  if (!editorId || typeof editorId !== "string") return null;
  if (editorId.startsWith("guest-")) return null;
  const user = await prisma.user.findUnique({
    where: { id: editorId },
    select: { id: true },
  });
  return user ? user.id : null;
}

function rewriteHost(url) {
  try {
    const original = new URL(url);
    const target = new URL(process.env.ONLYOFFICE_PUBLIC_URL);
    original.protocol = target.protocol;
    original.host = target.host;
    return original.toString();
  } catch {
    return url;
  }
}
