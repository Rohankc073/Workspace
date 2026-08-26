import { ACTIONS, logActivity } from "@/lib/activity";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteObject } from "@/lib/storage";
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
  if (!company || company.deletedAt) {
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
//   { confirmName }               -> soft-delete (recoverable)
//   { confirmName, purge: true }  -> PERMANENT: company + its folders, files,
//                                    disk bytes, memberships, share links, and
//                                    users who belong only to this company.
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

    // Collect every disk key BEFORE deleting the rows (current + versions +
    // change archives), so we can clean the disk after the DB commit.
    const files = await prisma.file.findMany({
      where: { companyId: id },
      include: { versions: { select: { storageKey: true, changesKey: true } } },
    });
    const keys = new Set();
    for (const f of files) {
      if (f.storageKey) keys.add(f.storageKey);
      for (const v of f.versions) {
        if (v.storageKey) keys.add(v.storageKey);
        if (v.changesKey) keys.add(v.changesKey);
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
    // Then remove the now-orphaned sole-company users.
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
        filesDeleted: files.length,
        usersDeleted: soleUserIds.length,
      },
      req,
    });

    return NextResponse.json({ ok: true, purged: true });
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

  await logActivity({
    action: ACTIONS.COMPANY_DELETED,
    userId: user.id,
    companyId: id,
    detail: { name: company.name, domain: company.domain },
    req,
  });

  return NextResponse.json({ ok: true });
}
