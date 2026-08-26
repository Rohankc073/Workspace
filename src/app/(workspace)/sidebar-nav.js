"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Sidebar glyphs. Monochrome and `currentColor`, so a link tints itself
 * when active rather than needing a second coloured icon set.
 *
 * The doc/sheet/slides marks match the shapes used by FileIcon in
 * files/file-icon.js — same silhouette, no colour tile — so the sidebar and
 * the file list read as the same family.
 */
export const ICONS = {
  home: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z",
  folder:
    "M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z",
  clock:
    "M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z",
  people:
    "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z",
  share:
    "M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z",
  trash:
    "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
  convert:
    "M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z",

  // A page outline with text lines — reads as "document" at 20px.
  doc: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11zM8 12h8v1.5H8V12zm0 3.5h8V17H8v-1.5z",

  // A page with a table grid inside — reads as "spreadsheet".
  sheet:
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11zM7.5 11.5h9V13h-3.75v1.75H16.5v1.5h-3.75V18h-1.5v-1.75H7.5v-1.5h3.75V13H7.5v-1.5z",

  // A screen on a stand — reads as "presentation".
  slides:
    "M20 3H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h6.25l-2 4h2l1.25-2.5L12.75 21h2l-2-4H19a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1zm-1 11H5V5h14v9z",
};

function Icon({ name }) {
  const d = ICONS[name];
  if (!d) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="currentColor"
      aria-hidden="true"
      style={{ flexShrink: 0, display: "block" }}
    >
      <path d={d} />
    </svg>
  );
}

export default function SidebarNav({ items, collapsed = false }) {
  const pathname = usePathname();

  return (
    <nav style={S.nav}>
      <style>{`
        .sb-link { position: relative; }
        .sb-link:hover { background: rgba(60,64,67,.06); }
        .sb-link-on:hover { background: var(--accent-soft); }
        .sb-link:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: -2px;
        }
      `}</style>

      {items.map((group) => (
        <div key={group.label} style={S.group}>
          {group.label && !collapsed ? (
            <p style={S.groupLabel}>{group.label}</p>
          ) : null}
          {group.label && collapsed ? <div style={S.groupDivider} /> : null}

          {group.links.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);

            const style = collapsed
              ? active
                ? S.iconLinkOn
                : S.iconLink
              : active
                ? S.linkOn
                : S.link;

            return (
              <Link
                key={link.href}
                href={link.href}
                className={active ? "sb-link sb-link-on" : "sb-link"}
                style={style}
                title={collapsed ? link.label : undefined}
                aria-label={link.label}
                aria-current={active ? "page" : undefined}
              >
                <Icon name={link.icon} />
                {collapsed ? null : <span style={S.label}>{link.label}</span>}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

const base = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  height: 40,
  padding: "0 18px",
  margin: "0 12px 2px 0",
  borderTopRightRadius: 999,
  borderBottomRightRadius: 999,
  fontSize: 14,
  fontWeight: 500,
  textDecoration: "none",
  transition: "background-color .15s ease, color .15s ease",
  whiteSpace: "nowrap",
  overflow: "hidden",
};

const iconBase = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 44,
  height: 44,
  margin: "0 auto 4px",
  borderRadius: 12,
  textDecoration: "none",
  transition: "background-color .15s ease, color .15s ease",
};

const S = {
  nav: { marginTop: 8 },
  group: { marginBottom: 16 },
  groupLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: ".07em",
    textTransform: "uppercase",
    color: "var(--muted)",
    padding: "10px 18px 8px",
  },
  groupDivider: {
    height: 1,
    background: "var(--line-soft)",
    margin: "10px 14px",
  },
  link: { ...base, color: "var(--text-2)" },
  // Active gets weight as well as colour — colour alone is easy to miss.
  linkOn: {
    ...base,
    color: "var(--accent)",
    background: "var(--accent-soft)",
    fontWeight: 600,
  },
  iconLink: { ...iconBase, color: "var(--text-2)" },
  iconLinkOn: {
    ...iconBase,
    color: "var(--accent)",
    background: "var(--accent-soft)",
  },
  label: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" },
};
