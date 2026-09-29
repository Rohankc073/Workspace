"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** Must match CATEGORIES in activity/page.js. */
const CATS = [
  { key: "all", label: "All events" },
  { key: "documents", label: "Documents" },
  { key: "sharing", label: "Sharing" },
  { key: "signins", label: "Sign-ins" },
  { key: "admin", label: "Admin actions" },
];

const DELAY = 350;

/**
 * Search and filter for the audit log.
 *
 * Server-side rather than in-memory: the page only loads the most recent 200
 * rows, so filtering the array client-side would search a window rather than
 * the log. Debounced, because each keystroke is a real query.
 */
export default function ActivitySearch({ total }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const urlQ = params.get("q") ?? "";
  const cat = params.get("cat") ?? "all";

  const [q, setQ] = useState(urlQ);
  const timer = useRef(null);
  // The last value we sent, so an incoming param update doesn't overwrite
  // what's being typed.
  const sent = useRef(urlQ);

  useEffect(() => {
    if (urlQ === sent.current) return;
    sent.current = urlQ;
    setQ(urlQ);
  }, [urlQ]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function push(next) {
    // Read the live query string: a debounced call fires later, and the
    // params captured at render may be stale by then.
    const sp = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    const str = sp.toString();
    router.replace(str ? `${pathname}?${str}` : pathname);
  }

  function onChange(value) {
    setQ(value);
    sent.current = value.trim();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(
      () => push({ q: value.trim() || undefined }),
      DELAY,
    );
  }

  function clear() {
    if (timer.current) clearTimeout(timer.current);
    setQ("");
    sent.current = "";
    push({ q: undefined });
  }

  const pending = q.trim() !== urlQ;

  return (
    <div style={S.bar}>
      <style>{`
        .ac-input:focus { outline: none; }
        .ac-wrap:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
        .ac-select:hover { border-color: var(--muted); }
        @keyframes ac-spin { to { transform: rotate(360deg); } }
        .ac-spin {
          width: 13px; height: 13px; flex-shrink: 0;
          border: 2px solid var(--line); border-top-color: var(--accent);
          border-radius: 999px; animation: ac-spin 620ms linear infinite;
        }
      `}</style>

      <form
        className="ac-wrap"
        style={S.wrap}
        onSubmit={(e) => {
          e.preventDefault();
          if (timer.current) clearTimeout(timer.current);
          push({ q: q.trim() || undefined });
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width="17"
          height="17"
          fill="currentColor"
          aria-hidden="true"
          style={S.icon}
        >
          <path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 5 1.5-1.5-5-5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z" />
        </svg>
        <input
          className="ac-input"
          type="text"
          value={q}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              clear();
            }
          }}
          placeholder="Search people, documents or companies"
          style={S.input}
          aria-label="Search the activity log"
        />
        {pending ? <span className="ac-spin" /> : null}
        {q ? (
          <button
            type="button"
            onClick={clear}
            style={S.clear}
            aria-label="Clear search"
          >
            ×
          </button>
        ) : null}
      </form>

      <select
        className="ac-select"
        value={cat}
        onChange={(e) =>
          push({ cat: e.target.value === "all" ? undefined : e.target.value })
        }
        style={cat !== "all" ? S.selectOn : S.select}
        aria-label="Filter by event type"
      >
        {CATS.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </select>

      {urlQ || cat !== "all" ? (
        <span style={S.count}>
          {total} {total === 1 ? "match" : "matches"}
        </span>
      ) : null}
    </div>
  );
}

const S = {
  bar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 22,
  },
  wrap: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    flex: 1,
    minWidth: 240,
    maxWidth: 420,
    height: 40,
    padding: "0 13px",
    background: "var(--bg)",
    border: "1px solid var(--line)",
    borderRadius: 999,
    transition: "border-color .14s ease, box-shadow .14s ease",
  },
  icon: { color: "var(--muted)", flexShrink: 0 },
  input: {
    flex: 1,
    minWidth: 0,
    height: "100%",
    border: "none",
    background: "transparent",
    color: "var(--text)",
    fontSize: 14,
  },
  clear: {
    border: "none",
    background: "transparent",
    color: "var(--muted)",
    fontSize: 20,
    lineHeight: 1,
    cursor: "pointer",
    padding: 0,
  },
  select: {
    height: 38,
    padding: "0 11px",
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 999,
    color: "var(--text-2)",
    fontSize: 13,
    cursor: "pointer",
    transition: "border-color .14s ease",
  },
  selectOn: {
    height: 38,
    padding: "0 11px",
    background: "var(--accent-soft)",
    border: "1px solid var(--accent)",
    borderRadius: 999,
    color: "var(--accent)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  },
  count: {
    fontSize: 12.5,
    color: "var(--muted)",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
};
