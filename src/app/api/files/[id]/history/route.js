import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { signPayload } from "@/lib/onlyoffice";
import { resolveFilePermissions } from "@/lib/permissions";
import { NextResponse } from "next/server";

/**
 * Feeds OnlyOffice's own version-history panel.
 *
 * ?version=N returns the files for one version, so it can highlight
 * what changed. Without it, returns the whole list.
 */
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
    orderBy: { version: "asc" },
    include: { createdBy: { select: { id: true, name: true } } },
  });

  const internal = process.env.APP_INTERNAL_URL;
  const wanted = req.nextUrl.searchParams.get("version");

  // --- One version, with the data needed to highlight its changes ---
  if (wanted) {
    const n = Number(wanted);
    const current = versions.find((v) => v.version === n);
    if (!current) {
      return NextResponse.json({ error: "No such version." }, { status: 404 });
    }

    const previous = versions.find((v) => v.version === n - 1);
    const dlToken = await signPayload({ fileId: id });

    const data = {
      fileType: file.extension,
      key: `${file.id}-v${current.version}`,
      url: `${internal}/api/files/${id}/download?token=${dlToken}&version=${current.version}`,
      version: current.version,
    };

    // Highlighting needs all three: the previous file, its key, and
    // the changes archive. Missing any one, OnlyOffice shows the
    // version without highlighting rather than failing.
    if (previous && current.changesKey) {
      data.previous = {
        fileType: file.extension,
        key: `${file.id}-v${previous.version}`,
        url: `${internal}/api/files/${id}/download?token=${dlToken}&version=${previous.version}`,
      };
      data.changesUrl = `${internal}/api/files/${id}/changes?token=${dlToken}&version=${current.version}`;
    }

    // OnlyOffice validates this token against the payload it receives.
    data.token = await signPayload(data);

    return NextResponse.json(data);
  }

  // --- The whole list, for the side panel ---
  return NextResponse.json({
    currentVersion: file.version,
    history: versions.map((v) => ({
      created: v.createdAt.toISOString().slice(0, 19).replace("T", " "),
      key: `${file.id}-v${v.version}`,
      version: v.version,
      user: {
        id: v.createdBy?.id ?? "unknown",
        name: v.createdBy?.name ?? "Unknown",
      },
      ...(v.changesSummary ? { changes: v.changesSummary } : {}),
      ...(v.serverVersion ? { serverVersion: v.serverVersion } : {}),
    })),
  });
}
