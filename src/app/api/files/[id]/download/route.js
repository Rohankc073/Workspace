import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { readObject } from '@/lib/storage';
import { verifyToken } from '@/lib/onlyoffice';
import { getCurrentUser } from '@/lib/auth';
import { resolveFilePermissions } from '@/lib/permissions';
import { logActivity, ACTIONS } from '@/lib/activity';

/**
 * Two very different callers reach this route:
 *
 *  1. The OnlyOffice container — a server, no cookies. Its credential
 *     is the signed token naming exactly one file.
 *  2. A person clicking Download — has a session, so we check their
 *     permissions properly and record the download.
 *
 * Each path has its own check. Neither borrows the other's.
 */
export async function GET(req, { params }) {
  const { id } = await params;
  const token = req.nextUrl.searchParams.get('token');
  const wanted = req.nextUrl.searchParams.get('version');

  const file = await prisma.file.findUnique({ where: { id } });
  if (!file || file.deletedAt) {
    return NextResponse.json({ error: 'File not found.' }, { status: 404 });
  }

  // --- Path 1: OnlyOffice, holding a signed token ---
  if (token) {
    let payload;
    try {
      payload = await verifyToken(token);
    } catch {
      return NextResponse.json({ error: 'Invalid or expired token.' }, { status: 401 });
    }

    if (payload.fileId !== id) {
      return NextResponse.json({ error: 'Token does not match this file.' }, { status: 403 });
    }

    // When showing version history, OnlyOffice asks for older versions
    // as well as the current one.
    if (wanted && Number(wanted) !== file.version) {
      const old = await prisma.fileVersion.findFirst({
        where: { fileId: id, version: Number(wanted) },
      });
      if (!old) {
        return NextResponse.json({ error: 'No such version.' }, { status: 404 });
      }
      return serve(file, await readObject(old.storageKey));
    }

    return serve(file, await readObject(file.storageKey));
  }

  // --- Path 2: a person in a browser ---
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  }

  const permissions = await resolveFilePermissions(user, file);
  if (!permissions.canDownload) {
    return NextResponse.json({ error: 'You cannot download this file.' }, { status: 403 });
  }

  // Matching on fileId as well as version is essential — otherwise
  // someone could fetch another file's version by number.
  let storageKey = file.storageKey;
  let versionLabel = file.version;

  if (wanted) {
    const v = await prisma.fileVersion.findFirst({
      where: { fileId: id, version: Number(wanted) },
    });
    if (!v) {
      return NextResponse.json({ error: 'That version does not exist.' }, { status: 404 });
    }
    storageKey = v.storageKey;
    versionLabel = v.version;
  }

  await logActivity({
    action: ACTIONS.FILE_DOWNLOAD,
    userId: user.id,
    companyId: file.companyId,
    fileId: file.id,
    detail: { version: versionLabel },
    req,
  });

  return serve(file, await readObject(storageKey));
}

function serve(file, buffer) {
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      'Content-Length': String(buffer.length),
    },
  });
}