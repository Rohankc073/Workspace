"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

/**
 * The three type shortcuts.
 *
 * These use the full-colour product marks rather than the monochrome
 * outlines the rest of the sidebar uses — blue for documents, green for
 * spreadsheets, yellow for presentations, the same convention Google uses
 * and the same colours as FileIcon in the file list. A file type is a thing
 * with a colour; the grey outlines read as three copies of "page".
 *
 * Each is a page with a folded corner and a white glyph inside: text lines,
 * a table grid, a slide frame.
 */
function DocIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
      style={IC}
    >
      <path
        d="M14 2H6.5A1.5 1.5 0 0 0 5 3.5v17A1.5 1.5 0 0 0 6.5 22h11a1.5 1.5 0 0 0 1.5-1.5V7l-5-5z"
        fill="#4285f4"
      />
      <path d="M14 2l5 5h-5V2z" fill="#a0c3ff" />
      <path
        d="M8 12h8v1.4H8V12zm0 3.2h8v1.4H8v-1.4zm0-6.4h5v1.4H8V8.8z"
        fill="#fff"
      />
    </svg>
  );
}

function SheetIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
      style={IC}
    >
      <path
        d="M14 2H6.5A1.5 1.5 0 0 0 5 3.5v17A1.5 1.5 0 0 0 6.5 22h11a1.5 1.5 0 0 0 1.5-1.5V7l-5-5z"
        fill="#0f9d58"
      />
      <path d="M14 2l5 5h-5V2z" fill="#9cdcbe" />
      <path
        d="M8 11h8v6.2H8V11zm1.3 1.3v1.2h2.1v-1.2H9.3zm3.4 0v1.2h2v-1.2h-2zm-3.4 2.4V16h2.1v-1.3H9.3zm3.4 0V16h2v-1.3h-2z"
        fill="#fff"
      />
    </svg>
  );
}

function SlidesIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
      style={IC}
    >
      <path
        d="M14 2H6.5A1.5 1.5 0 0 0 5 3.5v17A1.5 1.5 0 0 0 6.5 22h11a1.5 1.5 0 0 0 1.5-1.5V7l-5-5z"
        fill="#f4b400"
      />
      <path d="M14 2l5 5h-5V2z" fill="#fde293" />
      <path d="M8 11.4h8v5.8H8v-5.8zm1.3 1.3v3.2h5.4v-3.2H9.3z" fill="#fff" />
    </svg>
  );
}

const IC = { flexShrink: 0, display: "block" };

const TYPES = [
  { key: "document", label: "Documents", Icon: DocIcon },
  { key: "spreadsheet", label: "Spreadsheets", Icon: SheetIcon },
  { key: "presentation", label: "Presentations", Icon: SlidesIcon },
];

export default function DriveTypeNav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(true);

  const activeType = pathname === "/files" ? params.get("type") : null;

  return (
    <div style={S.group}>
      <style>{`
        .dtn-head:hover { color: var(--text-2); }
        .dtn-head:hover .dtn-chev {
          background: var(--accent-soft);
          border-color: var(--accent);
          color: var(--accent);
        }
        .dtn-head:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 8px; }
        .dtn-head:active .dtn-chev { transform: scale(.92); }
        .dtn-link:hover { background: rgba(60,64,67,.06); }
        .dtn-link-on:hover { background: var(--accent-soft); }
        .dtn-link:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: -2px;
        }
      `}</style>

      <button
        type="button"
        className="dtn-head"
        onClick={() => setOpen((o) => !o)}
        style={S.header}
        aria-expanded={open}
        title={open ? "Hide file types" : "Show file types"}
      >
        <span>By type</span>
        {/* The chevron sits in its own chip so there's something to aim at
            — a bare 16px glyph reads as decoration, not a control. */}
        <span className="dtn-chev" style={S.chev}>
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="currentColor"
            aria-hidden="true"
            style={{
              transform: open ? "rotate(0deg)" : "rotate(-90deg)",
              transition: "transform .18s ease",
              display: "block",
            }}
          >
            <path d="M7 10l5 5 5-5z" />
          </svg>
        </span>
      </button>

      {open
        ? TYPES.map((t) => {
            const active = activeType === t.key;
            const { Icon } = t;
            return (
              <Link
                key={t.key}
                href={`/files?type=${t.key}`}
                className={active ? "dtn-link dtn-link-on" : "dtn-link"}
                style={active ? S.linkOn : S.link}
                aria-current={active ? "page" : undefined}
              >
                <Icon />
                <span style={S.label}>{t.label}</span>
              </Link>
            );
          })
        : null}
    </div>
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

const S = {
  group: { marginBottom: 16 },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "calc(100% - 12px)",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: ".07em",
    textTransform: "uppercase",
    color: "var(--muted)",
    padding: "8px 14px 8px 18px",
    transition: "color .15s ease",
  },
  chev: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 26,
    height: 26,
    borderRadius: 999,
    border: "1px solid var(--line)",
    background: "var(--panel)",
    color: "var(--text-2)",
    flexShrink: 0,
    transition:
      "background .14s ease, color .14s ease, border-color .14s ease, transform .1s ease",
  },
  link: { ...base, color: "var(--text-2)" },
  linkOn: {
    ...base,
    color: "var(--accent)",
    background: "var(--accent-soft)",
    fontWeight: 600,
  },
  label: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" },
};
