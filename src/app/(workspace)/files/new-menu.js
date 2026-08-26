"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import NameDialog from "./name-dialog";

const KINDS = [
  { key: "spreadsheet", label: "Spreadsheet" },
  { key: "document", label: "Document" },
  { key: "presentation", label: "Presentation" },
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
    <div style={{ display: "flex", gap: 8 }}>
      {kinds.map((k) => (
        <button
          key={k.key}
          type="button"
          onClick={() => setPending(k.key)}
          disabled={busy !== ""}
          style={S.button}
        >
          {busy === k.key ? "Working" : `New ${k.label}`}
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
  button: {
    padding: "9px 14px",
    background: "transparent",
    color: "var(--text)",
    border: "1px solid var(--line)",
    borderRadius: 3,
    fontSize: 13,
    cursor: "pointer",
  },
};
