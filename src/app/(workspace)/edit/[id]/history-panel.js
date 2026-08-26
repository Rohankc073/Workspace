'use client';

import { useEffect, useState } from 'react';

export default function HistoryPanel({ fileId, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const res = await fetch(`/api/files/${fileId}/versions`);
      if (cancelled) return;

      if (res.ok) {
        setData(await res.json());
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error || 'Could not load the history.');
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  function download(version) {
    window.location.href = `/api/files/${fileId}/download?version=${version}`;
  }

  async function restore(version) {
    const ok = window.confirm(
      `Restore version ${version}? This adds a new version, so nothing is lost.`
    );
    if (!ok) return;

    setBusy(version);

    const res = await fetch(`/api/files/${fileId}/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version }),
    });

    setBusy(null);

    if (res.ok) {
      window.location.reload();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || 'Could not restore.');
    }
  }

  return (
    <div style={S.backdrop} onClick={onClose}>
      <div style={S.panel} onClick={(e) => e.stopPropagation()}>
        <p className="eyebrow">History</p>
        <h2 style={S.title}>{data ? data.fileName : 'Loading'}</h2>

        {error ? <p style={S.error}>{error}</p> : null}

        {!data ? (
          <p style={S.muted}>Loading</p>
        ) : (
          <ul style={S.list}>
            {data.versions.map((v) => (
              <li key={v.version} style={S.row}>
                <div style={S.info}>
                  <p style={S.line}>
                    <strong>Version {v.version}</strong>
                    {v.version === data.current ? (
                      <span style={S.now}>current</span>
                    ) : null}
                  </p>
                  <p style={S.meta}>
                    {v.by} · {new Date(v.at).toLocaleString()}
                    {v.sizeDelta && v.sizeDelta !== 0 ? (
                      <span style={v.sizeDelta > 0 ? S.grew : S.shrank}>
                        {' '}
                        {v.sizeDelta > 0 ? '+' : ''}
                        {formatBytes(v.sizeDelta)}
                      </span>
                    ) : null}
                  </p>
                </div>

                <div style={S.actions}>
                  {data.canDownload ? (
                    <button
                      type="button"
                      onClick={() => download(v.version)}
                      style={S.linkBtn}
                    >
                      Download
                    </button>
                  ) : null}

                  {data.canRestore && v.version !== data.current ? (
                    <button
                      type="button"
                      onClick={() => restore(v.version)}
                      disabled={busy !== null}
                      style={S.restore}
                    >
                      {busy === v.version ? 'Working' : 'Restore'}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        <button type="button" onClick={onClose} style={S.close}>
          Close
        </button>
      </div>
    </div>
  );
}

function formatBytes(n) {
  const abs = Math.abs(n);
  if (abs < 1024) return `${n} B`;
  if (abs < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
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
    maxWidth: 520,
    maxHeight: '80vh',
    overflowY: 'auto',
    background: 'var(--card)',
    border: '1px solid var(--line)',
    borderRadius: 4,
    padding: 26,
  },
  title: { fontSize: 17, fontWeight: 500, marginTop: 6, marginBottom: 16 },
  muted: { color: 'var(--muted)', fontSize: 13, padding: '12px 0' },
  error: { color: 'var(--danger)', fontSize: 13, marginBottom: 12 },
  list: { listStyle: 'none', borderTop: '1px solid var(--line)' },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    padding: '12px 0',
    borderBottom: '1px solid var(--line)',
  },
  info: { minWidth: 0 },
  line: { fontSize: 13 },
  now: {
    marginLeft: 8,
    fontSize: 10,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--gold)',
  },
  meta: { fontSize: 12, color: 'var(--muted)', marginTop: 2 },
  grew: { color: '#6fbf8f' },
  shrank: { color: 'var(--danger)' },
  actions: { display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 },
  linkBtn: {
    background: 'none',
    border: 'none',
    padding: 0,
    fontSize: 12,
    color: 'var(--muted)',
    cursor: 'pointer',
  },
  restore: {
    background: 'none',
    border: '1px solid var(--line)',
    borderRadius: 3,
    color: 'var(--gold)',
    fontSize: 12,
    padding: '4px 10px',
    cursor: 'pointer',
  },
  close: {
    marginTop: 18,
    background: 'none',
    border: 'none',
    color: 'var(--muted)',
    fontSize: 12,
    cursor: 'pointer',
    padding: 0,
  },
};