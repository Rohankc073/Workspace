import { ACTIONS, logActivity } from "@/lib/activity";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteObject } from "@/lib/storage";
import { getArchiveCompany, moveFileToCompany } from "@/lib/transfer-files";
import { NextResponse } from "next/server";

function cleanDomain(raw) {
  return String(raw || "")
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^@/, "")
    .replace(/\/.*$/, "")
    .replace(/^\.+|\.+$/g, "");
}

function isDomain(d) {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(
    d,
  );
}

// PATCH /api/admin/companies/[id]
//   { restore: true }        -> bring a soft-deleted company back
//   { name, domain }         -> edit a live company
export async function PATCH(req, { params }) {
  const user = await getCurrentUser();
  if (!user?.isSuperAdmin) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  // --- Restore from trash ---
  if (body.restore === true) {
    const company = await prisma.company.findUnique({ where: { id } });
    if (!company) {
      return NextResponse.json(
        { error: "Company not found." },
        { status: 404 },
      );
    }
    if (company.isArchive) {
      return NextResponse.json(
        { error: "The archive isn't a company you can edit." },
        { status: 400 },
      );
    }
    if (company.deletedAt) {
      await prisma.company.update({ where: { id }, data: { deletedAt: null } });
      await logActivity({
        action: ACTIONS.COMPANY_UPDATED,
        userId: user.id,
        companyId: id,
        detail: { restored: true, name: company.name },
        req,
      });
    }
    return NextResponse.json({ ok: true, restored: true });
  }

  // --- Edit (live companies only) ---
  const company = await prisma.company.findUnique({ where: { id } });
  if (!company || company.deletedAt || company.isArchive) {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }

  const name = String(body.name || "").trim();
  const domain = cleanDomain(body.domain);

  if (name.length < 2) {
    return NextResponse.json(
      { error: "Give the company a name." },
      { status: 400 },
    );
  }
  if (!isDomain(domain)) {
    return NextResponse.json(
      { error: "Enter a valid company domain, e.g. acme.com." },
      { status: 400 },
    );
  }

  if (domain !== company.domain) {
    const clash = await prisma.company.findUnique({ where: { domain } });
    if (clash && clash.id !== id) {
      return NextResponse.json(
        { error: "That domain is already used by another company." },
        { status: 409 },
      );
    }
  }

  let updated;
  try {
    updated = await prisma.company.update({
      where: { id },
      data: { name, domain },
    });
  } catch (err) {
    if (err?.code === "P2002") {
      return NextResponse.json(
        { error: "That domain is already taken." },
        { status: 409 },
      );
    }
    throw err;
  }

  await logActivity({
    action: ACTIONS.COMPANY_UPDATED,
    userId: user.id,
    companyId: id,
    detail: {
      name,
      domain,
      prevName: company.name,
      prevDomain: company.domain,
    },
    req,
  });

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    domain: updated.domain,
  });
}

