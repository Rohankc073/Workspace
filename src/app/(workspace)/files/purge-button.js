'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function PurgeButton({ id }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function purge() {
    if (!window.confirm('Delete this file forever? This cannot be undone.')) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/files/${id}/purge`, { method: 'DELETE' });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error || 'Could not delete the file.');
        setBusy(false);
      }
    } catch {
      window.alert('Could not delete the file.');
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={purge} disabled={busy} style={S.btn}>
      {busy ? 'Deleting…' : 'Delete forever'}
    </button>
  );
}

const S = {
  btn: {
    background: 'none',
    border: 'none',
    color: 'var(--danger)',
    fontSize: 12,
    cursor: 'pointer',
    padding: 0,
  },
};