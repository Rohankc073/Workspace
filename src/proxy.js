import { NextResponse } from "next/server";

/**
 * Runs before every request that matches the config at the bottom.
 *
 * Its one job is the cheap question: is there a session cookie at all? That
 * catches the case that used to produce a 500 — a signed-out request
 * reaching a page which then calls user.isSuperAdmin on null. With this in
 * place those requests land on the login page instead, which is what an
 * expired session should look like.
 *
 * What it deliberately does NOT do:
 *
 *   - Validate the session against the database. This runs in Next's edge
 *     runtime, which cannot use Prisma. A cookie could be expired, revoked,
 *     or belong to a disabled account and still pass here.
 *
 *   - Replace any existing check. Every route keeps its own getCurrentUser()
 *     guard and its own resolveFilePermissions() call. Those answer "is this
 *     session real?" and "may you touch THIS file?", neither of which a
 *     proxy can answer. This is a first gate, not the gate.
 *
 * So nothing already written needs changing. The value is that a route added
 * next month is covered whether or not its author remembers the guard.
 */

const COOKIE_NAME = "atlas_session";

/**
 * Paths that must work without a session.
 *
 * /s/ is the outside share-link viewer — recipients have no account, which
 * is the whole point of it. /api/s/ is its password check.
 *
 * /api/onlyoffice/ is the document server's callback. It arrives from a
 * container, server-to-server, with no cookies at all; it authenticates by
 * verifying a JWT signed with ONLYOFFICE_JWT_SECRET, and refuses anything
 * without one. Blocking it here stopped documents saving.
 */
const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth/login",
  "/s/",
  "/api/s/",
  "/api/onlyoffice/",
];

function isPublic(pathname) {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

/**
 * The document download route serves two entirely different callers: a person
 * with a session, and the OnlyOffice container with a signed token and no
 * cookies. The route already handles both — it verifies the token and checks
 * it names this exact file before serving anything.
 *
 * /api/files/ can't be exempted wholesale, or every file route would be open.
 * So only a download request that actually carries a token skips the cookie
 * check, and the route itself still rejects a token that is invalid, expired
 * or for a different file.
 */
function isTokenedDownload(req, pathname) {
  if (!pathname.startsWith("/api/files/")) return false;
  if (!pathname.includes("/download") && !pathname.includes("/changes")) {
    return false;
  }
  return req.nextUrl.searchParams.has("token");
}

export default function proxy(req) {
  const { pathname, search } = req.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();
  if (isTokenedDownload(req, pathname)) return NextResponse.next();

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (token) return NextResponse.next();

  // An API caller wants a status code, not an HTML login page — returning a
  // redirect here would make fetch() land on markup and fail confusingly.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  // Where they were heading, so signing in can return them there rather than
  // dumping everyone on the dashboard.
  if (pathname !== "/") {
    url.searchParams.set("next", `${pathname}${search}`);
  }

  return NextResponse.redirect(url);
}

export const config = {
  /**
   * Everything except Next's own assets and the favicon.
   *
   * Without these exclusions the proxy would run for every script chunk and
   * image on every page load — work for nothing, and a redirect loop risk if
   * the login page's own assets were blocked.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)",
  ],
};
