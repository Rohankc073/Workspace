'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const KINDS = [
  {
    key: 'spreadsheet',
    label: 'Spreadsheet',
    tone: '#0f9d58',
    path: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM11 19H5v-6h6v6zm0-8H5V5h6v6zm8 8h-6v-6h6v6zm0-8h-6V5h6v6z',
  },
  {
    key: 'document',
    label: 'Document',
    tone: '#4285f4',
    path: 'M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z',
  },
  {
    key: 'presentation',
    label: 'Presentation',
    tone: '#f4b400',
    path: 'M2 3h19v2H2V3zm1 3h17v9H3V6zm8 11h2v2h4v2H7v-2h4v-2z',
  },
];

export default function QuickCreate({ companyId }) {
  const router = useRouter();
  const [busy, setBusy] = useState('');

  async function create(kind) {
    const name = window.prompt('Name this document');
    if (!name) return;

    setBusy(kind);

    const res = await fetch('/api/files/new', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, name, companyId, folderId: null }),
    });

    setBusy('');

    if (res.ok) {
      const { id } = await res.json();
      router.push(`/edit/${id}`);
    } else {
      const d = await res.json().catch(() => ({}));
      window.alert(d.error || 'Could not create the document.');
    }
  }

  return (
    <div style={S.row}>
      {KINDS.map((k) => (
        <button
          key={k.key}
          type="button"
          className="quick-tile"
          onClick={() => create(k.key)}
          disabled={busy !== ''}
          style={S.tile}
        >
          <span style={{ ...S.icon, background: `${k.tone}1f`, color: k.tone }}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
              <path d={k.path} />
            </svg>
          </span>
          <span style={S.text}>
            <span style={S.label}>{busy === k.key ? 'Creating' : k.label}</span>
            <span style={S.hint}>Blank {k.label.toLowerCase()}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

const S = {
  row: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 12,
    marginTop: 24,
  },
  tile: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '14px 16px',
    background: 'var(--panel)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--r-card)',
    cursor: 'pointer',
    textAlign: 'left',
    font: 'inherit',
    color: 'var(--text)',
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  text: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  label: { fontSize: 14, fontWeight: 500 },
  hint: { fontSize: 12, color: 'var(--muted)', marginTop: 2 },
};