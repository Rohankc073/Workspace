import { SignJWT, jwtVerify } from 'jose';
import { documentTypeFor } from './storage';

const secret = new TextEncoder().encode(process.env.ONLYOFFICE_JWT_SECRET);

/** Signs any object. OnlyOffice rejects unsigned requests when JWT is enabled. */
export async function signPayload(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('4h')
    .sign(secret);
}

/** Verifies a token OnlyOffice sent us. Throws if it is invalid. */
export async function verifyToken(token) {
  const { payload } = await jwtVerify(token, secret);
  return payload;
}

/**
 * Builds the config that opens the editor.
 *
 * The permissions block is the access control. It is trustworthy because
 * the whole object is signed — a user editing the page source cannot
 * grant themselves edit rights.
 */
export async function buildEditorConfig({ file, user, permissions, downloadToken }) {
  const internal = process.env.APP_INTERNAL_URL;

  // Commenters need the editing interface but must not change content,
  // so they get mode 'edit' with the edit right switched off.
  const interactive = permissions.canEdit || permissions.canComment;

  const config = {
    document: {
      fileType: file.extension,
      key: `${file.id}-v${file.version}`,
      title: file.name,
      url: `${internal}/api/files/${file.id}/download?token=${downloadToken}`,
      permissions: {
        edit: permissions.canEdit,
        comment: permissions.canComment,
        download: permissions.canDownload,
        print: permissions.canPrint,
        copy: permissions.canDownload,
      },
    },
    documentType: documentTypeFor(file.extension),
    editorConfig: {
      mode: interactive ? 'edit' : 'view',
      lang: 'en',
      callbackUrl: `${internal}/api/onlyoffice/callback`,
      user: { id: user.id, name: user.name },
      customization: {
        // Off deliberately. Force-saved versions are excluded from
        // OnlyOffice's history panel, so leaving this on would put
        // gaps in the change tracking. Saves happen when the last
        // person closes the document, as in Google Docs.
        forcesave: false,
        chat: false,
        comments: permissions.canComment,
      },
    },
  };

  config.token = await signPayload(config);
  return config;
}