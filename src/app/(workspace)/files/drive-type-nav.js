"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ICONS } from "../sidebar-nav";

/**
 * The three type shortcuts. Glyphs come from the shared ICONS map in
 * sidebar-nav so this list can't drift away from the rest of the sidebar —
 * the old local copies were a blank page, a solid grid, and a stack of
 * shapes that didn't read as a slide.
 */
const TYPES = [
  { key: "document", label: "Documents", icon: "doc" },
  { key: "spreadsheet", label: "Spreadsheets", icon: "sheet" },
  { key: "presentation", label: "Presentations", icon: "slides" },
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
      >
        <span>By type</span>
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="currentColor"
          aria-hidden="true"
          style={{
            transform: open ? "rotate(0deg)" : "rotate(-90deg)",
            transition: "transform .15s ease",
          }}
        >
          <path d="M7 10l5 5 5-5z" />
        </svg>
      </button>

      {open
        ? TYPES.map((t) => {
            const active = activeType === t.key;
            return (
              <Link
                key={t.key}
                href={`/files?type=${t.key}`}
                className={active ? "dtn-link dtn-link-on" : "dtn-link"}
                style={active ? S.linkOn : S.link}
                aria-current={active ? "page" : undefined}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="currentColor"
                  aria-hidden="true"
                  style={{ flexShrink: 0, display: "block" }}
                >
                  <path d={ICONS[t.icon]} />
                </svg>
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
    padding: "10px 18px 8px",
    transition: "color .15s ease",
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
