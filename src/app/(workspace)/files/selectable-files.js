"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import AccessPanel from "./access-panel";
import ConfirmDialog from "./confirm-dialog";
import { FileIcon, FileTile, FolderIcon, FolderTile } from "./file-icon";
import FileMenu from "./file-menu";
import FolderDeleteButton from "./folder-delete-button";
import PurgeButton from "./purge-button";
import RestoreButton from "./restore-button";

function fmt(s) {
  // Explicit locale so the server and browser render the SAME string —
  // otherwise SSR (US order) and the browser (local order) disagree and
  // React throws a hydration mismatch. Use 'en-US' here for US-style dates.
  return s
    ? new Date(s).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "";
}

const BUCKET_ORDER = [
  "Today",
  "Yesterday",
  "Earlier this week",
  "Earlier this month",
  "Older",
];

// Split a file list into date buckets, keeping the incoming order within each.
function groupByBucket(files) {
  const map = new Map();
  for (const f of files) {
    const b = f.bucket || "Older";
    if (!map.has(b)) map.set(b, []);
    map.get(b).push(f);
  }
  return BUCKET_ORDER.filter((b) => map.has(b)).map((b) => ({
    label: b,
    items: map.get(b),
  }));
}

export default function SelectableFiles({
  view,
  layout,
  group,
  folders,
  files,
  emptyText,
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const allRef = useRef(null);

  const selectableIds = files.filter((f) => f.canManage).map((f) => f.id);
  const allSelected =
    selectableIds.length > 0 && selected.size === selectableIds.length;

  // Group only when asked, and never in trash (where "date added" is irrelevant).
  const grouped = group === "date" && view !== "trash";

  // Columns: box, Name, Company, Created by, Added, Modified/Deleted, actions.
  const COLS = 7;

  // Drop any selection that no longer exists after a refresh.
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set(
        [...prev].filter((id) => selectableIds.includes(id)),
      );
      return next.size === prev.size ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.map((f) => f.id).join(",")]);

  useEffect(() => {
    if (allRef.current) {
      allRef.current.indeterminate =
        selected.size > 0 && selected.size < selectableIds.length;
    }
  }, [selected, selectableIds.length]);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectableIds));
  }

  // The bulk purge is confirmed through the same dialog as everything else;
  // `pending` holds the action until it's confirmed.
  const [pending, setPending] = useState(null);

  function ask(action) {
    if (selected.size === 0) return;
    // Restore is harmless and instant; the two destructive ones ask first.
    if (action === "purge" || action === "trash") {
      setPending(action);
      return;
    }
    run(action);
  }

  async function run(action) {
    if (selected.size === 0) return;

    setBusy(true);
    try {
      const res = await fetch("/api/files/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], action }),
      });
      if (res.ok) {
        setSelected(new Set());
        setPending(null);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error || "Could not complete that action.");
      }
    } catch {
      window.alert("Could not complete that action.");
    }
    setBusy(false);
  }

  // Drag-to-folder was removed: `draggable` on the whole row meant any
  // click-and-hold started a drag, which fought with selecting text and with
  // inputs rendered inside the row. The ⋮ menu's "Move" does the same job
  // predictably, and it's the only route on a touch screen anyway.

  const count = selected.size;

  const bar =
    selectableIds.length > 0 ? (
      <div style={S.bar}>
        <label style={S.selAll}>
          <input
            ref={allRef}
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            style={S.box}
          />
          <span>{count > 0 ? `${count} selected` : "Select all"}</span>
        </label>

        {count > 0 ? (
          <div style={S.barActions}>
            {view === "trash" ? (
              <>
                <button
                  type="button"
                  onClick={() => ask("restore")}
                  disabled={busy}
                  style={S.action}
                >
                  Restore
                </button>
                <button
                  type="button"
                  onClick={() => ask("purge")}
                  disabled={busy}
                  style={S.actionDanger}
                >
                  Delete forever
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => ask("trash")}
                disabled={busy}
                style={S.actionDanger}
              >
                Move to trash
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              style={S.clear}
            >
              Clear
            </button>
          </div>
        ) : null}
      </div>
    ) : null;

  const countLabel = `${count} ${count === 1 ? "file" : "files"}`;

  const confirmDialog = pending ? (
    pending === "purge" ? (
      <ConfirmDialog
        eyebrow="Delete forever"
        title={countLabel}
        message="This permanently removes them and every saved version. It cannot be undone."
        confirmLabel="Delete forever"
        danger
        busy={busy}
        onConfirm={() => run("purge")}
        onClose={() => setPending(null)}
      />
    ) : (
      <ConfirmDialog
        eyebrow="Move to trash"
        title={countLabel}
        message="They move to the trash and stop appearing in the Drive. You can restore them from there."
        confirmLabel="Move to trash"
        danger
        busy={busy}
        onConfirm={() => run("trash")}
        onClose={() => setPending(null)}
      />
    )
  ) : null;

  if (folders.length === 0 && files.length === 0) {
    return (
      <div style={S.empty}>
        <p style={S.muted}>{emptyText}</p>
      </div>
    );
  }

  function Box({ file }) {
    if (!file.canManage) return <span style={S.boxSpacer} />;
    return (
      <input
        type="checkbox"
        checked={selected.has(file.id)}
        onChange={() => toggle(file.id)}
        onClick={(e) => e.stopPropagation()}
        style={S.box}
        aria-label={`Select ${file.name}`}
      />
    );
  }

  // ---- GRID ----
  function FileCard(f) {
    return (
      <div
        key={f.id}
        style={selected.has(f.id) ? { ...S.card, ...S.cardOn } : S.card}
      >
        <Link
          href={view === "trash" ? "#" : `/edit/${f.id}`}
          style={S.cardLink}
        >
          <FileTile extension={f.extension} />
          <div style={S.cardFoot}>
            <FileIcon extension={f.extension} size={16} />
            <span style={S.cardName}>{f.name}</span>
          </div>
        </Link>
        <div style={S.cardActions}>
          <span style={S.cardMetaRow}>
            <Box file={f} />
            <span style={S.cardMetaText}>
              {view === "trash"
                ? `Deleted ${fmt(f.deletedAt)}`
                : `Added ${fmt(f.createdAt)}`}
              {view !== "trash" && f.createdBy ? ` · ${f.createdBy}` : ""}
            </span>
          </span>
          {view === "trash" ? (
            f.canManage && (
              <span style={S.trashActions}>
                <RestoreButton id={f.id} />
                <PurgeButton id={f.id} fileName={f.name} />
              </span>
            )
          ) : (
            <span style={S.rowEnd}>
              <AccessPanel fileId={f.id} fileName={f.name} />
              <FileMenu
                fileId={f.id}
                fileName={f.name}
                canShare={f.canManage}
                canDelete={f.canManage}
                canMove={f.canManage}
              />
            </span>
          )}
        </div>
      </div>
    );
  }

  if (layout === "grid") {
    return (
      <>
        {bar}
        {confirmDialog}
        <div style={S.grid}>
          {folders.map((f) => (
            <div key={f.id} style={S.card}>
              <Link href={`/files?folder=${f.id}`} style={S.cardLink}>
                <FolderTile />
                <div style={S.cardFoot}>
                  <FolderIcon size={16} />
                  <span style={S.cardName}>{f.name}</span>
                </div>
              </Link>
              <div style={S.cardActions}>
                <span style={S.cardMetaText}>
                  {f.files} files, {f.children} folders
                </span>
                {f.canManage ? <FolderDeleteButton id={f.id} /> : null}
              </div>
            </div>
          ))}

          {grouped
            ? groupByBucket(files).map((g) => (
                <div key={g.label} style={{ display: "contents" }}>
                  <div style={S.groupHeadGrid}>
                    {g.label} <span style={S.groupCount}>{g.items.length}</span>
                  </div>
                  {g.items.map((f) => FileCard(f))}
                </div>
              ))
            : files.map((f) => FileCard(f))}
        </div>
      </>
    );
  }

  // ---- LIST ----
  function FileRow(f) {
    return (
      <tr key={f.id} style={selected.has(f.id) ? S.rowOn : undefined}>
        <td style={S.tdBox}>
          <Box file={f} />
        </td>
        <td style={S.td}>
          {view === "trash" ? (
            <span style={S.nameCell}>
              <FileIcon extension={f.extension} />
              <span style={S.nameMuted}>{f.name}</span>
            </span>
          ) : (
            <Link href={`/edit/${f.id}`} style={S.nameCell}>
              <FileIcon extension={f.extension} />
              <span style={S.name}>{f.name}</span>
            </Link>
          )}
        </td>
        <td style={S.tdMuted}>{f.company}</td>
        <td style={S.tdMuted}>{f.createdBy || "—"}</td>
        {/* Date added — what the date filters match on. */}
        <td style={S.tdMuted}>{fmt(f.createdAt)}</td>
        <td style={S.tdMuted}>
          {fmt(view === "trash" ? f.deletedAt : f.updatedAt)}
        </td>
        <td style={S.tdRight}>
          {view === "trash" ? (
            f.canManage ? (
              <span style={S.trashActions}>
                <RestoreButton id={f.id} />
                <PurgeButton id={f.id} fileName={f.name} />
              </span>
            ) : (
              <span style={S.muted}>No access</span>
            )
          ) : (
            <span style={S.rowEnd}>
              <AccessPanel fileId={f.id} fileName={f.name} />
              <FileMenu
                fileId={f.id}
                fileName={f.name}
                canShare={f.canManage}
                canDelete={f.canManage}
                canMove={f.canManage}
              />
            </span>
          )}
        </td>
      </tr>
    );
  }

  return (
    <>
      {bar}
      {confirmDialog}
      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.thBox} />
              <th style={S.th}>Name</th>
              <th style={S.th}>Company</th>
              <th style={S.th}>Created by</th>
              <th style={S.th}>Added</th>
              <th style={S.th}>{view === "trash" ? "Deleted" : "Modified"}</th>
              <th style={S.thRight} />
            </tr>
          </thead>
          <tbody>
            {folders.map((f) => (
              <tr key={f.id}>
                <td style={S.tdBox} />
                <td style={S.td}>
                  <Link href={`/files?folder=${f.id}`} style={S.nameCell}>
                    <FolderIcon />
                    <span style={S.name}>{f.name}</span>
                  </Link>
                </td>
                <td style={S.tdMuted}>
                  {f.files} files, {f.children} folders
                </td>
                <td style={S.tdMuted}>—</td>
                <td style={S.tdMuted}>{fmt(f.createdAt)}</td>
                <td style={S.tdMuted}>—</td>
                <td style={S.tdRight}>
                  {f.canManage ? <FolderDeleteButton id={f.id} /> : null}
                </td>
              </tr>
            ))}

            {grouped
              ? groupByBucket(files).map((g) => (
                  <Fragment key={g.label}>
                    <tr>
                      <td colSpan={COLS} style={S.groupHead}>
                        {g.label}{" "}
                        <span style={S.groupCount}>{g.items.length}</span>
                      </td>
                    </tr>
                    {g.items.map((f) => FileRow(f))}
                  </Fragment>
                ))
              : files.map((f) => FileRow(f))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const S = {
  bar: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    minHeight: 44,
    padding: "6px 12px",
    margin: "16px 0 4px",
    background: "var(--bg)",
    border: "1px solid var(--line)",
    borderRadius: 10,
  },
  selAll: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    fontWeight: 500,
    color: "var(--text)",
    cursor: "pointer",
  },
  barActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginLeft: "auto",
  },
  action: {
    padding: "7px 13px",
    background: "transparent",
    color: "var(--text)",
    border: "1px solid var(--line)",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  },
  actionDanger: {
    padding: "7px 13px",
    background: "transparent",
    color: "var(--danger)",
    border: "1px solid var(--line)",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  },
  clear: {
    padding: "7px 8px",
    background: "transparent",
    color: "var(--muted)",
    border: "none",
    fontSize: 13,
    cursor: "pointer",
  },
  box: {
    width: 16,
    height: 16,
    accentColor: "var(--accent)",
    cursor: "pointer",
    flexShrink: 0,
  },
  boxSpacer: { display: "inline-block", width: 16, height: 16, flexShrink: 0 },

  empty: {
    marginTop: 20,
    padding: "56px 28px",
    background: "var(--bg)",
    borderRadius: "var(--r-card)",
    textAlign: "center",
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
    gap: 14,
    marginTop: 16,
  },
  groupHeadGrid: {
    gridColumn: "1 / -1",
    marginTop: 10,
    paddingLeft: 2,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: ".05em",
    textTransform: "uppercase",
    color: "var(--muted)",
  },
  card: {
    display: "block",
    position: "relative",
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: "var(--r-card)",
    textDecoration: "none",
    color: "var(--text)",
  },
  // Spread OVER S.card, so it repeats the whole `border` shorthand rather
  // than just borderColor. Mixing the two means React has to remove
  // borderColor while `border` is still set when a card is deselected — it
  // warns about exactly that, and the border can render inconsistently.
  cardOn: {
    border: "1px solid var(--accent)",
    boxShadow: "0 0 0 1px var(--accent)",
  },
  cardLink: { display: "block", textDecoration: "none", color: "var(--text)" },
  cardFoot: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 14px 4px",
  },
  cardName: {
    fontSize: 14,
    fontWeight: 500,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  cardMeta: { fontSize: 12, color: "var(--muted)", padding: "0 14px 12px" },
  cardActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "0 10px 10px 14px",
  },
  cardMetaRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  cardMetaText: {
    fontSize: 12,
    color: "var(--muted)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  // Six columns is wide; let it scroll rather than crush the name column.
  tableWrap: { width: "100%", overflowX: "auto" },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    marginTop: 8,
    minWidth: 760,
  },
  th: {
    textAlign: "left",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--muted)",
    padding: "14px 12px 12px 0",
    whiteSpace: "nowrap",
  },
  thBox: { width: 36, padding: "14px 8px 12px 4px" },
  thRight: { padding: "14px 0 12px" },
  groupHead: {
    padding: "18px 12px 8px 0",
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: ".05em",
    textTransform: "uppercase",
    color: "var(--muted)",
  },
  groupCount: {
    fontSize: 11,
    fontWeight: 500,
    color: "var(--muted)",
    marginLeft: 6,
  },
  td: {
    padding: "10px 12px 10px 0",
    borderTop: "1px solid var(--line-soft)",
    fontSize: 14,
  },
  tdBox: {
    width: 36,
    padding: "10px 8px 10px 4px",
    borderTop: "1px solid var(--line-soft)",
    verticalAlign: "middle",
  },
  tdMuted: {
    padding: "10px 12px 10px 0",
    borderTop: "1px solid var(--line-soft)",
    fontSize: 13,
    color: "var(--muted)",
    whiteSpace: "nowrap",
  },
  tdRight: {
    padding: "10px 0",
    borderTop: "1px solid var(--line-soft)",
    textAlign: "right",
  },
  rowEnd: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    justifyContent: "flex-end",
  },
  rowOn: { background: "var(--accent-soft)" },
  nameCell: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    textDecoration: "none",
    color: "var(--text)",
    minWidth: 0,
  },
  name: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  nameMuted: { color: "var(--muted)" },
  muted: { fontSize: 13, color: "var(--muted)" },
  trashActions: { display: "inline-flex", alignItems: "center", gap: 14 },
};
