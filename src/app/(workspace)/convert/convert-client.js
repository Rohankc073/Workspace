"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { FileIcon } from "../files/file-icon";

// Must line up with the TARGETS map in the convert route.
const CONVERSIONS = {
  docx: [{ to: "pdf", label: "PDF" }],
  doc: [
    { to: "pdf", label: "PDF" },
    { to: "docx", label: "Word (.docx)" },
  ],
  odt: [
    { to: "pdf", label: "PDF" },
    { to: "docx", label: "Word (.docx)" },
  ],
  xlsx: [
    { to: "csv", label: "CSV (first sheet)" },
    { to: "pdf", label: "PDF" },
  ],
  xls: [
    { to: "csv", label: "CSV (first sheet)" },
    { to: "pdf", label: "PDF" },
    { to: "xlsx", label: "Excel (.xlsx)" },
  ],
  csv: [
    { to: "xlsx", label: "Excel (.xlsx)" },
    { to: "pdf", label: "PDF" },
  ],
  pptx: [{ to: "pdf", label: "PDF" }],
  ppt: [
    { to: "pdf", label: "PDF" },
    { to: "pptx", label: "PowerPoint (.pptx)" },
  ],
  pdf: [{ to: "docx", label: "Word — editable (best effort)" }],
};

const ACCEPT = ".docx,.doc,.odt,.xlsx,.xls,.csv,.pptx,.ppt,.pdf";

/** Conversions worth warning about before someone waits on them. */
const CAVEATS = {
  "pdf>docx":
    "Layout from a PDF rarely survives perfectly. Expect to tidy up spacing and images.",
  "xlsx>csv":
    "CSV holds one sheet and no formulas — only the first sheet is kept.",
  "xls>csv":
    "CSV holds one sheet and no formulas — only the first sheet is kept.",
};

