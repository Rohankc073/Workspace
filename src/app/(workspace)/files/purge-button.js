"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import ConfirmDialog from "./confirm-dialog";

/**
 * Permanent delete, from the trash view.
 *
 * `fileName` is optional but worth passing — naming the file in the dialog
 * is the difference between "delete this file forever" and knowing which
 * file you're about to destroy.
 */
export default function PurgeButton({ id, fileName }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function purge() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/files/${id}/purge`, { method: "DELETE" });
      if (res.ok) {
        setAsking(false);
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not delete the file.");
    } catch {
      setError("Could not delete the file.");
    }
    setBusy(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError("");
          setAsking(true);
        }}
        disabled={busy}
        style={S.btn}
      >
        {busy ? "Deleting…" : "Delete forever"}
      </button>

      {asking ? (
        <ConfirmDialog
          eyebrow="Delete forever"
          title={fileName || "This file"}
          message={
            error
              ? error
              : "This permanently removes the file and every saved version of it. It cannot be undone."
          }
          confirmLabel="Delete forever"
          danger
          busy={busy}
          onConfirm={purge}
          onClose={() => setAsking(false)}
        />
      ) : null}
    </>
  );
}

const S = {
  btn: {
    background: "none",
    border: "none",
    color: "var(--danger)",
    fontSize: 12,
    cursor: "pointer",
    padding: 0,
  },
};