// DELETE /api/admin/companies/[id]
//   { confirmName }                          -> soft-delete (recoverable)
//   { confirmName, purge: true, fileAction } -> PERMANENT
//
// fileAction decides what happens to the documents:
//   "delete"   (default) destroy them and their bytes
//   "archive"  move them to the hidden archive company
//   "transfer" move them to `targetCompanyId`
export async function DELETE(req, { params }) {
  const user = await getCurrentUser();
  if (!user?.isSuperAdmin) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const { id } = await params;
  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }
  if (company.isArchive) {
    return NextResponse.json(
      { error: "The archive can't be deleted. Empty it first." },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const confirmName = String(body.confirmName || "").trim();

  // --- Permanent purge ---
  if (body.purge === true) {
    if (confirmName !== company.name) {
      return NextResponse.json(
        { error: "The name you typed doesn't match the company name." },
        { status: 400 },
      );
    }

    const fileAction = ["delete", "archive", "transfer"].includes(
      body.fileAction,
    )
      ? body.fileAction
      : "delete";

    const files = await prisma.file.findMany({
      where: { companyId: id },
      include: {
        versions: {
          select: {
            id: true,
            version: true,
            storageKey: true,
            changesKey: true,
          },
        },
      },
    });

    // ---- work out where the documents are going ----
    let target = null;

    if (fileAction === "archive") {
      target = await getArchiveCompany();
    } else if (fileAction === "transfer") {
      const targetId = String(body.targetCompanyId || "");
      if (!targetId) {
        return NextResponse.json(
          { error: "Choose a company to move the documents to." },
          { status: 400 },
        );
      }
      if (targetId === id) {
        return NextResponse.json(
          { error: "That's the company being deleted." },
          { status: 400 },
        );
      }
      target = await prisma.company.findFirst({
        where: { id: targetId, deletedAt: null, isArchive: false },
      });
      if (!target) {
        return NextResponse.json(
          { error: "That company no longer exists." },
          { status: 400 },
        );
      }
    }

    // ---- move them BEFORE the company goes, or the cascade takes them ----
    let moved = 0;
    let moveFailures = 0;

    if (target) {
      for (const f of files) {
        // The original company's name is stamped on the way in, so the
        // archive can still say where something came from once the company
        // itself no longer exists.
        moveFailures += await moveFileToCompany(f, target, {
          fromName: company.name,
        });
        moved += 1;
      }
    }

    // Disk keys to clean up afterwards — only for files actually being
    // destroyed. Transferred files now point at their new keys.
    const keys = new Set();
    if (!target) {
      for (const f of files) {
        if (f.storageKey) keys.add(f.storageKey);
        for (const v of f.versions) {
          if (v.storageKey) keys.add(v.storageKey);
          if (v.changesKey) keys.add(v.changesKey);
        }
      }
    }

    // Users whose ONLY company is this one (and who aren't super admins) are
    // deleted with it. Anyone who also belongs to another company is kept —
    // only their membership here goes away (via the company cascade).
    const soleUsers = await prisma.user.findMany({
      where: {
        isSuperAdmin: false,
        memberships: { some: { companyId: id }, every: { companyId: id } },
      },
      select: { id: true },
    });
    const soleUserIds = soleUsers.map((u) => u.id);

    // Deleting the company cascades to memberships, folders, files, file
    // versions, permissions and share links (per the schema's onDelete rules).
    // Anything moved above is no longer attached to it, so it survives.
    await prisma.$transaction([
      prisma.company.delete({ where: { id } }),
      ...(soleUserIds.length
        ? [prisma.user.deleteMany({ where: { id: { in: soleUserIds } } })]
        : []),
    ]);

    // Best-effort disk cleanup AFTER the DB is consistent. An orphaned byte on
    // disk is harmless; a DB row pointing at a missing file is not.
    for (const key of keys) {
      try {
        await deleteObject(key);
      } catch (err) {
        console.error("Purge: could not delete object", key, err);
      }
    }

    await logActivity({
      action: ACTIONS.COMPANY_DELETED,
      userId: user.id,
      companyId: null, // the company no longer exists
      detail: {
        purged: true,
        name: company.name,
        domain: company.domain,
        fileAction,
        filesDeleted: target ? 0 : files.length,
        filesMoved: moved,
        movedTo: target?.name ?? null,
        moveFailures,
        usersDeleted: soleUserIds.length,
      },
      req,
    });

    return NextResponse.json({
      ok: true,
      purged: true,
      fileAction,
      filesMoved: moved,
      filesDeleted: target ? 0 : files.length,
      movedTo: target?.name ?? null,
      moveFailures,
    });
  }

  // --- Soft delete (recoverable) ---
  if (company.deletedAt) {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }
  if (confirmName !== company.name) {
    return NextResponse.json(
      { error: "The name you typed doesn't match the company name." },
      { status: 400 },
    );
  }

  await prisma.company.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  // Sessions go too: soft-deleting a company locks its people out, and a
  // live session would let them keep working until it expired.
  await prisma.session.deleteMany({
    where: {
      user: {
        isSuperAdmin: false,
        memberships: { some: { companyId: id }, every: { companyId: id } },
      },
    },
  });

  await logActivity({
    action: ACTIONS.COMPANY_DELETED,
    userId: user.id,
    companyId: id,
    detail: { name: company.name, domain: company.domain },
    req,
  });

  return NextResponse.json({ ok: true });
}
