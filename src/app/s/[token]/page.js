import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { buildEditorConfig, signPayload } from '@/lib/onlyoffice';
import { documentTypeFor } from '@/lib/storage';
import { logActivity, ACTIONS } from '@/lib/activity';
import { shareCookieName, shareCookieValue } from '@/lib/share-links';
import SharedViewer from './shared-viewer';
import PasswordGate from './password-gate';

// Links are checked live on every request, so never cache this page.
export const dynamic = 'force-dynamic';

function Unavailable({ message }) {
  return (
    <div style={U.wrap}>
      <div style={U.card}>
        <h1 style={U.title}>Link unavailable</h1>
        <p style={U.text}>
          {message ??
            'This link is no longer valid — it may have expired or been revoked. Ask whoever shared it to send a new one.'}
        </p>
      </div>
    </div>
  );
}

export default async function SharedFilePage({ params }) {
  const { token } = await params;

  const link = await prisma.shareLink.findUnique({
    where: { token },
    include: { file: true },
  });

  const now = Date.now();
  const invalid =
    !link ||
    link.revokedAt ||
    (link.expiresAt && link.expiresAt.getTime() <= now) ||
    !link.file ||
    link.file.deletedAt;

  if (invalid) return <Unavailable />;

  const file = link.file;

  if (!documentTypeFor(file.extension)) {
    return <Unavailable message="This kind of file can’t be opened for viewing." />;
  }

  // Password gate: if the link has one, require a matching cookie.
  if (link.passwordHash) {
    const jar = await cookies();
    const marker = jar.get(shareCookieName(link))?.value;
    if (marker !== shareCookieValue(link)) {
      return <PasswordGate token={token} fileName={file.name} />;
    }
  }

  // A guest visitor, forced view-only no matter what.
  const permissions = {
    canView: true,
    canEdit: link.canEdit,
    canComment: link.canEdit,
    canDownload: link.canDownload,
    canPrint: link.canDownload,
    canDelete: false,
  };
  const guest = { id: `guest-${link.id}`, name: 'Guest', isSuperAdmin: false };

  const downloadToken = await signPayload({ fileId: file.id });
  const config = await buildEditorConfig({ file, user: guest, permissions, downloadToken });

  await logActivity({
    action: ACTIONS.FILE_OPEN,
    userId: null,
    companyId: file.companyId,
    fileId: file.id,
    detail: { via: 'shareLink', linkId: link.id },
  });

  return (
    <SharedViewer
      config={config}
      scriptUrl={`${process.env.ONLYOFFICE_PUBLIC_URL}/web-apps/apps/api/documents/api.js`}
      fileName={file.name}
      canDownload={permissions.canDownload}
      canEdit={permissions.canEdit}
    />
  );
}

const U = {
  wrap: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    background: 'var(--bg, #0b0d10)',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    background: 'var(--card)',
    border: '1px solid var(--line)',
    borderRadius: 4,
    padding: 30,
    textAlign: 'center',
  },
  title: { fontSize: 18, fontWeight: 500, margin: '0 0 10px', color: 'var(--text)' },
  text: { fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, margin: 0 },
};