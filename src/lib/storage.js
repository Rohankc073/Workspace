import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

const ROOT = path.resolve(process.env.STORAGE_DIR || "./storage");

/**
 * Everything that touches the disk goes through this file. Swapping to
 * MinIO or S3 later means rewriting these functions and nothing else —
 * no other file in the app knows how documents are stored.
 */

/**
 * Legacy random key: `<companyId>/<random>.<ext>`. Kept as a safe fallback
 * (e.g. if a company or file name is somehow empty). New uploads should use
 * makeReadableKey() so files land under a human-readable path.
 */
export function makeStorageKey(companyId, extension) {
  const random = crypto.randomBytes(16).toString("hex");
  return `${companyId}/${random}.${extension}`;
}

// --- readable keys -------------------------------------------------------

/** Make a string safe as ONE path segment on any OS (no separators, no
 *  illegal characters, no leading/trailing dots or spaces). */
function safeSegment(input, fallback) {
  let s = String(input ?? "")
    .replace(/[/\\]/g, " ") // no path separators — this is a single segment
    .replace(/[\x00-\x1f]/g, "") // no control characters
    .replace(/[:*?"<>|]/g, "") // characters Windows forbids
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "") // no leading dots (hidden files / traversal)
    .replace(/[. ]+$/, ""); // no trailing dot or space (Windows)
  if (!s || s === "." || s === "..") s = fallback;
  if (s.length > 120) s = s.slice(0, 120).trim(); // stay well under the 255-byte limit
  return s;
}

/** Separate a base name from its extension, preferring the explicit
 *  `extension` field. Avoids "report.docx.docx" when the name already
 *  carries the extension. */
function splitName(name, extension) {
  let base = String(name ?? "").trim();
  const ext = String(extension ?? "")
    .trim()
    .replace(/^\./, "")
    .toLowerCase();
  if (ext && base.toLowerCase().endsWith("." + ext)) {
    base = base.slice(0, -(ext.length + 1));
  }
  return { base, ext };
}

async function exists(full) {
  try {
    await fs.access(full);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build a human-readable, collision-free key:
 *   "<Company Name>/<file name>.<ext>"
 *
 * De-dupes within the company folder ("report (2).docx", "report (3).docx").
 * Returns the RELATIVE key — save it as the file's storageKey. Reads keep
 * resolving bytes by storageKey, so open/download/save are unaffected.
 *
 * Usage in the upload handler:
 *   const key = await makeReadableKey({
 *     companyName,           // e.g. "Idea Town"
 *     fileName: originalName, // what the uploader called it
 *     extension,
 *   });
 *   await saveObject(key, buffer);
 *   // ...store `key` as storageKey on the File row
 */
export async function makeReadableKey({ companyName, fileName, extension }) {
  const company = safeSegment(companyName, "Company");
  const { base, ext } = splitName(fileName, extension);
  const safeBase = safeSegment(base, "untitled");
  const suffix = ext ? `.${safeSegment(ext, "bin")}` : "";

  const dir = path.join(ROOT, company);
  await fs.mkdir(dir, { recursive: true });

  let candidate = `${safeBase}${suffix}`;
  let n = 2;
  // Never overwrite an existing file — pick the next free "(n)" name.
  while (await exists(path.join(dir, candidate))) {
    candidate = `${safeBase} (${n})${suffix}`;
    n++;
  }

  return `${company}/${candidate}`;
}

// --- version history helpers --------------------------------------------

/**
 * Where a historical copy of a file lives: a hidden ".versions" folder next
 * to the current file, so the company folder shows only real documents.
 *   "Idea Town/report.docx"  ->  "Idea Town/.versions/report__v2.docx"
 * `ext` may include dots (e.g. "changes.zip") for the change archives.
 */
export function versionKey(currentKey, version, ext) {
  const lastSlash = currentKey.lastIndexOf("/");
  const dir = lastSlash >= 0 ? currentKey.slice(0, lastSlash) : "";
  const fileBase =
    lastSlash >= 0 ? currentKey.slice(lastSlash + 1) : currentKey;
  const dot = fileBase.lastIndexOf(".");
  const base = dot > 0 ? fileBase.slice(0, dot) : fileBase;
  const cleanExt = String(
    ext ?? (dot > 0 ? fileBase.slice(dot + 1) : ""),
  ).replace(/^\.+/, "");
  const suffix = cleanExt ? `.${cleanExt}` : "";
  const prefix = dir ? `${dir}/` : "";
  return `${prefix}.versions/${base}__v${version}${suffix}`;
}

/** Copy the bytes at one key to another key. */
export async function copyObject(fromKey, toKey) {
  const buffer = await readObject(fromKey);
  return saveObject(toKey, buffer);
}

// --- object I/O (unchanged) ---------------------------------------------

export async function saveObject(key, buffer) {
  const full = path.join(ROOT, key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, buffer);
  return buffer.length;
}

export async function readObject(key) {
  return fs.readFile(path.join(ROOT, key));
}

export async function deleteObject(key) {
  try {
    await fs.unlink(path.join(ROOT, key));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

/** Which OnlyOffice editor opens this file. */
export function documentTypeFor(extension) {
  const ext = extension.toLowerCase();
  if (["xlsx", "xls", "ods", "csv"].includes(ext)) return "cell";
  if (["pptx", "ppt", "odp"].includes(ext)) return "slide";
  if (["docx", "doc", "odt", "rtf", "txt", "pdf"].includes(ext)) return "word";
  return null;
}

export function isEditable(extension) {
  return ["xlsx", "docx", "pptx"].includes(extension.toLowerCase());
}
