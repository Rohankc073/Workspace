"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import AlertDialog from "./alert-dialog";
import ConfirmDialog from "./confirm-dialog";

export default function FolderDeleteButton({ id }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  async function confirmDelete() {
    setBusy(true);
    try {
      const res = await fetch(`/api/folders/${id}`, { method: "DELETE" });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setOpen(false);
        setError(data.error || "Could not delete the folder.");
      }
    } catch {
      setOpen(false);
      setError("Could not delete the folder.");
    }
    setBusy(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={busy}
        title="Delete folder"
        aria-label="Delete folder"
        style={S.btn}
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
        </svg>
      </button>

      {open ? (
        <ConfirmDialog
          eyebrow="Delete folder"
          title="Delete this folder?"
          message="The folder must be empty. This cannot be undone."
          confirmLabel="Delete folder"
          danger
          busy={busy}
          onConfirm={confirmDelete}
          onClose={() => setOpen(false)}
        />
      ) : null}

      {error ? (
        <AlertDialog
          eyebrow="Can't delete folder"
          message={error}
          danger
          onClose={() => setError("")}
        />
      ) : null}
    </>
  );
}

const S = {
  btn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "none",
    border: "none",
    color: "var(--muted)",
    cursor: "pointer",
    padding: 4,
    borderRadius: 6,
  },
};
