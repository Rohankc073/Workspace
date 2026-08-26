'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const KINDS = [
  { key: 'spreadsheet', label: 'Spreadsheet' },
  { key: 'document', label: 'Document' },
  { key: 'presentation', label: 'Presentation' },
];

export default function NewButtons({ companyId, folderId }) {
  const router = useRouter();
  const [busy, setBusy] = useState('');

  async function create(kind) {
    const name = window.prompt('Name this document');
    if (!name) return;

    setBusy(kind);

    const res = await fetch('/api/files/new', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, name, companyId, folderId: folderId ?? null }),
    });

    setBusy('');

    if (res.ok) {
      const { id } = await res.json();
      router.push(`/edit/${id}`);
    } else {
      const data = await res.json().catch(() => ({}));
      window.alert(data.error || 'Could not create the document.');
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {KINDS.map((k) => (
        <button
          key={k.key}
          type="button"
          onClick={() => create(k.key)}
          disabled={busy !== ''}
          style={S.button}
        >
          {busy === k.key ? 'Working' : `New ${k.label}`}
        </button>
      ))}
    </div>
  );
}

const S = {
  button: {
    padding: '9px 14px',
    background: 'transparent',
    color: 'var(--text)',
    border: '1px solid var(--line)',
    borderRadius: 3,
    fontSize: 13,
    cursor: 'pointer',
  },
};