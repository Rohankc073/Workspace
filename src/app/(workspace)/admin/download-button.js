"use client";

import ConfirmDialog from "@/app/(workspace)/files/confirm-dialog";
import { useState } from "react";
import { createPortal } from "react-dom";

/**
 * The download icon in admin tables. A button, not an anchor — an <a href>
 * navigates the instant it's clicked, leaving no gap for a confirmation.
 *
 * The dialog is portalled to document.body inside a high stacking context,
 * because ConfirmDialog's own z-index (50) sits below the admin chrome.
 */
export default function DownloadButton({ fileId, fileName }) {
  const [asking, setAsking] = useState(false);

  function start() {
    setAsking(false);
    window.location.href = `/api/files/${fileId}/download`;
  }

  return (
    <>
      <button
        type="button"
        className="doc-dl"
        style={S.dl}
        onClick={() => setAsking(true)}
        title={`Download ${fileName}`}
        aria-label={`Download ${fileName}`}
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z" />
        </svg>
      </button>

      {asking && typeof document !== "undefined"
        ? createPortal(
            <div style={S.layer}>
              <ConfirmDialog
                eyebrow="Download"
                title={fileName}
                message="This file will be saved to your device. Downloads are recorded in the activity log."
                confirmLabel="Download"
                onConfirm={start}
                onClose={() => setAsking(false)}
              />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

const S = {
  dl: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    borderRadius: 999,
    color: "var(--muted)",
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    transition: "background 90ms ease, color 90ms ease",
  },
  // Own stacking context above the admin sidebar / header.
  layer: { position: "relative", zIndex: 1200 },
};
