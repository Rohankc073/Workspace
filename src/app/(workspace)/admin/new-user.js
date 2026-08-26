'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const ROLES = [
  { value: 'VIEWER', label: 'Viewer' },
  { value: 'EDITOR', label: 'Editor' },
  { value: 'MANAGER', label: 'Manager' },
  { value: 'ADMIN', label: 'Admin' },
];

/**
 * Company admin creates a user. They type only the email name-part; the
 * company's domain is appended automatically. `companies` each carry a
 * { id, name, domain } so the suffix can be shown per company.
 */
export default function NewUser({ companies }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? '');
  const [form, setForm] = useState({ name: '', localPart: '', password: '', role: 'VIEWER' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const company = companies.find((c) => c.id === companyId) || companies[0];
  const domain = company?.domain ?? 'domain';

  function set(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  function close() {
    setOpen(false);
    setError('');
    setForm({ name: '', localPart: '', password: '', role: 'VIEWER' });
  }

  async function submit() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, companyId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        close();
        router.refresh();
      } else {
        setError(data.error || 'Could not create the user.');
      }
    } catch {
      setError('Could not create the user.');
    }
    setBusy(false);
  }

  const previewEmail = form.localPart ? `${form.localPart.toLowerCase()}@${domain}` : '';

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={S.trigger}>
        + New user
      </button>

      {open ? (
        <div style={S.backdrop} onClick={close}>
          <div style={S.panel} onClick={(e) => e.stopPropagation()}>
            <p className="eyebrow" style={M.eyebrow}>New user</p>
            <h3 style={M.title}>Add someone to your company</h3>

            {companies.length > 1 ? (
              <>
                <label style={M.label} htmlFor="u-co">Company</label>
                <select
                  id="u-co"
                  className="field"
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </>
            ) : null}

            <label style={M.label} htmlFor="u-name">Full name</label>
            <input id="u-name" className="field" value={form.name} onChange={set('name')} autoFocus />

            <label style={M.label} htmlFor="u-local">Email</label>
            <div style={M.emailRow}>
              <input
                id="u-local"
                className="field"
                value={form.localPart}
                onChange={set('localPart')}
                placeholder="firstname"
                style={M.emailLocal}
              />
              <span style={M.emailSuffix}>@{domain}</span>
            </div>
            {previewEmail ? <p style={M.hint}>Will be created as {previewEmail}</p> : null}

            <label style={M.label} htmlFor="u-role">Role</label>
            <select id="u-role" className="field" value={form.role} onChange={set('role')}>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>

            <label style={M.label} htmlFor="u-pass">Temporary password</label>
            <input
              id="u-pass"
              className="field"
              type="password"
              value={form.password}
              onChange={set('password')}
              placeholder="At least 12 characters"
            />

            {error ? <p style={M.error}>{error}</p> : null}

            <div style={M.actions}>
              <button type="button" className="btn btn-text" onClick={close}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>
                {busy ? 'Creating' : 'Create user'}
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
  label: { display: 'block', fontSize: 13, color: 'var(--muted)', margin: '16px 0 6px' },
  hint: { fontSize: 12, color: 'var(--muted)', marginTop: 6 },
  emailRow: { display: 'flex', alignItems: 'center', gap: 8 },
  emailLocal: { flex: 1 },
  emailSuffix: { fontSize: 14, color: 'var(--muted)', whiteSpace: 'nowrap' },
  error: {
    fontSize: 13, color: 'var(--danger)', background: 'var(--danger-soft)',
    padding: '10px 14px', borderRadius: 'var(--r-card)', marginTop: 16,
  },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 },
};