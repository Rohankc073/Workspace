import { prisma } from "./db";
import {
    deleteObject,
    makeReadableKey,
    readObject,
    saveObject,
} from "./storage";

const ARCHIVE_SLUG = "archive";

/**
 * The archive company, created the first time something is moved into it.
 *
 * It's a Company row so that files keep a companyId — making that nullable
 * would put a null case through visibleFilesWhere, the storage key builder
 * and every permission path. Nobody is ever a member, so only super admins
 * (who see every company) can reach what's inside.
 */
export async function getArchiveCompany() {
  const existing = await prisma.company.findFirst({
    where: { isArchive: true },
  });
  if (existing) return existing;

  return prisma.company.create({
    data: {
      name: "Archive",
      slug: ARCHIVE_SLUG,
      // Never matched against a real email domain; kept unique and obviously
      // internal so it can't collide with a client's.
      domain: "archive.atlas.internal",
      isArchive: true,
    },
  });
}

/**
 * Moves one file, and all of its versions, into another company.
 *
 * The bytes move too. storageKey is built from the company NAME
 * (storage/<Company>/file.docx), so leaving them in place would scatter one
 * company's documents through another's folder — fine for the app,
 * misleading for anyone reading a backup.
 *
 * `fromName` is recorded on the file the first time it lands in the archive,
 * so the archive can say where something came from after its original
 * company has been deleted.
 *
 * Returns the number of objects that couldn't be moved. A file whose bytes
 * are missing still gets its row updated: an unreachable row is easier to
 * fix than a lost one.
 */
export async function moveFileToCompany(
  file,
  target,
  { fromName = null } = {},
) {
  let failures = 0;

  async function relocate(oldKey, name, extension) {
    if (!oldKey) return null;
    try {
      const bytes = await readObject(oldKey);
      const newKey = await makeReadableKey({
        companyName: target.name,
        fileName: name,
        extension,
      });
      await saveObject(newKey, bytes);
      // Only remove the original once the copy is safely written.
      try {
        await deleteObject(oldKey);
      } catch {
        // An orphaned byte is harmless; a lost one is not.
      }
      return newKey;
    } catch (err) {
      if (err?.code === "ENOENT") {
        // The row points at bytes that aren't on disk. Pre-existing damage,
        // not something this move caused — carry the row across anyway, so
        // the record survives and can be repaired from a backup.
        console.warn("Transfer: no bytes on disk for", oldKey);
      } else {
        console.error("Transfer: could not move object", oldKey, err);
      }
      failures += 1;
      return null;
    }
  }

  const newKey = await relocate(file.storageKey, file.name, file.extension);

  for (const v of file.versions ?? []) {
    const vKey = await relocate(
      v.storageKey,
      `${file.name}__v${v.version}`,
      file.extension,
    );
    if (vKey) {
      await prisma.fileVersion.update({
        where: { id: v.id },
        data: { storageKey: vKey },
      });
    }
  }

  // Prisma 7 wants relations connected, not raw foreign keys, on update —
  // `companyId: x` is rejected with "Did you mean `company`?". Reading by
  // companyId in a where clause is still fine.
  await prisma.file.update({
    where: { id: file.id },
    data: {
      company: { connect: { id: target.id } },
      // Folders belong to the old company. The file lands at the root of its
      // new company rather than pointing at a folder that's about to vanish.
      folder: { disconnect: true },
      ...(newKey ? { storageKey: newKey } : {}),
      // Only stamped on the way in; moving out of the archive later keeps
      // the original provenance rather than overwriting it with "Archive".
      ...(fromName && !file.archivedFrom ? { archivedFrom: fromName } : {}),
    },
  });

  // Grants name people in the OLD company. Keeping them would leave staff
  // from a closed client with access to documents that now belong to a
  // different one — the separation this whole model exists to enforce.
  await prisma.permission.deleteMany({ where: { fileId: file.id } });

  // Outside links point at a document that has changed hands. Anyone holding
  // one would keep access across a company boundary.
  await prisma.shareLink.updateMany({
    where: { fileId: file.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  return failures;
}
