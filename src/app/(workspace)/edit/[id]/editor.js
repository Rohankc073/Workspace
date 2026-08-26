"use client";

import ConfirmDialog from "@/app/(workspace)/files/confirm-dialog";
import { useEffect, useRef, useState } from "react";
import BackButton from "./back-button";
import FullscreenButton from "./fullscreen-button";

export default function Editor({
  config,
  scriptUrl,
  fileName,
  badge,
  fileId,
  canDownload,
}) {
  const holder = useRef(null);
  const instance = useRef(null);
  const [error, setError] = useState("");
  const [showVersions, setShowVersions] = useState(false);
  const [Versions, setVersions] = useState(null);
  const [confirmDownload, setConfirmDownload] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const withEvents = {
      ...config,
      events: {
        onRequestHistory: async () => {
          try {
            const res = await fetch(`/api/files/${fileId}/history`);
            if (!res.ok) return;
            const data = await res.json();
            instance.current.refreshHistory({
              currentVersion: data.currentVersion,
              history: data.history,
            });
          } catch (err) {
            console.error("History list failed:", err);
          }
        },

        onRequestHistoryData: async (event) => {
          try {
            const version = event.data;
            const res = await fetch(
              `/api/files/${fileId}/history?version=${version}`,
            );
            if (!res.ok) return;
            instance.current.setHistoryData(await res.json());
          } catch (err) {
            console.error("History data failed:", err);
          }
        },

        onRequestHistoryClose: () => {
          window.location.reload();
        },
      },
    };

    function start() {
      if (cancelled || !window.DocsAPI) return;
      instance.current = new window.DocsAPI.DocEditor(
        "atlas-editor",
        withEvents,
      );
    }

    if (window.DocsAPI) {
      start();
    } else {
      const script = document.createElement("script");
      script.src = scriptUrl;
      script.onload = start;
      script.onerror = () =>
        setError(
          "Could not reach the editing service. Check it is running on port 8082.",
        );
      document.body.appendChild(script);
    }

    return () => {
      cancelled = true;
      try {
        if (instance.current && instance.current.destroyEditor) {
          instance.current.destroyEditor();
        }
      } catch {
        // Already gone; nothing to clean up.
      }
    };
  }, [config, scriptUrl, fileId]);

  async function openVersions() {
    if (!Versions) {
      const mod = await import("./history-panel");
      setVersions(() => mod.default);
    }
    setShowVersions(true);
  }

  /** Confirmed in the dialog; this is what actually starts the transfer. */
  function startDownload() {
    setConfirmDownload(false);
    window.location.href = `/api/files/${fileId}/download`;
  }

  return (
    <div style={S.wrap}>
      <div style={S.bar}>
        <BackButton />
        <span style={S.name}>{fileName}</span>
        {badge ? <span style={S.badge}>{badge}</span> : null}

        <span style={S.spacer} />

        <button type="button" onClick={openVersions} style={S.action}>
          Versions
        </button>

        {canDownload ? (
          <button
            type="button"
            onClick={() => setConfirmDownload(true)}
            style={S.action}
          >
            Download
          </button>
        ) : null}

        {/* Maximize the stable OUTER wrapper (id=atlas-editor-frame), which
            OnlyOffice never touches — the inner #atlas-editor div gets replaced
            by an iframe and loses its id once the editor loads. */}
        <FullscreenButton targetId="atlas-editor-frame" />
      </div>

      {error ? (
        <p style={S.error}>{error}</p>
      ) : (
        <div id="atlas-editor-frame" style={S.frame}>
          <div id="atlas-editor" ref={holder} style={S.full} />
        </div>
      )}

      {showVersions && Versions ? (
        <Versions fileId={fileId} onClose={() => setShowVersions(false)} />
      ) : null}

      {confirmDownload ? (
        <ConfirmDialog
          eyebrow="Download"
          title={fileName}
          message="This file will be saved to your device. Downloads are recorded in the activity log."
          confirmLabel="Download"
          onConfirm={startDownload}
          onClose={() => setConfirmDownload(false)}
        />
      ) : null}
    </div>
  );
}

const S = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    height: "calc(100vh - 76px)",
  },
  bar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    paddingBottom: 14,
    position: "relative",
    zIndex: 10,
  },
  name: { fontSize: 14, fontWeight: 500 },
  spacer: { marginLeft: "auto" },
  badge: {
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--gold)",
    border: "1px solid var(--line)",
    borderRadius: 2,
    padding: "2px 7px",
  },
  action: {
    background: "none",
    border: "1px solid var(--line)",
    borderRadius: 3,
    color: "var(--muted)",
    fontSize: 12,
    padding: "5px 12px",
    cursor: "pointer",
  },
  frame: {
    flex: 1,
    border: "1px solid var(--line)",
    borderRadius: 4,
    overflow: "hidden",
  },
  full: { height: "100%" },
  error: { color: "var(--danger)", fontSize: 14 },
};
