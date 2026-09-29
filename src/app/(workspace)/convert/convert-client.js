"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { FileIcon } from "../files/file-icon";

// Must line up with the TARGETS map in the convert route.
const CONVERSIONS = {
  docx: [{ to: "pdf", label: "PDF", note: "Fixed layout, opens anywhere." }],
  doc: [
    { to: "docx", label: "Word (.docx)", note: "Modern Word format." },
    { to: "pdf", label: "PDF", note: "Fixed layout, opens anywhere." },
  ],
  odt: [
    { to: "docx", label: "Word (.docx)", note: "Modern Word format." },
    { to: "pdf", label: "PDF", note: "Fixed layout, opens anywhere." },
  ],
  xlsx: [
    { to: "pdf", label: "PDF", note: "Fixed layout, opens anywhere." },
    { to: "csv", label: "CSV", note: "First sheet only. Formulas are lost." },
  ],
  xls: [
    { to: "xlsx", label: "Excel (.xlsx)", note: "Modern Excel format." },
    { to: "pdf", label: "PDF", note: "Fixed layout, opens anywhere." },
    { to: "csv", label: "CSV", note: "First sheet only. Formulas are lost." },
  ],
  csv: [
    {
      to: "xlsx",
      label: "Excel (.xlsx)",
      note: "Adds formatting and formulas.",
    },
    { to: "pdf", label: "PDF", note: "Fixed layout, opens anywhere." },
  ],
  pptx: [{ to: "pdf", label: "PDF", note: "One page per slide." }],
  ppt: [
    {
      to: "pptx",
      label: "PowerPoint (.pptx)",
      note: "Modern PowerPoint format.",
    },
    { to: "pdf", label: "PDF", note: "One page per slide." },
  ],
  pdf: [
    {
      to: "docx",
      label: "Word (.docx)",
      note: "Best effort — expect to tidy up spacing and images.",
    },
  ],
};

