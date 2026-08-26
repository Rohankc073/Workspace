import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { resolveFilePermissions } from '@/lib/permissions';
import { buildEditorConfig, signPayload } from '@/lib/onlyoffice';
import { documentTypeFor } from '@/lib/storage';
import { logActivity, ACTIONS } from '@/lib/activity';
import Editor from './editor';

export default async function EditPage({ params }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const file = await prisma.file.findUnique({ where: { id } });
  if (!file || file.deletedAt) notFound();

  const permissions = await resolveFilePermissions(user, file);
  if (!permissions.canView) {
    return <p style={{ color: 'var(--muted)' }}>You do not have access to this document.</p>;
  }

  if (!documentTypeFor(file.extension)) {
    return <p style={{ color: 'var(--muted)' }}>This file type cannot be opened in the editor.</p>;
  }

  // Short-lived, names exactly one file, and is the only credential
  // the OnlyOffice container will have when it comes to fetch it.
  const downloadToken = await signPayload({ fileId: file.id });

  const config = await buildEditorConfig({ file, user, permissions, downloadToken });

  await logActivity({
    action: ACTIONS.FILE_OPEN,
    userId: user.id,
    companyId: file.companyId,
    fileId: file.id,
  });

  return (
    <Editor
      config={config}
      scriptUrl={`${process.env.ONLYOFFICE_PUBLIC_URL}/web-apps/apps/api/documents/api.js`}
      fileName={file.name}
      fileId={file.id}
      canDownload={permissions.canDownload}
      badge={
        permissions.canEdit
          ? null
          : permissions.canComment
            ? 'Comments only'
            : 'View only'
      }
    />
  );
}