import { prisma } from "./db";

/** Pulls the client IP from whichever proxy header carries it. */
function clientIp(headers) {
  const forwarded = headers.get("x-forwarded-for");
  const fromList = forwarded ? forwarded.split(",")[0].trim() : null;

  const ip =
    fromList ||
    headers.get("x-real-ip") ||
    headers.get("cf-connecting-ip") || // Cloudflare
    headers.get("true-client-ip") || // Cloudflare Enterprise / Akamai
    headers.get("x-client-ip") ||
    null;

  if (ip) return ip;

  // RFC 7239: Forwarded: for=1.2.3.4
  const fwd = headers.get("forwarded");
  const match = fwd && fwd.match(/for="?\[?([^;,"\]]+)/i);
  return match ? match[1] : null;
}

/**
 * Writes one row to the log book. Nothing ever updates or deletes
 * these rows — that is what makes the log trustworthy.
 *
 * Call it with the action and whatever context you have:
 *   await logActivity({ action: 'FILE_OPEN', userId, fileId, companyId, req })
 *
 * Pass `req` whenever you have it so the IP and user agent get recorded —
 * without it, those columns stay null.
 */
export async function logActivity({
  action,
  userId = null,
  companyId = null,
  fileId = null,
  detail = null,
  req = null,
}) {
  let ip = null;
  let userAgent = null;

  if (req) {
    ip = clientIp(req.headers);
    userAgent = req.headers.get("user-agent") ?? null;
  }

  try {
    await prisma.activity.create({
      data: { action, userId, companyId, fileId, detail, ip, userAgent },
    });
  } catch (err) {
    // Never let logging break the thing being logged.
    console.error("logActivity failed:", err);
  }
}

/** The action names used across the app. Keep them here so they stay consistent. */
export const ACTIONS = {
  LOGIN: "LOGIN",
  LOGIN_FAILED: "LOGIN_FAILED",
  LOGOUT: "LOGOUT",
  FILE_UPLOAD: "FILE_UPLOAD",
  FILE_OPEN: "FILE_OPEN",
  FILE_SAVE: "FILE_SAVE",
  FILE_DOWNLOAD: "FILE_DOWNLOAD",
  FILE_DELETE: "FILE_DELETE",
  FILE_UNDELETE: "FILE_UNDELETE",
  FILE_PURGE: "FILE_PURGE",
  FILE_RESTORE: "FILE_RESTORE",
  EDIT_JOIN: "EDIT_JOIN",
  EDIT_LEAVE: "EDIT_LEAVE",
  PERMISSION_CHANGE: "PERMISSION_CHANGE",
  USER_CREATED: "USER_CREATED",
  USER_DISABLED: "USER_DISABLED",
  USER_DELETED: "USER_DELETED",
  USER_ROLE_CHANGED: "USER_ROLE_CHANGED",
  PASSWORD_RESET: "PASSWORD_RESET",
  COMPANY_CREATED: "COMPANY_CREATED",
  FOLDER_CREATED: "FOLDER_CREATED",
  FOLDER_DELETED: "FOLDER_DELETED",
  FILE_MOVED: "FILE_MOVED",
  COMPANY_UPDATED: "COMPANY_UPDATED",
  COMPANY_DELETED: "COMPANY_DELETED",
};
