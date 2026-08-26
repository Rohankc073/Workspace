'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ShareDialog from './share-dialog';
import MoveDialog from './move-dialog';

export default function FileRowActions({
  fileId,
  fileName,
  canShare,
  canDelete,
  canMove,
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    const ok = window.confirm(
      `Move "${fileName}" to the trash? It can be restored later.`
    );
    if (!ok) return;

    setBusy(true);

    const res = await fetch(`/api/files/${fileId}/delete`, { method: 'POST' });

    setBusy(false);

    if (res.ok) {
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      window.alert(d.error || 'Could not delete that file.');
    }
  }

  return (
    <span style={S.row}>
      {canMove ? (
        <button type="button" onClick={() => setDialog('move')} style={S.button}>
          Move
        </button>
      ) : null}

      {canShare ? (
        <button type="button" onClick={() => setDialog('share')} style={S.button}>
          Share
        </button>
      ) : null}

      {canDelete ? (
        <button type="button" onClick={remove} disabled={busy} style={S.danger}>
          {busy ? 'Working' : 'Delete'}
        </button>
      ) : null}

      {dialog === 'share' ? (
        <ShareDialog
          fileId={fileId}
          fileName={fileName}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog === 'move' ? (
        <MoveDialog
          fileId={fileId}
          fileName={fileName}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </span>
  );
}

const S = {
  row: { display: 'inline-flex', gap: 8, justifyContent: 'flex-end' },
  button: {
    background: 'none',
    border: '1px solid var(--line)',
    borderRadius: 3,
    color: 'var(--muted)',
    fontSize: 12,
    padding: '4px 10px',
    cursor: 'pointer',
  },
  danger: {
    background: 'none',
    border: '1px solid var(--line)',
    borderRadius: 3,
    color: 'var(--danger)',
    fontSize: 12,
    padding: '4px 10px',
    cursor: 'pointer',
  },
};