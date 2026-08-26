'use client';

import { useState, useEffect, useCallback } from 'react';

const EXPIRY_OPTIONS = [
  { key: '30m', label: '30 min' },
  { key: '1h', label: '1 hour' },
  { key: '1d', label: '1 day' },
];

function linkUrl(token) {
  return `${window.location.origin}/s/${token}`;
}

function timeLeft(expiresAt) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `expires in ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `expires in ${hrs} hr`;
  return `expires in ${Math.round(hrs / 24)} d`;
}

export default function ShareLinksPanel({ fileId }) {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expiresIn, setExpiresIn] = useState('30m');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/files/${fileId}/share-links`);
      const d = await res.json();
      setLinks(res.ok ? d.links : []);
    } catch {
      setLinks([]);
    }
    setLoading(false);
  }, [fileId]);

  useEffect(() => { load(); }, [load]);

  async function create() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/files/${fileId}/share-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn, password: password.trim() || undefined }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || 'Could not create link.');
      } else {
        setPassword('');
        await load();
      }
    } catch {
      setError('Could not create link.');
    }
    setBusy(false);
  }

  async function revoke(linkId) {
    if (!window.confirm('Revoke this link? Anyone holding it loses access immediately.')) return;
    const res = await fetch(`/api/files/${fileId}/share-links/${linkId}`, { method: 'DELETE' });
    if (res.ok) load();
    else window.alert('Could not revoke that link.');
  }

  async function copy(token, linkId) {
    try {
      await navigator.clipboard.writeText(linkUrl(token));
      setCopiedId(linkId);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      window.prompt('Copy this link:', linkUrl(token));
    }
  }

  const active = links.filter((l) => l.active);

  return (
    <div style={S.wrap}>
      <p style={S.heading}>Link for people outside the company</p>
      <p style={S.note}>
        Anyone with the link can view this file — no account needed. View only.
        Choose how long it stays live.
      </p>

      <div style={S.row}>
        {EXPIRY_OPTIONS.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => setExpiresIn(o.key)}
            style={expiresIn === o.key ? S.segOn : S.seg}
          >
            {o.label}
          </button>
        ))}
      </div>

      <input
        type="text"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Optional password"
        style={S.input}
      />

      <button type="button" onClick={create} disabled={busy} style={S.create}>
        {busy ? 'Creating…' : 'Create link'}
      </button>

      {error ? <p style={S.error}>{error}</p> : null}

      <div style={S.list}>
        {loading ? (
          <p style={S.note}>Loading…</p>
        ) : active.length === 0 ? (
          <p style={S.note}>No active links.</p>
        ) : (
          active.map((l) => (
            <div key={l.id} style={S.linkRow}>
              <div style={S.linkText}>
                <span style={S.url}>{linkUrl(l.token)}</span>
                <span style={S.meta}>
                  {timeLeft(l.expiresAt)}
                  {l.hasPassword ? ' · password' : ''}
                </span>
              </div>
              <button type="button" onClick={() => copy(l.token, l.id)} style={S.small}>
                {copiedId === l.id ? 'Copied' : 'Copy'}
              </button>
              <button type="button" onClick={() => revoke(l.id)} style={S.smallDanger}>
                Revoke
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const S = {
  wrap: { marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--line)' },
  heading: { fontSize: 14, fontWeight: 500, margin: '0 0 4px' },
  note: { fontSize: 12, color: 'var(--muted)', margin: '0 0 12px', lineHeight: 1.5 },
  row: { display: 'flex', gap: 8, marginBottom: 12 },
  seg: {
    flex: 1, padding: '8px 0', fontSize: 13, cursor: 'pointer',
    background: 'var(--card)', color: 'var(--text)',
    border: '1px solid var(--line)', borderRadius: 4,
  },
  segOn: {
    flex: 1, padding: '8px 0', fontSize: 13, cursor: 'pointer',
    background: 'var(--text)', color: 'var(--card)',
    border: '1px solid var(--text)', borderRadius: 4,
  },
  input: {
    width: '100%', boxSizing: 'border-box', padding: '9px 11px', fontSize: 13,
    background: 'var(--card)', color: 'var(--text)',
    border: '1px solid var(--line)', borderRadius: 4, marginBottom: 12,
  },
  create: {
    width: '100%', padding: '10px 0', fontSize: 14, cursor: 'pointer',
    background: 'var(--text)', color: 'var(--card)',
    border: 'none', borderRadius: 4,
  },
  error: { fontSize: 12, color: 'var(--danger, #c0392b)', margin: '10px 0 0' },
  list: { marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 },
  linkRow: { display: 'flex', alignItems: 'center', gap: 8 },
  linkText: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  url: {
    fontSize: 12, fontFamily: 'monospace', color: 'var(--text)',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  meta: { fontSize: 11, color: 'var(--muted)' },
  small: {
    padding: '5px 10px', fontSize: 12, cursor: 'pointer',
    background: 'var(--card)', color: 'var(--text)',
    border: '1px solid var(--line)', borderRadius: 4,
  },
  smallDanger: {
    padding: '5px 10px', fontSize: 12, cursor: 'pointer',
    background: 'var(--card)', color: 'var(--danger, #c0392b)',
    border: '1px solid var(--line)', borderRadius: 4,
  },
};