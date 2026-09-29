"use client";

import { LogoTile } from "@/components/logo";
import { useEffect, useRef, useState } from "react";

/**
 * The editor as an outside recipient sees it.
 *
 * This is the only page of Atlas most of them will ever look at, so the bar
 * is the whole impression: the mark, what they're looking at, what they're
 * allowed to do with it.
 *
 * Layout lives in real CSS rather than inline styles because it needs media
 * queries — on a phone the filename has to give up its space rather than
 * push the download button off the edge.
 */
const CSS = `
.sv-wrap {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg);
}
.sv-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: var(--panel);
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}
.sv-brand {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  flex-shrink: 0;
  text-decoration: none;
  color: var(--text-2);
}
.sv-brand-name { font-size: 15px; font-weight: 500; letter-spacing: -0.01em; }
.sv-rule {
  width: 1px;
  height: 22px;
  background: var(--line);
  flex-shrink: 0;
}
.sv-name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sv-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 500;
  padding: 4px 11px;
  border-radius: 999px;
  white-space: nowrap;
}
.sv-badge-view { color: var(--text-2); background: var(--bg); }
.sv-badge-edit { color: var(--accent); background: var(--accent-soft); }
.sv-dl {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  flex-shrink: 0;
  height: 34px;
  padding: 0 15px;
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  background: var(--accent);
  border-radius: 8px;
  text-decoration: none;
  transition: filter .12s ease;
}
.sv-dl:hover { filter: brightness(1.06); }
.sv-frame {
  flex: 1;
  min-height: 0;
  background: var(--panel);
}
.sv-frame > div { height: 100%; }

@media (max-width: 720px) {
  /* dvh so the bar isn't hidden under a phone browser's collapsing chrome. */
  .sv-wrap { height: 100dvh; }
  .sv-bar { gap: 9px; padding: 9px 12px; }
  /* The brand wordmark and the badge label are the first things to go —
     the filename and the download button matter more on a small screen. */
  .sv-brand-name, .sv-rule { display: none; }
  .sv-badge span { display: none; }
  .sv-badge { padding: 4px 7px; }
  .sv-dl span { display: none; }
  .sv-dl { padding: 0 11px; }
}
`;

export default function SharedViewer({
  config,
  scriptUrl,
  fileName,
  canDownload,
  canEdit,
}) {
  const holder = useRef(null);
  const instance = useRef(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    function start() {
      if (cancelled || !window.DocsAPI) return;
      instance.current = new window.DocsAPI.DocEditor("atlas-shared", config);
    }

    if (window.DocsAPI) {
      start();
    } else {
      const script = document.createElement("script");
      script.src = scriptUrl;
      script.onload = start;
      script.onerror = () => setError("Could not load the document viewer.");
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
  }, [config, scriptUrl]);

  return (
    <div className="sv-wrap">
      <style>{CSS}</style>

      <div className="sv-bar">
        <span className="sv-brand">
          <LogoTile size={26} />
          <span className="sv-brand-name">Atlas</span>
        </span>

        <span className="sv-rule" />

        <span className="sv-name" title={fileName}>
          {fileName}
        </span>

        {/* Say what they can do, not just when it's editing — "no badge"
            reads as an oversight rather than as view-only. */}
        <span
          className={
            canEdit ? "sv-badge sv-badge-edit" : "sv-badge sv-badge-view"
          }
        >
          {canEdit ? (
            <svg
              viewBox="0 0 24 24"
              width="13"
              height="13"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              width="13"
              height="13"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
            </svg>
          )}
          <span>{canEdit ? "Can edit" : "View only"}</span>
        </span>

        {canDownload ? (
          <a href={`/api/s/${config.document.key}/download`} className="sv-dl">
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
            </svg>
            <span>Download</span>
          </a>
        ) : null}
      </div>

      {error ? (
        <p style={S.error}>{error}</p>
      ) : (
        <div className="sv-frame">
          <div id="atlas-shared" ref={holder} />
        </div>
      )}
    </div>
  );
}

const S = {
  error: {
    color: "var(--danger)",
    fontSize: 14,
    padding: 24,
    margin: 0,
  },
};
