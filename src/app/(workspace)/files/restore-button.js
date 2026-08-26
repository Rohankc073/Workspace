'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RestoreButton({ id }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function restore() {
    setBusy(true);

    const res = await fetch(`/api/files/${id}/delete`, { method: 'PUT' });

    setBusy(false);

    if (res.ok) {
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      window.alert(d.error || 'Could not restore that file.');
    }
  }

  return (
    <button type="button" onClick={restore} disabled={busy} style={S.button}>
      {busy ? 'Working' : 'Restore'}
    </button>
  );
}

const S = {
  button: {
    background: 'none',
    border: '1px solid var(--line)',
    borderRadius: 3,
    color: 'var(--gold)',
    fontSize: 12,
    padding: '4px 10px',
    cursor: 'pointer',
  },
};