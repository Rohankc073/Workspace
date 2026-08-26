import { ACTIONS, logActivity } from "@/lib/activity";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { signPayload } from "@/lib/onlyoffice";
import { pdfToWord } from "@/lib/pdf-to-word";
import { resolveFilePermissions } from "@/lib/permissions";
import { makeReadableKey, readObject, saveObject } from "@/lib/storage";
import crypto from "crypto";
import { NextResponse } from "next/server";

const TARGETS = {
  docx: ["pdf"],
  doc: ["pdf", "docx"],
  odt: ["pdf", "docx"],
  xlsx: ["csv", "pdf"],
  xls: ["csv", "pdf", "xlsx"],
  csv: ["xlsx", "pdf"],
  pptx: ["pdf"],
  ppt: ["pdf", "pptx"],
  pdf: ["docx"],
};

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
  if (!permissions.canView) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const from = file.extension.toLowerCase();
  const to = String(
    (await req.json().catch(() => ({})))?.to || "",
  ).toLowerCase();

  const allowed = TARGETS[from] || [];
  if (!allowed.includes(to)) {
    return NextResponse.json(
      { error: `Cannot convert ${from} to ${to || "(nothing)"}.` },
      { status: 400 },
    );
  }

  let buffer;

  if (from === "pdf" && to === "docx") {
    try {
      const source = await readObject(file.storageKey);
      buffer = await pdfToWord(source, file.name);
    } catch (err) {
      console.error("iLovePDF conversion failed:", err);
      return NextResponse.json(
        { error: "PDF to Word conversion failed. Please try again." },
        { status: 502 },
      );
    }
  } else {
    buffer = await convertWithOnlyOffice(file, from, to);
    if (buffer instanceof NextResponse) return buffer;
  }

  const baseName = file.name.replace(/\.[^.]+$/, "");
  const newName = `${baseName}.${to}`;

  // The company name is the top folder on disk, so we need it for the key.
  const company = await prisma.company.findUnique({
    where: { id: file.companyId },
    select: { name: true },
  });

  // Readable, collision-free path: "<Company Name>/<file name>.<ext>".
  const storageKey = await makeReadableKey({
    companyName: company?.name,
    fileName: newName,
    extension: to,
  });
  const size = await saveObject(storageKey, buffer);

  const created = await prisma.file.create({
    data: {
      companyId: file.companyId,
      folderId: file.folderId ?? null,
      name: newName,
      extension: to,
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
    companyId: file.companyId,
    fileId: created.id,
    detail: {
      name: newName,
      convertedFrom: file.id,
      from,
      to,
      engine: from === "pdf" && to === "docx" ? "ilovepdf" : "onlyoffice",
    },
    req,
  });

  return NextResponse.json({ id: created.id, name: newName });
}

async function convertWithOnlyOffice(file, from, to) {
  const internal = process.env.APP_INTERNAL_URL;
  const office = process.env.ONLYOFFICE_PUBLIC_URL;

  const downloadToken = await signPayload({ fileId: file.id });
  const sourceUrl = `${internal}/api/files/${file.id}/download?token=${downloadToken}`;
  const key = crypto.randomBytes(12).toString("hex");

  const request = {
    async: false,
    filetype: from,
    outputtype: to,
    key,
    title: file.name,
    url: sourceUrl,
  };
  request.token = await signPayload(request);

  const deadline = Date.now() + 90_000;
  let resultUrl = null;

  while (Date.now() < deadline) {
    const resp = await fetch(`${office}/ConvertService.ashx`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(request),
    });
    if (!resp.ok) {
      return NextResponse.json(
        { error: `Conversion service returned ${resp.status}.` },
        { status: 502 },
      );
    }
    const data = await resp.json().catch(() => ({}));
    if (data.error) {
      return NextResponse.json(
        { error: `Conversion failed (code ${data.error}).` },
        { status: 502 },
      );
    }
    if (data.endConvert && data.fileUrl) {
      resultUrl = data.fileUrl;
      break;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  if (!resultUrl) {
    return NextResponse.json(
      { error: "Conversion timed out. The file may be too large." },
      { status: 504 },
    );
  }

  const res = await fetch(rewriteHost(resultUrl, office));
  if (!res.ok) {
    return NextResponse.json(
      { error: "Could not download the converted file." },
      { status: 502 },
    );
  }
  return Buffer.from(await res.arrayBuffer());
}

function rewriteHost(url, officeBase) {
  try {
    const original = new URL(url);
    const target = new URL(officeBase);
    original.protocol = target.protocol;
    original.host = target.host;
    return original.toString();
  } catch {
    return url;
  }
}