const ACCEPT = ".docx,.doc,.odt,.xlsx,.xls,.csv,.pptx,.ppt,.pdf";
const STEPS = ["Source", "File", "Format"];

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
  // One screen at a time: source -> file -> format -> done. Every screen
  // except the first has a Back button, so nothing is a dead end.
  const [step, setStep] = useState("source");
  const [mode, setMode] = useState(null); // 'drive' | 'upload'

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [target, setTarget] = useState(null);

  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);

  const selectedDrive = files.find((f) => f.id === selectedId) || null;
  const activeExt =
    mode === "drive"
      ? (selectedDrive?.extension?.toLowerCase() ?? null)
      : uploadFile
        ? extOf(uploadFile.name)
        : null;
  const targets = activeExt ? CONVERSIONS[activeExt] || [] : [];

  const chosenName =
    mode === "drive" ? selectedDrive?.name : (uploadFile?.name ?? null);
  const chosenMeta =
    mode === "drive"
      ? selectedDrive?.company || "In your Drive"
      : uploadFile
        ? `${fmtSize(uploadFile.size)} · will be added to your Drive`
        : "";

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return files;
    return files.filter(
      (f) =>
        f.name.toLowerCase().includes(needle) ||
        String(f.company).toLowerCase().includes(needle),
    );
  }, [files, query]);

  // ---------------------------------------------------------- navigation

  function goSource() {
    setStep("source");
    setMode(null);
    setSelectedId(null);
    setUploadFile(null);
    setTarget(null);
    setError("");
    setQuery("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function pickMode(next) {
    setMode(next);
    setError("");
    setStep("pick");
  }

  function backToPick() {
    setTarget(null);
    setError("");
    setStep("pick");
  }

  function chooseDriveFile(id) {
    setSelectedId(id);
    setError("");
    setTarget(null);
    setStep("format");
  }

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
    setTarget(null);
    setStep("format");
  }

  function startOver() {
    setResult(null);
    goSource();
  }

  // -------------------------------------------------------------- action

  async function convert() {
    if (!target) return;
    setRunning(true);
    setError("");

    try {
      let fileId;

      if (mode === "upload") {
        if (!companyId) {
          setError("Pick a company to upload into.");
          setRunning(false);
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
          setRunning(false);
          return;
        }
        fileId = upd.id;
      } else {
        fileId = selectedId;
      }

      const res = await fetch(`/api/files/${fileId}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: target }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setResult({ id: data.id, name: data.name });
        setStep("done");
      } else {
        setError(data.error || "Conversion failed.");
      }
    } catch {
      setError("Conversion failed.");
    }
    setRunning(false);
  }

  // -------------------------------------------------------------- render

  const stepIndex =
    step === "source" ? 0 : step === "pick" ? 1 : step === "format" ? 2 : 3;

  return (
    <>
      <style>{`
        .cv-row:hover { background: var(--bg); }
        .cv-card:hover { border-color: var(--accent); background: var(--accent-soft); }
        .cv-back:hover { color: var(--text); }
        .cv-opt:hover { border-color: var(--accent); }
        .cv-ghost:hover { background: var(--bg); }
        .cv-primary:hover:not(:disabled) { filter: brightness(1.06); }
        .cv-drop:hover { border-color: var(--accent); background: var(--accent-soft); }
        @keyframes cv-spin { to { transform: rotate(360deg); } }
        .cv-spin {
          width: 15px; height: 15px; display: inline-block;
          border: 2px solid rgba(255,255,255,.45);
          border-top-color: #fff; border-radius: 999px;
          animation: cv-spin 620ms linear infinite;
        }
      `}</style>

      <header style={S.head}>
        <p style={S.eyebrow}>Tools</p>
        <h1 style={S.h1}>Convert</h1>
        <p style={S.sub}>
          Turn a document into another format. The converted copy is saved to
          your Drive.
        </p>
      </header>

      {step !== "done" ? (
        <ol style={S.crumbs}>
          {STEPS.map((label, i) => (
            <li key={label} style={S.crumbItem}>
              <span
                style={
                  i === stepIndex
                    ? S.crumbOn
                    : i < stepIndex
                      ? S.crumbDone
                      : S.crumb
                }
              >
                {label}
              </span>
              {i < STEPS.length - 1 ? <span style={S.crumbSep}>›</span> : null}
            </li>
          ))}
        </ol>
      ) : null}

      {/* ------------------------------------------------ 1. source */}
      {step === "source" ? (
        <div style={S.cardRow}>
          <button
            type="button"
            className="cv-card"
            onClick={() => pickMode("drive")}
            style={S.bigCard}
          >
            <svg
              viewBox="0 0 24 24"
              width="26"
              height="26"
              fill="currentColor"
              style={S.bigIcon}
            >
              <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
            </svg>
            <span style={S.bigTitle}>From my Drive</span>
            <span style={S.bigHint}>
              Pick one of your {files.length} convertible{" "}
              {files.length === 1 ? "file" : "files"}
            </span>
          </button>

          <button
            type="button"
            className="cv-card"
            onClick={() => pickMode("upload")}
            style={S.bigCard}
            disabled={companies.length === 0}
          >
            <svg
              viewBox="0 0 24 24"
              width="26"
              height="26"
              fill="currentColor"
              style={S.bigIcon}
            >
              <path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" />
            </svg>
            <span style={S.bigTitle}>Upload a file</span>
            <span style={S.bigHint}>
              {companies.length === 0
                ? "You can't upload into any company"
                : "From your computer"}
            </span>
          </button>
        </div>
      ) : null}

      {/* -------------------------------------------------- 2. file */}
      {step === "pick" ? (
        <>
          <BackButton onClick={goSource} label="Back to source" />

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
                  autoFocus
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
                  : "Click a file to continue"}
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
                      onClick={() => chooseDriveFile(f.id)}
                      style={S.row}
                    >
                      <FileIcon extension={f.extension} size={22} />
                      <span style={S.rowName}>{f.name}</span>
                      <span style={S.rowCompany}>{f.company}</span>
                      <span style={S.rowChevron}>›</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div style={S.panel}>
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
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  chooseUpload(e.dataTransfer.files?.[0] ?? null);
                }}
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
                <p style={S.dropTitle}>Drop a file here, or click to browse</p>
                <p style={S.dropHint}>Word, Excel, PowerPoint or PDF</p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT}
                onChange={(e) => chooseUpload(e.target.files?.[0] ?? null)}
                style={{ display: "none" }}
              />
            </div>
          )}
        </>
      ) : null}

      {/* ------------------------------------------------ 3. format */}
      {step === "format" ? (
        <>
          <BackButton
            onClick={backToPick}
            label={
              mode === "drive"
                ? "Choose a different file"
                : "Choose a different file"
            }
            disabled={running}
          />

          <div style={S.chosen}>
            <FileIcon extension={activeExt} size={26} />
            <span style={S.chosenText}>
              <span style={S.chosenName}>{chosenName}</span>
              <span style={S.chosenMeta}>{chosenMeta}</span>
            </span>
          </div>

          <p style={S.formatLabel}>Convert it to</p>

          <div style={S.options}>
            {targets.map((t) => (
              <button
                key={t.to}
                type="button"
                className="cv-opt"
                onClick={() => setTarget(t.to)}
                disabled={running}
                style={target === t.to ? S.optOn : S.opt}
              >
                <span style={target === t.to ? S.radioOn : S.radio} />
                <span style={S.optText}>
                  <span style={S.optTitle}>{t.label}</span>
                  <span style={S.optNote}>{t.note}</span>
                </span>
              </button>
            ))}
          </div>

          <div style={S.actions}>
            <button
              type="button"
              className="cv-primary"
              onClick={convert}
              disabled={!target || running}
              style={!target || running ? S.primaryOff : S.primary}
            >
              {running ? <span className="cv-spin" /> : null}
              {running ? "Converting…" : "Convert"}
            </button>
            <button
              type="button"
              className="cv-ghost"
              onClick={goSource}
              disabled={running}
              style={S.btnGhost}
            >
              Cancel
            </button>
          </div>

          {running ? (
            <p style={S.working}>
              Large files can take up to a minute. Leaving this page cancels it.
            </p>
          ) : null}
        </>
      ) : null}

      {/* --------------------------------------------------- 4. done */}
      {step === "done" && result ? (
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
            <Link href={`/edit/${result.id}`} style={S.btnPrimaryLink}>
              Open
            </Link>
            <a href={`/api/files/${result.id}/download`} style={S.btnGhost}>
              Download
            </a>
            <button
              type="button"
              className="cv-ghost"
              onClick={startOver}
              style={S.btnGhost}
            >
              Convert another
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p style={S.error} role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}

function BackButton({ onClick, label, disabled }) {
  return (
    <button
      type="button"
      className="cv-back"
      onClick={onClick}
      disabled={disabled}
      style={S.back}
    >
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
      </svg>
      {label}
    </button>
  );
}

const S = {
  head: {
    paddingBottom: 22,
    borderBottom: "1px solid var(--line-soft)",
    marginBottom: 20,
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

  crumbs: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    listStyle: "none",
    marginBottom: 20,
    padding: 0,
  },
  crumbItem: { display: "inline-flex", alignItems: "center", gap: 8 },
  crumb: { fontSize: 13, color: "var(--muted)" },
  crumbDone: { fontSize: 13, color: "var(--accent)", fontWeight: 500 },
  crumbOn: { fontSize: 13, color: "var(--text)", fontWeight: 600 },
  crumbSep: { fontSize: 13, color: "var(--muted)" },

  back: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    marginBottom: 14,
    padding: 0,
    background: "none",
    border: "none",
    color: "var(--muted)",
    fontSize: 13.5,
    fontWeight: 500,
    cursor: "pointer",
    transition: "color .14s ease",
  },

  cardRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
    gap: 14,
  },
  bigCard: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 6,
    padding: "24px 22px",
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: "var(--r-card)",
    cursor: "pointer",
    textAlign: "left",
    color: "var(--text)",
    transition: "border-color .15s ease, background .15s ease",
  },
  bigIcon: { color: "var(--accent)", marginBottom: 6 },
  bigTitle: { fontSize: 15, fontWeight: 600 },
  bigHint: { fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 },

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
    border: "1px solid var(--line)",
    borderRadius: "var(--r-card)",
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

  formatLabel: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: ".06em",
    textTransform: "uppercase",
    color: "var(--muted)",
    margin: "24px 0 10px",
  },
  options: { display: "flex", flexDirection: "column", gap: 8, maxWidth: 460 },
  opt: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "14px 16px",
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 10,
    cursor: "pointer",
    textAlign: "left",
    transition: "border-color .14s ease",
  },
  optOn: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "14px 16px",
    background: "var(--accent-soft)",
    border: "1px solid var(--accent)",
    borderRadius: 10,
    cursor: "pointer",
    textAlign: "left",
  },
  radio: {
    width: 16,
    height: 16,
    borderRadius: 999,
    border: "2px solid var(--line)",
    marginTop: 2,
    flexShrink: 0,
  },
  radioOn: {
    width: 16,
    height: 16,
    borderRadius: 999,
    border: "5px solid var(--accent)",
    marginTop: 2,
    flexShrink: 0,
  },
  optText: { display: "flex", flexDirection: "column", gap: 3, minWidth: 0 },
  optTitle: { fontSize: 14, fontWeight: 500, color: "var(--text)" },
  optNote: { fontSize: 12.5, color: "var(--muted)", lineHeight: 1.45 },

  actions: { display: "flex", gap: 10, marginTop: 22, flexWrap: "wrap" },
  primary: {
    display: "inline-flex",
    alignItems: "center",
    gap: 9,
    padding: "12px 26px",
    fontSize: 14.5,
    fontWeight: 500,
    cursor: "pointer",
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    transition: "filter .12s ease",
  },
  primaryOff: {
    display: "inline-flex",
    alignItems: "center",
    gap: 9,
    padding: "12px 26px",
    fontSize: 14.5,
    fontWeight: 500,
    cursor: "default",
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    opacity: 0.45,
  },

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
    maxHeight: 380,
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
    padding: "11px 12px",
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
  rowChevron: { fontSize: 16, color: "var(--muted)", flexShrink: 0 },

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
    padding: "44px 20px",
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
    padding: "44px 20px",
    border: "2px dashed var(--accent)",
    borderRadius: "var(--r-card)",
    background: "var(--accent-soft)",
    cursor: "pointer",
    textAlign: "center",
  },
  dropIcon: { color: "var(--muted)", marginBottom: 4 },
  dropTitle: { fontSize: 14, fontWeight: 500, color: "var(--text)" },
  dropHint: { fontSize: 12.5, color: "var(--muted)" },

  working: { fontSize: 13, color: "var(--muted)", marginTop: 14 },
  error: {
    fontSize: 13,
    color: "var(--danger)",
    background: "var(--danger-soft)",
    padding: "11px 14px",
    borderRadius: 10,
    marginTop: 16,
    maxWidth: 560,
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
  btnPrimaryLink: {
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
