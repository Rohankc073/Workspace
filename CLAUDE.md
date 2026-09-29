# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

Atlas Workspace — a self-hosted, multi-tenant document workspace (Google-Drive-like) built on Next.js 16 App Router + React 19, JavaScript only (no TypeScript). Documents are stored on the local filesystem and edited in the browser by a self-hosted **OnlyOffice Document Server**. Postgres via Prisma 7.

## Commands

```bash
npm run dev            # next dev
node server.js         # preferred: custom server that sets x-forwarded-for so activity logs capture an IP
npm run build          # next build
npm run start          # next start (or: NODE_ENV=production node server.js)
npm run lint           # eslint (flat config; `next lint` is gone in this version)

docker compose up -d   # Postgres on :55432 and OnlyOffice on :8082

npx prisma migrate dev --name <name>   # create + apply a migration
npx prisma migrate deploy              # apply migrations (production)
npx prisma generate                    # regenerate client after schema edits
npx prisma studio
node prisma/seed.mjs                   # demo company + super admin
node bootstrap-admin.mjs               # first super admin in an empty DB (edit constants first)
```

There is no test framework in this repo. Verify changes by running the app.

Prisma 7 notes: the datasource URL lives in `prisma.config.mjs` (not in `schema.prisma`), and the client **requires the `@prisma/adapter-pg` driver adapter** — any standalone script must build the client the way `src/lib/db.js` or `prisma/seed.mjs` does, not `new PrismaClient()`.

### Environment

`.env` (gitignored) must provide: `DATABASE_URL`, `ONLYOFFICE_JWT_SECRET` (must equal `JWT_SECRET` on the OnlyOffice container in `docker-compose.yml`), `ONLYOFFICE_PUBLIC_URL` (where the **browser** loads the editor), `APP_INTERNAL_URL` (how the **OnlyOffice container** reaches this app — these two differ and confusing them breaks saving), `STORAGE_DIR`, `SHARE_LINK_SECRET`, `COOKIE_SECURE`, `CONVERTAPI_TOKEN`.

## Architecture

Everything non-trivial lives in `src/lib/`; route files and pages are thin callers. Alias `@/*` → `./src/*`.

**Data model** (`prisma/schema.prisma`, heavily commented — read it first). `Company` is the tenant; users join via `Membership` with a `Role` (VIEWER/EDITOR/MANAGER/ADMIN); `User.isSuperAdmin` crosses all tenants. `File`/`Folder` are soft-deleted (`deletedAt`). `Permission` rows grant on a folder **or** a file, to a user **or** a role. `Activity` is append-only — never write an update or delete path for it.

**Authorization is the core of this app.** Two functions must stay in step or files leak:
- `resolveFilePermissions(user, file)` in `src/lib/permissions.js` — what one person may do with one file, closed by default, ordered: super admin → not a member → company ADMIN/MANAGER → file creator → grant on the file → nearest grant walking up the folder tree.
- `visibleFilesWhere(user)` — the Prisma `where` for the same rule set, used by list pages. Note the `[{ id: "" }]` guard: an empty `OR` matches everything in Prisma.
- `canOpenFolder` / `grantedFolderIds` in `src/lib/folders.js` are the folder-side equivalents.
- `canDelete` (trash, recoverable, admins have it) and `canPurge` (permanent, **only the file's uploader**, not even a super admin) are deliberately separate powers.

**Auth** (`src/lib/auth.js`): opaque 32-byte random session token in the httpOnly `atlas_session` cookie, backed by a `Session` row; `getCurrentUser()` also refreshes `lastSeenAt` (throttled to 1/min, failures swallowed) which feeds presence in `src/lib/presence.js`. There is **no middleware/proxy file** — every page and route handler calls `getCurrentUser()` itself, and the `(workspace)` layout redirects to `/login`. New routes must do their own auth check.

**Storage** (`src/lib/storage.js`) is the only module that touches disk — swapping to S3/MinIO should mean editing this file alone. Keys are human-readable `"<Company Name>/<file>.<ext>"` (`makeReadableKey`, de-dupes with " (2)"), historical copies go to a hidden `.versions/` sibling (`versionKey`). `documentTypeFor`/`isEditable` decide which OnlyOffice editor opens a file.

**OnlyOffice integration** (`src/lib/onlyoffice.js`) is the trickiest flow:
1. `/edit/[id]` resolves permissions server-side, mints a short-lived signed `downloadToken` naming exactly one file, and builds a JWT-signed editor config. The signature is what makes the permissions block trustworthy — a user editing page source cannot grant themselves edit rights.
2. The container fetches bytes from `/api/files/[id]/download?token=…`. That route has **two independent auth paths** (signed token for the container, session + `resolveFilePermissions` for a human) and neither borrows the other's — keep it that way.
3. On close, the container POSTs `/api/onlyoffice/callback` (status 2/6): verify the token, archive the current bytes into `.versions/`, overwrite in place, bump `File.version`, create a `FileVersion`, store the changes zip. `forcesave` is off on purpose — force-saved versions are excluded from OnlyOffice's history and would leave gaps in change tracking.
4. `File.version` feeds the OnlyOffice document key (`<id>-v<version>`), so a stale version means a stale cached document.

**Conversions**: OnlyOffice handles everything except PDF→DOCX, which goes to ConvertAPI (`src/lib/pdf-to-word.js`). Allowed pairs are the `TARGETS` map in `src/app/api/files/[id]/convert/route.js`.

**Public share links**: `/s/[token]` (`export const dynamic = 'force-dynamic'`) with an optional password gate; the proof-of-password cookie is an HMAC over link id + password hash (`src/lib/share-links.js`), so it can't be forged and is invalidated by re-passwording.

**Archive company**: deleting a company moves its files to a hidden `isArchive` Company (`src/lib/transfer-files.js`) rather than making `File.companyId` nullable — a null there would ripple through `visibleFilesWhere`, key building and every permission path. Moving a file between companies moves the bytes too, since the key encodes the company name.

## Conventions

- **No Server Actions and no `"use server"`.** Server Components read data directly via Prisma; all mutations are client components `fetch()`-ing JSON `/api/*` route handlers. Follow that pattern rather than introducing actions.
- Route handler signature in this Next version: `export async function GET(req, { params })` with **`const { id } = await params;`** — `params` and `cookies()` are async.
- Log meaningful operations with `logActivity({ action: ACTIONS.X, …, req })` from `src/lib/activity.js`; add new action names to the `ACTIONS` map. Pass `req` so IP/user-agent are captured.
- Styling is plain CSS: design tokens as CSS custom properties in `src/app/globals.css` (Google-Workspace-like palette) plus inline styles. No Tailwind, no CSS modules.
- Conventions are explained in long comments at the top of the files that own them (`permissions.js`, `storage.js`, the callback and download routes). When changing behaviour there, update the comment — it is the spec.
- `storage/` and `.env` are gitignored; `templates/blank.{docx,xlsx,pptx}` are the seeds for "new document"; `backup.sh` is the production snapshot script (cron, Docker `pg_dump` + rsync hard-link dedup).
