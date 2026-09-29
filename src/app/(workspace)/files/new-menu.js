"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileIcon } from "./file-icon";
import NameDialog from "./name-dialog";

/**
 * `ext` is only there to pick an icon — FileIcon works from an extension,
 * and reusing it means these buttons can never drift from the marks in the
 * file list and the sidebar.
 */
const KINDS = [
  { key: "spreadsheet", label: "Spreadsheet", ext: "xlsx" },
  { key: "document", label: "Document", ext: "docx" },
  { key: "presentation", label: "Presentation", ext: "pptx" },
];

export default function NewButtons({
  companyId,
  folderId,
  activeType = "all",
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [pending, setPending] = useState(null); // which kind is being named

  async function create(name) {
    const kind = pending;
    if (!kind) return;
    setBusy(kind);

    const res = await fetch("/api/files/new", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        name,
        companyId,
        folderId: folderId ?? null,
      }),
    });

    setBusy("");

    if (res.ok) {
      const { id } = await res.json();
      setPending(null);
      router.push(`/edit/${id}`);
    } else {
      const data = await res.json().catch(() => ({}));
      window.alert(data.error || "Could not create the document.");
    }
  }

  // In a type section, "New" makes just that kind. In the all-files
  // view, offer all three.
  const kinds =
    activeType !== "all" ? KINDS.filter((k) => k.key === activeType) : KINDS;

  const pendingLabel =
    KINDS.find((k) => k.key === pending)?.label ?? "document";

  return (
    <div style={S.row}>
      <style>{`
        .nm-btn { transition: background .12s ease, border-color .12s ease; }
        .nm-btn:hover:not(:disabled) { background: var(--bg); border-color: var(--muted); }
        .nm-btn:disabled { opacity: .55; cursor: default; }
        .nm-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
      `}</style>

      {kinds.map((k) => (
        <button
          key={k.key}
          type="button"
          className="nm-btn"
          onClick={() => setPending(k.key)}
          disabled={busy !== ""}
          style={S.button}
        >
          <FileIcon extension={k.ext} size={18} />
          {busy === k.key ? "Working…" : `New ${k.label}`}
        </button>
      ))}

      {pending ? (
        <NameDialog
          eyebrow={`New ${pendingLabel.toLowerCase()}`}
          title={`Name this ${pendingLabel.toLowerCase()}`}
          label="Name"
          confirmLabel="Create"
          placeholder={`Untitled ${pendingLabel.toLowerCase()}`}
          busy={busy !== ""}
          onSubmit={create}
          onClose={() => setPending(null)}
        />
      ) : null}
    </div>
  );
}

const S = {
  row: { display: "flex", gap: 8, flexWrap: "wrap" },
  button: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "9px 14px",
    background: "transparent",
    color: "var(--text)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
};
