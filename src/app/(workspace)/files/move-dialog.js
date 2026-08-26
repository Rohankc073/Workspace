'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function MoveDialog({ fileId, fileName, onClose }) {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [target, setTarget] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const res = await fetch(`/api/files/${fileId}/move`);
      if (cancelled) return;

      if (res.ok) {
        const d = await res.json();
        setData(d);
        // Default to the first folder rather than the current one,
        // since picking the folder it is already in does nothing.
        setTarget(d.folders[0]?.id ?? '');
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error || 'Could not load folders.');
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  async function move() {
    setBusy(true);

    const res = await fetch(`/api/files/${fileId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId: target || null }),
    });

    setBusy(false);

    if (res.ok) {
      onClose();
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || 'Could not move the file.');
    }
  }

  const noFolders = data && data.folders.length === 0 && !data.currentFolderId;

  return (
    <div style={S.backdrop} onClick={onClose}>
      <div style={S.panel} onClick={(e) => e.stopPropagation()}>
        <p className="eyebrow">Move</p>
        <h2 style={S.title}>{fileName}</h2>

        {error ? <p style={S.error}>{error}</p> : null}

        {!data ? (
          <p style={S.muted}>Loading</p>
        ) : noFolders ? (
          <p style={S.muted}>
            There are no folders yet. Create one from the Drive page first.
          </p>
        ) : (
          <>
            <label style={S.label} htmlFor="target">Move to</label>
            <select
              id="target"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              style={S.input}
            >
              {data.folders.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
              {data.currentFolderId ? (
                <option value="">Out of this folder</option>
              ) : null}
            </select>

            <button type="button" onClick={move} disabled={busy} style={S.button}>
              {busy ? 'Working' : 'Move file'}
            </button>
          </>
        )}

        <button type="button" onClick={onClose} style={S.close}>
          Cancel
        </button>
      </div>
    </div>
  );
}

const S = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 50,
  },
  panel: {
    width: '100%',
    maxWidth: 420,
    background: 'var(--card)',
    border: '1px solid var(--line)',
    borderRadius: 4,
    padding: 26,
  },
  title: { fontSize: 17, fontWeight: 500, marginTop: 6, marginBottom: 18 },
  label: { display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 6 },
  input: {
    width: '100%',
    padding: '9px 11px',
    background: 'var(--panel)',
    border: '1px solid var(--line)',
    borderRadius: 3,
    color: 'var(--text)',
    fontSize: 13,
  },
  muted: { color: 'var(--muted)', fontSize: 13, padding: '12px 0', lineHeight: 1.5 },
  error: { color: 'var(--danger)', fontSize: 13, marginBottom: 12 },
  button: {
    width: '100%',
    marginTop: 18,
    padding: '10px 16px',
    background: 'var(--gold)',
    color: '#0b0d10',
    border: 'none',
    borderRadius: 3,
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
  },
  close: {
    marginTop: 14,
    background: 'none',
    border: 'none',
    color: 'var(--muted)',
    fontSize: 12,
    cursor: 'pointer',
    padding: 0,
  },
};