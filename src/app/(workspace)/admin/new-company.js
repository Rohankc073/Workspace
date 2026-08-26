'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Super-admin only. Creates a company AND its single admin in one step.
 * The admin's email is built as <localPart>@<domain>.
 */
export default function NewCompany() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    domain: '',
    adminName: '',
    adminLocalPart: '',
    adminPassword: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function set(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  function close() {
    setOpen(false);
    setError('');
    setForm({ name: '', domain: '', adminName: '', adminLocalPart: '', adminPassword: '' });
  }

  async function submit() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        close();
        router.refresh();
      } else {
        setError(data.error || 'Could not create the company.');
      }
    } catch {
      setError('Could not create the company.');
    }
    setBusy(false);
  }

  const domainClean = form.domain.toLowerCase().trim().replace(/^@/, '');
  const previewEmail =
    form.adminLocalPart && domainClean ? `${form.adminLocalPart.toLowerCase()}@${domainClean}` : '';

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={S.trigger}>
        + New company
      </button>

      {open ? (
        <div style={S.backdrop} onClick={close}>
          <div style={S.panel} onClick={(e) => e.stopPropagation()}>
            <p className="eyebrow" style={M.eyebrow}>New company</p>
            <h3 style={M.title}>Create a company</h3>
            <p style={M.sub}>You also create its first administrator.</p>

            <label style={M.label} htmlFor="co-name">Company name</label>
            <input id="co-name" className="field" value={form.name} onChange={set('name')} autoFocus />

            <label style={M.label} htmlFor="co-domain">Email domain</label>
            <input
              id="co-domain"
              className="field"
              value={form.domain}
              onChange={set('domain')}
              placeholder="acme.com"
            />
            <p style={M.hint}>All users in this company will have @{domainClean || 'domain'} emails.</p>

            <div style={M.divider} />

            <label style={M.label} htmlFor="ad-name">Admin name</label>
            <input id="ad-name" className="field" value={form.adminName} onChange={set('adminName')} />

            <label style={M.label} htmlFor="ad-local">Admin email</label>
            <div style={M.emailRow}>
              <input
                id="ad-local"
                className="field"
                value={form.adminLocalPart}
                onChange={set('adminLocalPart')}
                placeholder="admin"
                style={M.emailLocal}
              />
              <span style={M.emailSuffix}>@{domainClean || 'domain'}</span>
            </div>
            {previewEmail ? <p style={M.hint}>Will be created as {previewEmail}</p> : null}

            <label style={M.label} htmlFor="ad-pass">Admin password</label>
            <input
              id="ad-pass"
              className="field"
              type="password"
              value={form.adminPassword}
              onChange={set('adminPassword')}
              placeholder="At least 12 characters"
            />

            {error ? <p style={M.error}>{error}</p> : null}

            <div style={M.actions}>
              <button type="button" className="btn btn-text" onClick={close}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>
                {busy ? 'Creating' : 'Create company'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

const S = {
  trigger: {
    marginTop: 14,
    padding: '9px 16px',
    background: 'transparent',
    color: 'var(--text)',
    border: '1px solid var(--line)',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
  },
  backdrop: {
    position: 'fixed', inset: 0, background: 'rgba(32,33,36,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 60,
  },
  panel: {
    width: '100%', maxWidth: 440, background: 'var(--panel)',
    borderRadius: 12, padding: 26, boxShadow: 'var(--shadow-raised)',
    maxHeight: '90vh', overflowY: 'auto',
  },
};

const M = {
  eyebrow: { marginBottom: 6 },
  title: { fontSize: 18, fontWeight: 500 },
  sub: { fontSize: 13, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 },
  label: { display: 'block', fontSize: 13, color: 'var(--muted)', margin: '16px 0 6px' },
  hint: { fontSize: 12, color: 'var(--muted)', marginTop: 6 },
  divider: { height: 1, background: 'var(--line-soft)', margin: '20px 0 4px' },
  emailRow: { display: 'flex', alignItems: 'center', gap: 8 },
  emailLocal: { flex: 1 },
  emailSuffix: { fontSize: 14, color: 'var(--muted)', whiteSpace: 'nowrap' },
  error: {
    fontSize: 13, color: 'var(--danger)', background: 'var(--danger-soft)',
    padding: '10px 14px', borderRadius: 'var(--r-card)', marginTop: 16,
  },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 },
};