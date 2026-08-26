"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import NameDialog from "./name-dialog";

export default function NewFolder({ companyId, parentId }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function create(name) {
    setBusy(true);
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, companyId, parentId: parentId ?? null }),
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error || "Could not create the folder.");
      }
    } catch {
      window.alert("Could not create the folder.");
    }
    setBusy(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={busy}
        style={S.button}
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2zm7 9h-2v2h-2v-2h-2v-2h2V9h2v2h2v2z" />
        </svg>
        {busy ? "Working" : "New folder"}
      </button>

      {open ? (
        <NameDialog
          eyebrow="New folder"
          title="Name the folder"
          label="Folder name"
          confirmLabel="Create folder"
          placeholder="Untitled folder"
          busy={busy}
          onSubmit={create}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

const S = {
  button: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "9px 14px",
    background: "transparent",
    color: "var(--text)",
    border: "1px solid var(--line)",
    borderRadius: 3,
    fontSize: 13,
    cursor: "pointer",
  },
};
