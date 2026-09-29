"use client";

import { LogoTile } from "@/components/logo";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import DriveTypeNav from "./files/drive-type-nav";
import SidebarNav from "./sidebar-nav";

const MOBILE_QUERY = "(max-width: 860px)";

/**
 * True below the mobile breakpoint.
 *
 * Starts false so the server and the first client render agree — reading
 * window during render would be a hydration mismatch. The real value lands
 * on mount, one frame later.
 */
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return isMobile;
}

/**
 * Client shell that owns the sidebar state. The server layout passes in the
 * already-computed nav items + user summary, so all the auth/data work stays
 * on the server.
 *
 * Desktop: a fixed column, collapsible to an icons-only rail, auto-collapsed
 * on the editor route so the document gets full width.
 *
 * Mobile: the sidebar leaves the flow entirely and becomes an overlay drawer
 * behind a hamburger. Previously it kept its 256px on a 390px screen, which
 * left the content about 130px wide — the table and toolbar folded into a
 * single unusable column.
 */
export default function WorkspaceShell({
  driveItems,
  otherItems,
  user,
  children,
}) {
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const onEditor = pathname.startsWith("/edit") || pathname.startsWith("/view");

  // Manual toggle overrides; default follows the route (collapsed on editor).
  const [manual, setManual] = useState(null); // null = follow route
  const collapsed = manual === null ? onEditor : manual;

  // Mobile drawer, separate from the desktop collapse.
  const [drawerOpen, setDrawerOpen] = useState(false);

  // When you navigate onto/off the editor, drop the manual override so the
  // route default applies again (feels natural: editor auto-hides, back
  // to Drive auto-shows).
  useEffect(() => {
    setManual(null);
  }, [onEditor]);

  // Tapping a nav link should close the drawer, not leave it covering the
  // page you just navigated to.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Escape closes the drawer; the page behind it shouldn't scroll while
  // it's open.
  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(e) {
      if (e.key === "Escape") setDrawerOpen(false);
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen]);

  // On mobile the drawer is always full-width — an icons-only rail inside an
  // overlay makes no sense.
  const railCollapsed = isMobile ? false : collapsed;

  const sidebarStyle = isMobile
    ? {
        ...S.sidebar,
        ...S.sidebarMobile,
        transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
      }
    : { ...S.sidebar, width: collapsed ? 68 : 256 };

  return (
    <div style={S.shell}>
      <style>{`
        .ws-toggle:hover {
          background: var(--accent-soft);
          border-color: var(--accent);
          color: var(--accent);
        }
        .ws-toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .ws-toggle:active { transform: scale(.94); }
        .ws-burger:active { background: var(--line-soft); }
        .ws-who { text-decoration: none; color: inherit; }
        .ws-who:hover { background: var(--line-soft); }
        .ws-who:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      `}</style>

      {/* Mobile top bar — the only way to reach the nav on a phone. */}
      {isMobile ? (
        <header style={S.topBar}>
          <button
            type="button"
            className="ws-burger"
            onClick={() => setDrawerOpen(true)}
            style={S.burger}
            aria-label="Open menu"
            aria-expanded={drawerOpen}
          >
            <svg
              viewBox="0 0 24 24"
              width="22"
              height="22"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
            </svg>
          </button>
          <LogoTile size={28} />
          <span style={S.topBarName}>Atlas</span>
          <span style={S.topBarSpacer} />
          <span style={S.avatarSmall} title={user.name}>
            {user.initials}
          </span>
        </header>
      ) : null}

      {/* Scrim behind the drawer. */}
      {isMobile && drawerOpen ? (
        <div
          style={S.scrim}
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <aside style={sidebarStyle}>
        <div style={railCollapsed ? S.brandCollapsed : S.brand}>
          <LogoTile size={32} />
          {railCollapsed ? null : <span style={S.brandName}>Atlas</span>}

          {isMobile ? (
            <button
              type="button"
              className="ws-toggle"
              onClick={() => setDrawerOpen(false)}
              style={S.toggle}
              aria-label="Close menu"
            >
              <svg
                viewBox="0 0 24 24"
                width="17"
                height="17"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              className="ws-toggle"
              onClick={() => setManual(!collapsed)}
              style={S.toggle}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand" : "Collapse"}
            >
              {/* Double chevrons: a single arrow reads as "next", not
                  "collapse". */}
              <svg
                viewBox="0 0 24 24"
                width="17"
                height="17"
                fill="currentColor"
                aria-hidden="true"
              >
                {collapsed ? (
                  <path d="M5.6 17 4.2 15.6 7.8 12 4.2 8.4 5.6 7l5 5-5 5zm7 0L11.2 15.6 14.8 12l-3.6-3.6L12.6 7l5 5-5 5z" />
                ) : (
                  <path d="M18.4 7l1.4 1.4L16.2 12l3.6 3.6L18.4 17l-5-5 5-5zm-7 0l1.4 1.4L9.2 12l3.6 3.6L11.4 17l-5-5 5-5z" />
                )}
              </svg>
            </button>
          )}
        </div>

        <div style={S.navScroll}>
          <SidebarNav items={driveItems} collapsed={railCollapsed} />
          {railCollapsed ? null : <DriveTypeNav />}
          <SidebarNav items={otherItems} collapsed={railCollapsed} />
        </div>

        <div style={railCollapsed ? S.footCollapsed : S.foot}>
          {/* The whole block is the link — an avatar alone is too small a
              target, and people expect their own name to be clickable. */}
          <Link
            href="/profile"
            className="ws-who"
            style={railCollapsed ? S.whoCollapsed : S.who}
            title={
              railCollapsed ? `${user.name} — your profile` : "Your profile"
            }
          >
            <span style={S.avatar} aria-hidden="true">
              {user.initials}
            </span>
            {railCollapsed ? null : (
              <div style={S.whoText}>
                <p style={S.name}>{user.name}</p>
                <p style={S.where}>{user.where}</p>
              </div>
            )}
          </Link>

          {railCollapsed ? null : (
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="btn btn-text btn-sm"
                style={S.signout}
              >
                Sign out
              </button>
            </form>
          )}
        </div>
      </aside>

      <main style={isMobile ? { ...S.main, ...S.mainMobile } : S.main}>
        <div style={isMobile ? { ...S.inner, ...S.innerMobile } : S.inner}>
          {children}
        </div>
      </main>
    </div>
  );
}

const S = {
  shell: { display: "flex", minHeight: "100vh", background: "var(--bg)" },

  topBar: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    height: 56,
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "0 12px",
    background: "var(--panel)",
    borderBottom: "1px solid var(--line-soft)",
    zIndex: 900,
  },
  burger: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: 40,
    borderRadius: 999,
    border: "none",
    background: "none",
    color: "var(--text-2)",
    cursor: "pointer",
    flexShrink: 0,
  },
  topBarName: { fontSize: 17, fontWeight: 500, color: "var(--text-2)" },
  topBarSpacer: { flex: 1 },
  avatarSmall: {
    width: 32,
    height: 32,
    borderRadius: 999,
    background: "var(--accent-soft)",
    color: "var(--accent)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 600,
    flexShrink: 0,
  },

  scrim: {
    position: "fixed",
    inset: 0,
    background: "rgba(32,33,36,0.45)",
    zIndex: 940,
  },

  sidebar: {
    flexShrink: 0,
    background: "var(--bg)",
    display: "flex",
    flexDirection: "column",
    padding: "16px 0",
    position: "sticky",
    top: 0,
    height: "100vh",
    transition: "width .18s ease",
  },
  // Out of the flow entirely: on a 390px screen a 256px column left the
  // content about 130px wide.
  sidebarMobile: {
    position: "fixed",
    top: 0,
    left: 0,
    bottom: 0,
    width: 272,
    height: "100%",
    background: "var(--panel)",
    borderRight: "1px solid var(--line-soft)",
    boxShadow: "0 0 40px rgba(0,0,0,.18)",
    zIndex: 950,
    transition: "transform .22s ease",
  },

  brand: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "0 12px 8px 20px",
    flexShrink: 0,
  },
  brandCollapsed: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    padding: "0 0 8px",
    flexShrink: 0,
  },
  brandName: { fontSize: 20, fontWeight: 400, color: "var(--text-2)", flex: 1 },
  toggle: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    borderRadius: 999,
    border: "1px solid var(--line)",
    background: "var(--panel)",
    color: "var(--text-2)",
    cursor: "pointer",
    flexShrink: 0,
    transition:
      "background .14s ease, color .14s ease, border-color .14s ease, transform .1s ease",
  },
  navScroll: { flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" },
  foot: {
    flexShrink: 0,
    padding: "14px 18px 0",
    borderTop: "1px solid var(--line-soft)",
    marginTop: 8,
  },
  footCollapsed: {
    flexShrink: 0,
    padding: "14px 0 0",
    borderTop: "1px solid var(--line-soft)",
    marginTop: 8,
    display: "flex",
    justifyContent: "center",
  },
  who: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    margin: "0 -10px",
    borderRadius: 10,
    transition: "background .14s ease",
  },
  whoCollapsed: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 6,
    borderRadius: 999,
    transition: "background .14s ease",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 999,
    background: "var(--accent-soft)",
    color: "var(--accent)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 500,
    flexShrink: 0,
  },
  whoText: { minWidth: 0 },
  name: {
    fontSize: 13,
    fontWeight: 500,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  where: {
    fontSize: 12,
    color: "var(--muted)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  signout: { marginTop: 6, marginLeft: -12 },

  main: { flex: 1, minWidth: 0, padding: "12px 12px 12px 0" },
  mainMobile: { padding: "56px 0 0", width: "100%" },
  inner: {
    background: "var(--panel)",
    border: "1px solid var(--line-soft)",
    borderRadius: 16,
    minHeight: "calc(100vh - 24px)",
    padding: "32px 40px",
  },
  // No rounded card on a phone — it wastes horizontal space that the
  // content needs.
  innerMobile: {
    border: "none",
    borderRadius: 0,
    minHeight: "calc(100vh - 56px)",
    padding: "20px 16px 32px",
  },
};
