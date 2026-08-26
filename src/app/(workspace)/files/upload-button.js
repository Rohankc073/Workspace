'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const ACCEPT = '.docx,.doc,.odt,.rtf,.txt,.pdf,.xlsx,.xls,.ods,.csv,.pptx,.ppt,.odp';

export default function UploadButton({ companyId, folderId }) {
  const router = useRouter();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  async function onPick(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be picked again later
    if (!file) return;

    setBusy(true);

    const form = new FormData();
    form.append('file', file);
    form.append('companyId', companyId);
    if (folderId) form.append('folderId', folderId);

    try {
      const res = await fetch('/api/files/upload', { method: 'POST', body: form });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error || 'Could not upload that file.');
      }
    } catch {
      window.alert('Could not upload that file.');
    }

    setBusy(false);
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        onChange={onPick}
        style={{ display: 'none' }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        style={S.button}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
          <path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z" />
        </svg>
        {busy ? 'Uploading…' : 'Upload'}
      </button>
    </>
  );
}

const S = {
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    padding: '9px 14px',
    background: 'transparent',
    color: 'var(--text)',
    border: '1px solid var(--line)',
    borderRadius: 3,
    fontSize: 13,
    cursor: 'pointer',
  },
};