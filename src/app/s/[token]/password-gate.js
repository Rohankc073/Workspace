'use client';

import { useState } from 'react';

export default function PasswordGate({ token, fileName }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!password) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/s/${token}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        window.location.reload();
      } else {
        setError('That password is not correct.');
        setBusy(false);
      }
    } catch {
      setError('Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  function onKey(e) {
    if (e.key === 'Enter') submit();
  }

  return (
    <div style={S.wrap}>
      <div style={S.card}>
        <p className="eyebrow">Protected document</p>
        <h1 style={S.title}>{fileName}</h1>
        <p style={S.text}>This link is password protected. Enter the password to view it.</p>

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={onKey}
          placeholder="Password"
          autoFocus
          style={S.input}
        />

        {error ? <p style={S.error}>{error}</p> : null}

        <button type="button" onClick={submit} disabled={busy || !password} style={S.button}>
          {busy ? 'Checking…' : 'View document'}
        </button>
      </div>
    </div>
  );
}

const S = {
  wrap: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    background: 'var(--bg, #0b0d10)',
  },
  card: {
    width: '100%',
    maxWidth: 380,
    background: 'var(--card)',
    border: '1px solid var(--line)',
    borderRadius: 4,
    padding: 30,
  },
  title: { fontSize: 18, fontWeight: 500, margin: '6px 0 10px', color: 'var(--text)' },
  text: { fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 18px' },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '10px 12px',
    fontSize: 14,
    background: 'var(--panel)',
    color: 'var(--text)',
    border: '1px solid var(--line)',
    borderRadius: 3,
    marginBottom: 12,
  },
  error: { fontSize: 12, color: 'var(--danger)', margin: '0 0 12px' },
  button: {
    width: '100%',
    padding: '11px 0',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    background: 'var(--gold)',
    color: '#0b0d10',
    border: 'none',
    borderRadius: 3,
  },
};