import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { readObject } from '@/lib/storage';
import { verifyToken } from '@/lib/onlyoffice';

/**
 * Serves the changes archive for one version. OnlyOffice fetches this
 * server-to-server with no session, so the signed token is the credential.
 */
export async function GET(req, { params }) {
  const { id } = await params;
  const token = req.nextUrl.searchParams.get('token');
  const version = Number(req.nextUrl.searchParams.get('version'));

  if (!token) {
    return NextResponse.json({ error: 'Missing token.' }, { status: 401 });
  }

  let payload;
  try {
    payload = await verifyToken(token);
  } catch {
    return NextResponse.json({ error: 'Invalid token.' }, { status: 401 });
  }

  if (payload.fileId !== id) {
    return NextResponse.json({ error: 'Token does not match this file.' }, { status: 403 });
  }

  const record = await prisma.fileVersion.findFirst({
    where: { fileId: id, version },
  });

  if (!record?.changesKey) {
    return NextResponse.json({ error: 'No change data for that version.' }, { status: 404 });
  }

  const buffer = await readObject(record.changesKey);

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Length': String(buffer.length),
    },
  });
}