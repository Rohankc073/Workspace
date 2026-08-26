'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import SidebarNav from './sidebar-nav';
import DriveTypeNav from './files/drive-type-nav';

/**
 * Client shell that owns the sidebar collapse state. The server layout
 * passes in the already-computed nav items + user summary, so all the
 * auth/data work stays on the server.
 *
 * - Collapses to an icons-only rail (toggle button).
 * - Auto-collapses on the editor/view route so the document gets full width.
 */
export default function WorkspaceShell({ driveItems, otherItems, user, children }) {
  const pathname = usePathname();
  const onEditor = pathname.startsWith('/edit') || pathname.startsWith('/view');

  // Manual toggle overrides; default follows the route (collapsed on editor).
  const [manual, setManual] = useState(null); // null = follow route
  const collapsed = manual === null ? onEditor : manual;

  // When you navigate onto/off the editor, drop the manual override so the
  // route default applies again (feels natural: editor auto-hides, back
  // to Drive auto-shows).
  useEffect(() => {
    setManual(null);
  }, [onEditor]);

  return (
    <div style={S.shell}>
      <aside style={{ ...S.sidebar, width: collapsed ? 68 : 256 }}>
        <div style={collapsed ? S.brandCollapsed : S.brand}>
          <span style={S.mark}>A</span>
          {collapsed ? null : <span style={S.brandName}>Atlas</span>}
          <button
            type="button"
            onClick={() => setManual(!collapsed)}
            style={collapsed ? S.toggleCollapsed : S.toggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
              {collapsed ? (
                <path d="M10 17l5-5-5-5v10z" />
              ) : (
                <path d="M14 7l-5 5 5 5V7z" />
              )}
            </svg>
          </button>
        </div>

        <div style={S.navScroll}>
          <SidebarNav items={driveItems} collapsed={collapsed} />
          {collapsed ? null : <DriveTypeNav />}
          <SidebarNav items={otherItems} collapsed={collapsed} />
        </div>

        <div style={collapsed ? S.footCollapsed : S.foot}>
          <div style={S.who}>
            <span style={S.avatar} title={user.name}>{user.initials}</span>
            {collapsed ? null : (
              <div style={S.whoText}>
                <p style={S.name}>{user.name}</p>
                <p style={S.where}>{user.where}</p>
              </div>
            )}
          </div>

          {collapsed ? null : (
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="btn btn-text btn-sm" style={S.signout}>
                Sign out
              </button>
            </form>
          )}
        </div>
      </aside>

      <main style={S.main}>
        <div style={S.inner}>{children}</div>
      </main>
    </div>
  );
}

const S = {
  shell: { display: 'flex', minHeight: '100vh', background: 'var(--bg)' },
  sidebar: {
    flexShrink: 0,
    background: 'var(--bg)',
    display: 'flex',
    flexDirection: 'column',
    padding: '16px 0',
    position: 'sticky',
    top: 0,
    height: '100vh',
    transition: 'width .18s ease',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '0 12px 8px 20px',
    flexShrink: 0,
  },
  brandCollapsed: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    padding: '0 0 8px',
    flexShrink: 0,
  },
  mark: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: 'var(--accent)',
    color: '#fff',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 15,
    fontWeight: 500,
    flexShrink: 0,
  },
  brandName: { fontSize: 20, fontWeight: 400, color: 'var(--text-2)', flex: 1 },
  toggle: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 30,
    height: 30,
    borderRadius: 8,
    border: 'none',
    background: 'none',
    color: 'var(--muted)',
    cursor: 'pointer',
  },
  toggleCollapsed: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 30,
    height: 30,
    borderRadius: 8,
    border: 'none',
    background: 'none',
    color: 'var(--muted)',
    cursor: 'pointer',
  },
  navScroll: { flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' },
  foot: {
    flexShrink: 0,
    padding: '14px 18px 0',
    borderTop: '1px solid var(--line-soft)',
    marginTop: 8,
  },
  footCollapsed: {
    flexShrink: 0,
    padding: '14px 0 0',
    borderTop: '1px solid var(--line-soft)',
    marginTop: 8,
    display: 'flex',
    justifyContent: 'center',
  },
  who: { display: 'flex', alignItems: 'center', gap: 10 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 999,
    background: 'var(--accent-soft)',
    color: 'var(--accent)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 500,
    flexShrink: 0,
  },
  whoText: { minWidth: 0 },
  name: {
    fontSize: 13,
    fontWeight: 500,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  where: {
    fontSize: 12,
    color: 'var(--muted)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  signout: { marginTop: 6, marginLeft: -12 },
  main: { flex: 1, minWidth: 0, padding: '12px 12px 12px 0' },
  inner: {
    background: 'var(--panel)',
    border: '1px solid var(--line-soft)',
    borderRadius: 16,
    minHeight: 'calc(100vh - 24px)',
    padding: '32px 40px',
  },
};