function fmtSize(bytes) {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

function extOf(name) {
  return (String(name).split(".").pop() || "").toLowerCase();
}

export default function ConvertClient({ files, companies }) {
  const [mode, setMode] = useState("drive");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  // Which target is currently running — lets the pressed button show its own
  // spinner instead of every button going flat and grey together.
  const [runningTo, setRunningTo] = useState(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);

  const busy = runningTo !== null;

  const selectedDrive = files.find((f) => f.id === selectedId) || null;
  const driveExt = selectedDrive ? selectedDrive.extension.toLowerCase() : null;
  const uploadExt = uploadFile ? extOf(uploadFile.name) : null;

  const activeExt = mode === "drive" ? driveExt : uploadExt;
  const targets = activeExt ? CONVERSIONS[activeExt] || [] : [];
  const hasChoice =
    mode === "drive" ? Boolean(selectedDrive) : Boolean(uploadFile);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return files;
    return files.filter(
      (f) =>
        f.name.toLowerCase().includes(needle) ||
        String(f.company).toLowerCase().includes(needle),
    );
  }, [files, query]);

  function chooseUpload(file) {
    if (!file) return;
    const ext = extOf(file.name);
    if (!CONVERSIONS[ext]) {
      setUploadFile(null);
      setError(
        `Can't convert .${ext} files. Try a Word, Excel, PowerPoint or PDF file.`,
      );
      return;
    }
    setError("");
    setUploadFile(file);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    chooseUpload(e.dataTransfer.files?.[0] ?? null);
  }

  async function run(to) {
    setRunningTo(to);
    setError("");
    setResult(null);
    try {
      let fileId;

      if (mode === "upload") {
        if (!uploadFile) {
          setError("Choose a file to upload first.");
          setRunningTo(null);
          return;
        }
        if (!companyId) {
          setError("Pick a company to upload into.");
          setRunningTo(null);
          return;
        }
        const form = new FormData();
        form.append("file", uploadFile);
        form.append("companyId", companyId);
        const up = await fetch("/api/files/upload", {
          method: "POST",
          body: form,
        });
        const upd = await up.json().catch(() => ({}));
        if (!up.ok) {
          setError(upd.error || "Could not upload that file.");
          setRunningTo(null);
          return;
        }
        fileId = upd.id;
      } else {
        if (!selectedId) {
          setError("Select a file first.");
          setRunningTo(null);
          return;
        }
        fileId = selectedId;
      }

      const res = await fetch(`/api/files/${fileId}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setResult({ id: data.id, name: data.name });
      } else {
        setError(data.error || "Conversion failed.");
      }
    } catch {
      setError("Conversion failed.");
    }
    setRunningTo(null);
  }

  function reset() {
    setResult(null);
    setError("");
    setSelectedId(null);
    setUploadFile(null);
    setQuery("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function clearChoice() {
    setSelectedId(null);
    setUploadFile(null);
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ---------------------------------------------------------------- result

  if (result) {
    return (
      <>
        <Header />
        <div style={S.resultCard}>
          <div style={S.resultIcon}>
            <FileIcon extension={extOf(result.name)} size={28} />
          </div>
          <div style={S.resultText}>
            <p style={S.resultTitle}>Converted</p>
            <p style={S.resultName}>{result.name}</p>
            <p style={S.resultHint}>Saved to your Drive.</p>
          </div>
          <div style={S.resultActions}>
            <Link href={`/edit/${result.id}`} style={S.btnPrimary}>
              Open
            </Link>
            <a href={`/api/files/${result.id}/download`} style={S.btnGhost}>
              Download
            </a>
            <button type="button" onClick={reset} style={S.btnGhost}>
              Convert another
            </button>
          </div>
        </div>
      </>
    );
  }

  // ----------------------------------------------------------------- form

  return (
    <>
      <style>{`
        .cv-row:hover { background: var(--bg); }
        .cv-row-on:hover { background: var(--accent-soft); }
        .cv-tab:hover { color: var(--text); }
        .cv-choice:hover:not(:disabled) { filter: brightness(1.06); }
        .cv-ghost:hover { background: var(--bg); }
        .cv-drop:hover { border-color: var(--accent); background: var(--accent-soft); }
        @keyframes cv-spin { to { transform: rotate(360deg); } }
        .cv-spin {
          width: 14px; height: 14px; display: inline-block;
          border: 2px solid rgba(255,255,255,.45);
          border-top-color: #fff; border-radius: 999px;
          animation: cv-spin 620ms linear infinite;
        }
      `}</style>

      <Header />

      {/* ---------- Step 1 ---------- */}
      <div style={S.stepHead}>
        <span style={S.stepNum}>1</span>
        <p style={S.stepLabel}>Choose a file</p>
      </div>

      {hasChoice ? (
        // Once something is picked, collapse the picker down to a summary —
        // scrolling back through 300 rows to check what you chose is a
        // pointless bit of friction.
        <div style={S.chosen}>
          <FileIcon extension={activeExt} size={26} />
          <span style={S.chosenText}>
            <span style={S.chosenName}>
              {mode === "drive" ? selectedDrive.name : uploadFile.name}
            </span>
            <span style={S.chosenMeta}>
              {mode === "drive"
                ? selectedDrive.company || "In your Drive"
                : `${fmtSize(uploadFile.size)} · will be added to your Drive`}
            </span>
          </span>
          <button
            type="button"
            className="cv-ghost"
            onClick={clearChoice}
            disabled={busy}
            style={S.btnGhost}
          >
            Change
          </button>
        </div>
      ) : (
        <>
          <div style={S.tabs}>
            <button
              type="button"
              className="cv-tab"
              onClick={() => {
                setMode("drive");
                setError("");
              }}
              style={mode === "drive" ? S.tabOn : S.tab}
            >
              From my Drive
            </button>
            <button
              type="button"
              className="cv-tab"
              onClick={() => {
                setMode("upload");
                setError("");
              }}
              style={mode === "upload" ? S.tabOn : S.tab}
            >
              Upload a file
            </button>
          </div>

          {mode === "drive" ? (
            <div style={S.panel}>
              <div style={S.searchWrap}>
                <svg
                  viewBox="0 0 24 24"
                  width="17"
                  height="17"
                  fill="currentColor"
                  aria-hidden="true"
                  style={S.searchIcon}
                >
                  <path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 5 1.5-1.5-5-5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z" />
                </svg>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search your files"
                  style={S.searchInput}
                  aria-label="Search your files"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    style={S.searchClear}
                    aria-label="Clear search"
                  >
                    ×
                  </button>
                ) : null}
              </div>

              <p style={S.listCount}>
                {query
                  ? `${filtered.length} of ${files.length} files`
                  : `${files.length} convertible ${files.length === 1 ? "file" : "files"}`}
              </p>

              <div style={S.list}>
                {filtered.length === 0 ? (
                  <p style={S.muted}>
                    {query
                      ? `Nothing matches “${query}”.`
                      : "No convertible files in your Drive yet."}
                  </p>
                ) : (
                  filtered.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className="cv-row"
                      onClick={() => {
                        setSelectedId(f.id);
                        setError("");
                      }}
                      style={S.row}
                    >
                      <FileIcon extension={f.extension} size={22} />
                      <span style={S.rowName}>{f.name}</span>
                      <span style={S.rowCompany}>{f.company}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div style={S.panel}>
              {companies.length === 0 ? (
                <p style={S.muted}>
                  You don’t have permission to upload into any company. Ask an
                  admin, or use the “From my Drive” tab.
                </p>
              ) : (
                <>
                  {companies.length > 1 ? (
                    <>
                      <label style={S.label} htmlFor="conv-co">
                        Upload into
                      </label>
                      <select
                        id="conv-co"
                        value={companyId}
                        onChange={(e) => setCompanyId(e.target.value)}
                        style={S.select}
                      >
                        {companies.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : null}

                  <div
                    className="cv-drop"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                    style={dragging ? S.dropOn : S.drop}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }
                    }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="30"
                      height="30"
                      fill="currentColor"
                      aria-hidden="true"
                      style={S.dropIcon}
                    >
                      <path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" />
                    </svg>
                    <p style={S.dropTitle}>
                      Drop a file here, or click to browse
                    </p>
                    <p style={S.dropHint}>Word, Excel, PowerPoint or PDF</p>
                  </div>

                  <input
                    ref={fileInputRef}
                    id="conv-file"
                    type="file"
                    accept={ACCEPT}
                    onChange={(e) => chooseUpload(e.target.files?.[0] ?? null)}
                    style={{ display: "none" }}
                  />
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* ---------- Step 2 ---------- */}
      <div style={hasChoice ? S.stepHead : S.stepHeadOff}>
        <span style={hasChoice ? S.stepNum : S.stepNumOff}>2</span>
        <p style={hasChoice ? S.stepLabel : S.stepLabelOff}>Convert to</p>
      </div>

      {!hasChoice ? (
        <p style={S.muted}>
          Pick a file above and the available formats appear here.
        </p>
      ) : targets.length === 0 ? (
        <p style={S.muted}>This file type can’t be converted.</p>
      ) : (
        <>
          <div style={S.choices}>
            {targets.map((t) => {
              const running = runningTo === t.to;
              return (
                <button
                  key={t.to}
                  type="button"
                  className="cv-choice"
                  onClick={() => run(t.to)}
                  disabled={busy}
                  style={busy && !running ? S.choiceOff : S.choice}
                >
                  {running ? <span className="cv-spin" /> : null}
                  {running ? "Converting…" : t.label}
                </button>
              );
            })}
          </div>

          {targets.map((t) => {
            const note = CAVEATS[`${activeExt}>${t.to}`];
            return note ? (
              <p key={t.to} style={S.caveat}>
                {note}
              </p>
            ) : null;
          })}
        </>
      )}

      {busy ? (
        <p style={S.working}>
          Working on it. Large files can take up to a minute — leaving this page
          cancels it.
        </p>
      ) : null}

      {error ? (
        <p style={S.error} role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}

function Header() {
  return (
    <header style={S.head}>
      <p style={S.eyebrow}>Tools</p>
      <h1 style={S.h1}>Convert</h1>
      <p style={S.sub}>
        Turn a document into another format. The converted copy is saved to your
        Drive, ready to download.
      </p>
    </header>
  );
}

const S = {
  head: {
    paddingBottom: 22,
    borderBottom: "1px solid var(--line-soft)",
    marginBottom: 26,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: ".09em",
    textTransform: "uppercase",
    color: "var(--muted)",
    marginBottom: 10,
  },
  h1: {
    fontSize: 30,
    fontWeight: 400,
    letterSpacing: "-0.02em",
    color: "var(--text)",
  },
  sub: {
    fontSize: 14,
    color: "var(--muted)",
    marginTop: 8,
    lineHeight: 1.5,
    maxWidth: 560,
  },

  // Numbered steps, so the page reads as a sequence rather than two
  // unrelated blocks with a gap between them.
  stepHead: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    margin: "26px 0 12px",
  },
  stepHeadOff: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    margin: "26px 0 12px",
    opacity: 0.55,
  },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 999,
    background: "var(--accent)",
    color: "#fff",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 600,
    flexShrink: 0,
  },
  stepNumOff: {
    width: 24,
    height: 24,
    borderRadius: 999,
    background: "var(--bg)",
    color: "var(--muted)",
    border: "1px solid var(--line)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 600,
    flexShrink: 0,
  },
  stepLabel: { fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" },
  stepLabelOff: { fontSize: 15, fontWeight: 600, color: "var(--muted)" },

  tabs: {
    display: "flex",
    gap: 4,
    marginBottom: 16,
    borderBottom: "1px solid var(--line)",
  },
  tab: {
    padding: "10px 14px",
    fontSize: 14,
    color: "var(--muted)",
    background: "none",
    border: "none",
    borderBottom: "3px solid transparent",
    cursor: "pointer",
    transition: "color .15s ease",
  },
  tabOn: {
    padding: "10px 14px",
    fontSize: 14,
    fontWeight: 500,
    color: "var(--accent)",
    background: "none",
    border: "none",
    borderBottom: "3px solid var(--accent)",
    cursor: "pointer",
  },

  panel: {
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: "var(--r-card)",
    padding: 18,
    boxShadow: "0 1px 2px rgba(17,24,39,.04)",
  },

  chosen: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "14px 18px",
    background: "var(--panel)",
    border: "1px solid var(--accent)",
    borderRadius: "var(--r-card)",
    boxShadow: "0 1px 2px rgba(17,24,39,.04)",
  },
  chosenText: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  chosenName: {
    fontSize: 15,
    fontWeight: 500,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  chosenMeta: { fontSize: 12.5, color: "var(--muted)" },

  searchWrap: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    height: 40,
    padding: "0 12px",
    background: "var(--bg)",
    border: "1px solid var(--line)",
    borderRadius: 999,
  },
  searchIcon: { color: "var(--muted)", flexShrink: 0 },
  searchInput: {
    flex: 1,
    minWidth: 0,
    height: "100%",
    border: "none",
    outline: "none",
    background: "transparent",
    color: "var(--text)",
    fontSize: 14,
  },
  searchClear: {
    border: "none",
    background: "transparent",
    color: "var(--muted)",
    fontSize: 20,
    lineHeight: 1,
    cursor: "pointer",
    padding: 0,
  },
  listCount: { fontSize: 12, color: "var(--muted)", margin: "12px 2px 8px" },
  list: {
    maxHeight: 360,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    padding: "10px 12px",
    background: "none",
    border: "1px solid transparent",
    borderRadius: 8,
    textAlign: "left",
    cursor: "pointer",
    color: "var(--text)",
    transition: "background-color .12s ease",
  },
  rowName: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  rowCompany: { fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" },

  label: {
    display: "block",
    fontSize: 13,
    color: "var(--muted)",
    margin: "4px 0 6px",
  },
  select: {
    width: "100%",
    boxSizing: "border-box",
    padding: "9px 12px",
    fontSize: 14,
    background: "var(--bg)",
    color: "var(--text)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    marginBottom: 16,
  },

  drop: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    padding: "38px 20px",
    border: "2px dashed var(--line)",
    borderRadius: "var(--r-card)",
    background: "var(--bg)",
    cursor: "pointer",
    textAlign: "center",
    transition: "border-color .15s ease, background .15s ease",
  },
  dropOn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    padding: "38px 20px",
    border: "2px dashed var(--accent)",
    borderRadius: "var(--r-card)",
    background: "var(--accent-soft)",
    cursor: "pointer",
    textAlign: "center",
  },
  dropIcon: { color: "var(--muted)", marginBottom: 4 },
  dropTitle: { fontSize: 14, fontWeight: 500, color: "var(--text)" },
  dropHint: { fontSize: 12.5, color: "var(--muted)" },

  choices: { display: "flex", flexWrap: "wrap", gap: 10 },
  choice: {
    display: "inline-flex",
    alignItems: "center",
    gap: 9,
    padding: "11px 20px",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    transition: "filter .12s ease",
  },
  choiceOff: {
    display: "inline-flex",
    alignItems: "center",
    gap: 9,
    padding: "11px 20px",
    fontSize: 14,
    fontWeight: 500,
    cursor: "default",
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    opacity: 0.4,
  },
  caveat: {
    fontSize: 12.5,
    color: "var(--muted)",
    marginTop: 12,
    lineHeight: 1.5,
    maxWidth: 560,
  },
  working: { fontSize: 13, color: "var(--muted)", marginTop: 16 },
  error: {
    fontSize: 13,
    color: "var(--danger)",
    background: "var(--danger-soft)",
    padding: "10px 14px",
    borderRadius: "var(--r-card)",
    marginTop: 16,
  },
  muted: { fontSize: 13, color: "var(--muted)", padding: "8px 0" },

  resultCard: {
    display: "flex",
    alignItems: "center",
    gap: 18,
    flexWrap: "wrap",
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: "var(--r-card)",
    padding: 24,
    boxShadow: "0 1px 2px rgba(17,24,39,.04)",
  },
  resultIcon: {
    width: 52,
    height: 52,
    borderRadius: 12,
    background: "var(--accent-soft)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  resultText: { flex: 1, minWidth: 200 },
  resultTitle: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: ".06em",
    textTransform: "uppercase",
    color: "var(--accent)",
  },
  resultName: {
    fontSize: 16,
    fontWeight: 500,
    marginTop: 4,
    wordBreak: "break-word",
  },
  resultHint: { fontSize: 13, color: "var(--muted)", marginTop: 2 },
  resultActions: { display: "flex", gap: 8, flexWrap: "wrap" },
  btnPrimary: {
    display: "inline-flex",
    alignItems: "center",
    padding: "9px 16px",
    fontSize: 14,
    fontWeight: 500,
    textDecoration: "none",
    background: "var(--accent)",
    color: "#fff",
    borderRadius: 8,
  },
  btnGhost: {
    display: "inline-flex",
    alignItems: "center",
    padding: "9px 16px",
    fontSize: 14,
    fontWeight: 500,
    textDecoration: "none",
    background: "transparent",
    color: "var(--text)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    cursor: "pointer",
  },
};
