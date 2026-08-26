"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const SORTS = ["name", "created", "size", "modified"];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Today as YYYY-MM-DD, for capping the pickers — files can't be added later. */
function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function DriveToolbar({ creators = [] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const urlQ = params.get("q") ?? "";
  const [q, setQ] = useState(urlQ);

  const debounceRef = useRef(null);
  // The last value *we* sent to the URL. Lets us tell our own navigations
  // apart from outside ones (back button, Clear filters) so typing never
  // gets clobbered mid-word by an incoming param sync.
  const sentRef = useRef(urlQ);

  useEffect(() => {
    if (urlQ === sentRef.current) return;
    sentRef.current = urlQ;
    setQ(urlQ);
  }, [urlQ]);

  // Don't leave a timer running against an unmounted component.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // A start date with no end means "until now". Doing this in an effect (not
  // just the change handler) also catches a `from` that arrived from a
  // bookmark, a shared URL, or a session predating this behaviour.
  useEffect(() => {
    const r = params.get("range");
    const f = params.get("from");
    const t = params.get("to");
    if (r !== "custom") return;
    if (!DAY.test(f ?? "")) return;
    if (DAY.test(t ?? "")) return;

    const sp = new URLSearchParams(params.toString());
    sp.set("to", todayStr());
    sp.delete("folder");
    router.replace(`${pathname}?${sp.toString()}`);
  }, [params, pathname, router]);

  function apply(next, { dropFolder = false } = {}) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    // Filtering is drive-wide, so leaving a folder makes the results make sense.
    if (dropFolder) sp.delete("folder");
    const str = sp.toString();
    router.push(str ? `${pathname}?${str}` : pathname);
  }

  /**
   * Pushes the search term into the URL.
   *
   * Reads the CURRENT query string rather than the `params` captured at
   * render, because a debounced call fires later — using the stale snapshot
   * would silently undo a filter changed while you were typing.
   *
   * Uses replace(), not push(): typing nine characters would otherwise leave
   * nine entries in the back-button history.
   */
  function runSearch(value) {
    const trimmed = value.trim();
    sentRef.current = trimmed;

    const sp = new URLSearchParams(window.location.search);
    if (trimmed) sp.set("q", trimmed);
    else sp.delete("q");
    // Searching is drive-wide, so results make sense outside the folder.
    sp.delete("folder");

    const str = sp.toString();
    router.replace(str ? `${pathname}?${str}` : pathname);
  }

  const SEARCH_DELAY = 350;

  function onSearchChange(value) {
    setQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(value), SEARCH_DELAY);
  }

  /** Enter still works — it just skips the wait. */
  function onSubmit(e) {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    runSearch(q);
  }

  function clearSearch() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQ("");
    runSearch("");
  }

  function onSearchKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      clearSearch();
    }
  }

  // True between the last keystroke and the results catching up.
  const searchPending = q.trim() !== urlQ;

  const sort = SORTS.includes(params.get("sort"))
    ? params.get("sort")
    : "modified";
  const type = params.get("type") || "all";
  const by = params.get("by") || "";
  const range = params.get("range") || "any";
  const vis = params.get("vis") || "all";
  const grouped = params.get("group") === "date";

  const from = params.get("from") || "";
  const to = params.get("to") || "";
  const custom = range === "custom";
  const singleDay = range === "day";

  // Both bounds are optional — "from 1 Aug onwards" and "up to 1 Aug" are
  // both useful. Only complain when the pair is the wrong way round.
  const backwards = DAY.test(from) && DAY.test(to) && from > to;

  const anyFilter =
    (params.get("q") ?? "") !== "" ||
    type !== "all" ||
    by !== "" ||
    range !== "any" ||
    vis !== "all";

  function clearAll() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQ("");
    sentRef.current = "";
    apply({
      q: undefined,
      type: undefined,
      by: undefined,
      range: undefined,
      from: undefined,
      to: undefined,
      vis: undefined,
    });
  }

  function onRangeChange(value) {
    if (value === "custom") {
      apply({ range: "custom" }, { dropFolder: true });
      return;
    }
    // One day only: `from` carries the date, `to` is meaningless here.
    if (value === "day") {
      apply({ range: "day", to: undefined }, { dropFolder: true });
      return;
    }
    // Leaving custom mode drops the dates so they can't linger invisibly.
    apply(
      {
        range: value === "any" ? undefined : value,
        from: undefined,
        to: undefined,
      },
      { dropFolder: true },
    );
  }

  /**
   * Picking a start date with no end yet means "from then until now", so the
   * end fills in with today rather than leaving a half-set range that reads
   * as unfinished. An end date already chosen is left alone.
   */
  function onFromChange(value) {
    if (!value) {
      apply({ from: undefined }, { dropFolder: true });
      return;
    }
    apply(
      { from: value, to: DAY.test(to) ? to : todayStr() },
      { dropFolder: true },
    );
  }

  const max = todayStr();

  return (
    <div style={S.wrap}>
      <style>{`
        .dt-select:hover { border-color: var(--muted); }
        .dt-select:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
        .dt-date:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
        .dt-btn:hover { background: var(--bg); }
        .dt-spin {
          width: 13px; height: 13px; flex-shrink: 0;
          border: 2px solid var(--line);
          border-top-color: var(--accent);
          border-radius: 999px;
          animation: dt-spin 620ms linear infinite;
        }
        @keyframes dt-spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Row 1 — search, sort, grouping */}
      <div style={S.topRow}>
        <form onSubmit={onSubmit} style={S.search}>
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
            type="text"
            value={q}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="Search files"
            style={S.input}
            aria-label="Search files"
          />
          {searchPending ? <span className="dt-spin" /> : null}
          {q ? (
            <button
              type="button"
              onClick={clearSearch}
              style={S.clear}
              aria-label="Clear search"
            >
              ×
            </button>
          ) : null}
        </form>

        <span style={S.spacer} />

        <select
          className="dt-select"
          value={sort}
          onChange={(e) =>
            apply({
              sort: e.target.value === "modified" ? undefined : e.target.value,
            })
          }
          style={S.select}
          aria-label="Sort files"
          title="Sort"
        >
          <option value="modified">Last modified</option>
          <option value="created">Date added</option>
          <option value="name">Name (A–Z)</option>
          <option value="size">Size</option>
        </select>

        <button
          type="button"
          className="dt-btn"
          onClick={() => apply({ group: grouped ? undefined : "date" })}
          style={grouped ? S.toggleOn : S.toggle}
          aria-pressed={grouped}
          title="Group files by the date they were added"
        >
          <svg
            viewBox="0 0 24 24"
            width="15"
            height="15"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M7 2v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-2V2h-2v2H9V2H7zm12 18H5V9h14v11zM5 7V6h14v1H5z" />
          </svg>
          Group by date
        </button>
      </div>

      {/* Row 2 — filters. Each select names its own default, so no labels needed. */}
      <div style={S.filterRow}>
        <select
          className="dt-select"
          value={type}
          onChange={(e) =>
            apply(
              { type: e.target.value === "all" ? undefined : e.target.value },
              { dropFolder: true },
            )
          }
          style={type !== "all" ? S.selectOn : S.select}
          aria-label="Filter by file type"
        >
          <option value="all">All types</option>
          <option value="document">Documents</option>
          <option value="spreadsheet">Spreadsheets</option>
          <option value="presentation">Presentations</option>
        </select>

        <select
          className="dt-select"
          value={by}
          onChange={(e) =>
            apply({ by: e.target.value || undefined }, { dropFolder: true })
          }
          style={by ? S.selectOn : S.select}
          aria-label="Filter by who created the file"
        >
          <option value="">Anyone</option>
          {creators.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          className="dt-select"
          value={range}
          onChange={(e) => onRangeChange(e.target.value)}
          style={range !== "any" ? S.selectOn : S.select}
          aria-label="Filter by date added"
        >
          <option value="any">Any time</option>
          <option value="week">Past 7 days</option>
          <option value="month">Past 30 days</option>
          <option value="day">On a specific day…</option>
          <option value="custom">Custom range…</option>
        </select>

        <select
          className="dt-select"
          value={vis}
          onChange={(e) =>
            apply(
              { vis: e.target.value === "all" ? undefined : e.target.value },
              { dropFolder: true },
            )
          }
          style={vis !== "all" ? S.selectOn : S.select}
          aria-label="Filter by sharing"
        >
          <option value="all">All files</option>
          <option value="shared">Shared</option>
          <option value="private">Not shared</option>
        </select>

        {anyFilter ? (
          <button type="button" onClick={clearAll} style={S.clearAll}>
            Clear filters
          </button>
        ) : null}
      </div>

      {/* Row 3a — a single day */}
      {singleDay ? (
        <div style={S.dateRow}>
          <span style={S.dateLabel}>Added on</span>

          <input
            type="date"
            className="dt-date"
            value={from}
            max={max}
            onChange={(e) =>
              apply({ from: e.target.value || undefined }, { dropFolder: true })
            }
            style={S.date}
            aria-label="Date added"
          />

          {from ? (
            <button
              type="button"
              onClick={() => apply({ from: undefined }, { dropFolder: true })}
              style={S.dateClear}
            >
              Reset date
            </button>
          ) : (
            <span style={S.dateHint}>Pick a day to see what was added.</span>
          )}
        </div>
      ) : null}

      {/* Row 3b — a range between two dates */}
      {custom ? (
        <div style={S.dateRow}>
          <span style={S.dateLabel}>Added between</span>

          <input
            type="date"
            className="dt-date"
            value={from}
            max={to && DAY.test(to) ? to : max}
            onChange={(e) => onFromChange(e.target.value)}
            style={S.date}
            aria-label="From date"
          />

          <span style={S.dateSep}>and</span>

          <input
            type="date"
            className="dt-date"
            value={to}
            min={from && DAY.test(from) ? from : undefined}
            max={max}
            onChange={(e) =>
              apply({ to: e.target.value || undefined }, { dropFolder: true })
            }
            style={S.date}
            aria-label="To date"
          />

          {from || to ? (
            <button
              type="button"
              onClick={() =>
                apply({ from: undefined, to: undefined }, { dropFolder: true })
              }
              style={S.dateClear}
            >
              Reset dates
            </button>
          ) : (
            <span style={S.dateHint}>Pick a start date to begin.</span>
          )}

          {backwards ? (
            <span style={S.dateWarn}>Start date is after the end date.</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const S = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    marginTop: 16,
  },

  topRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  filterRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },

  search: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 220,
    maxWidth: 420,
    padding: "0 12px",
    height: 38,
    background: "var(--bg)",
    border: "1px solid var(--line)",
    borderRadius: 999,
  },
  icon: { color: "var(--muted)", flexShrink: 0 },
  input: {
    flex: 1,
    minWidth: 0,
    height: "100%",
    border: "none",
    outline: "none",
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
  spacer: { flex: 1 },

  select: {
    height: 36,
    padding: "0 10px",
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 999,
    color: "var(--text-2)",
    fontSize: 13,
    cursor: "pointer",
    maxWidth: 180,
    transition: "border-color 90ms ease",
  },
  // An active filter is tinted, so it's obvious what's narrowing the list.
  selectOn: {
    height: 36,
    padding: "0 10px",
    background: "var(--accent-soft)",
    border: "1px solid var(--accent)",
    borderRadius: 999,
    color: "var(--accent)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    maxWidth: 180,
    transition: "border-color 90ms ease",
  },

  toggle: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 36,
    padding: "0 14px",
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 999,
    color: "var(--text-2)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  toggleOn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 36,
    padding: "0 14px",
    background: "var(--accent-soft)",
    border: "1px solid var(--accent)",
    borderRadius: 999,
    color: "var(--accent)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  clearAll: {
    height: 36,
    padding: "0 12px",
    background: "transparent",
    border: "none",
    color: "var(--accent)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  dateRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    padding: "12px 14px",
    background: "var(--bg)",
    border: "1px solid var(--line-soft)",
    borderRadius: "var(--r-card)",
  },
  dateLabel: { fontSize: 13, color: "var(--muted)", whiteSpace: "nowrap" },
  dateSep: { fontSize: 13, color: "var(--muted)" },
  date: {
    height: 36,
    padding: "0 10px",
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    color: "var(--text)",
    fontSize: 13,
    cursor: "pointer",
  },
  dateClear: {
    height: 36,
    padding: "0 10px",
    background: "transparent",
    border: "none",
    color: "var(--accent)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  dateHint: { fontSize: 12, color: "var(--muted)" },
  dateWarn: { fontSize: 12, color: "var(--danger)", fontWeight: 500 },
};
