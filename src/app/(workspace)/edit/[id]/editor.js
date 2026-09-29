"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import FullscreenButton from "./fullscreen-button";

/**
 * Layout lives in real CSS rather than inline styles because it needs media
 * queries — inline styles can't express them, and the bar has to reflow on a
 * phone: the filename was wrapping to four lines while the action buttons
 * overflowed off the right edge.
 */
const CSS = `
.ed-wrap {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 76px);
}
.ed-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 14px;
  position: relative;
  z-index: 10;
}
.ed-name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ed-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.ed-action {
  background: none;
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--text-2);
  font-size: 12.5px;
  padding: 6px 13px;
  cursor: pointer;
  white-space: nowrap;
  transition: background .12s ease, color .12s ease;
}
.ed-action:hover:not(:disabled) { background: var(--bg); color: var(--text); }
.ed-action:disabled { opacity: .6; cursor: default; }

.ed-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px 6px 9px;
  background: transparent;
  color: inherit;
  border: 1px solid rgba(128,128,128,0.35);
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  line-height: 1;
  flex-shrink: 0;
}
.ed-back:disabled { cursor: default; }

/* A quiet marker that there is still something in flight. */
.ed-dirty {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  font-size: 12px;
  color: #b06000;
  white-space: nowrap;
}
.ed-dot {
  width: 7px; height: 7px; border-radius: 999px;
  background: #f4b400; flex-shrink: 0;
  animation: ed-pulse 1.4s ease-in-out infinite;
}
@keyframes ed-pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
@keyframes ed-spin { to { transform: rotate(360deg); } }
.ed-spin {
  width: 15px; height: 15px; flex-shrink: 0;
  border: 2px solid rgba(128,128,128,.35);
  border-top-color: currentColor;
  border-radius: 999px;
  animation: ed-spin 620ms linear infinite;
}

@media (max-width: 860px) {
  /* dvh, so the bar doesn't sit under the browser's collapsing chrome. */
  .ed-wrap { height: calc(100dvh - 96px); }
  .ed-bar { flex-wrap: wrap; gap: 8px; padding-bottom: 10px; }
  /* Actions drop to their own full-width row, so the filename gets the
     whole first line to itself instead of wrapping around them. */
  .ed-actions {
    flex-basis: 100%;
    overflow-x: auto;
    padding-bottom: 2px;
    -webkit-overflow-scrolling: touch;
  }
  .ed-action { padding: 7px 14px; font-size: 13px; }
  .ed-dirty span { display: none; }
}
`;

/** How long to wait for the editor to settle before letting someone go anyway. */
const SETTLE_TIMEOUT_MS = 8000;

/**
 * Used when onDocumentStateChange never fires, so there is no signal to wait
 * on. Long enough for the editor to push its changes to the document server,
 * short enough not to feel broken.
 */
const BLIND_WAIT_MS = 0;

/**
 * NOTE: there is deliberately no Download button here.
 *
 * OnlyOffice writes the file only once it decides the editing session has
 * ended, which can be seconds or minutes. A Download button in this bar reads
 * from disk, so mid-edit it hands back the PREVIOUS version — it looked
 * broken and wasn't. File → Download As inside the editor exports the live
 * session, is always current, and still respects the `download` permission in
 * the signed config.
 */
export default function Editor({ config, scriptUrl, fileName, badge, fileId }) {
  const router = useRouter();
  const holder = useRef(null);
  const instance = useRef(null);

  const [error, setError] = useState("");
  const [showVersions, setShowVersions] = useState(false);
  const [Versions, setVersions] = useState(null);

  /**
   * True while the editor has keystrokes it hasn't handed to the document
   * server yet — the window in which leaving loses work.
   *
   * Kept in a ref as well as state: the beforeunload handler and the leave
   * routine read it outside React's render cycle, where the state value would
   * be whatever it was when the closure was created.
   */
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [leaving, setLeaving] = useState(false);

  /**
   * Whether onDocumentStateChange has EVER fired.
   *
   * It reliably does on some setups and apparently not on others — the same
   * build behaves differently between a local dev server and the deployed
   * one, and nothing in the console explains why. Rather than depend on it,
   * this records whether the signal is trustworthy here: if it never fires,
   * leaving falls back to a fixed pause instead of assuming the document is
   * clean because a flag was never set.
   */
  const sawStateEvent = useRef(false);

  function markDirty(value) {
    sawStateEvent.current = true;
    dirtyRef.current = value;
    setDirty(value);
  }

  useEffect(() => {
    let cancelled = false;

    const withEvents = {
      ...config,
      events: {
        /**
         * Fires true the moment you type and false once the document server
         * has the change — the same state behind the editor's own
         * "All changes saved" line. This is the only reliable signal for
         * whether it is safe to leave.
         */
        onDocumentStateChange: (event) => {
          markDirty(Boolean(event?.data));
        },

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

  /**
   * Closing the tab or hitting the browser's back button skips our own
   * button entirely, so the browser's native prompt is the only thing
   * standing between an unsettled edit and losing it.
   */
  useEffect(() => {
    function onBeforeUnload(e) {
      // Without the event we cannot know, so warn rather than stay silent:
      // a spurious prompt is a smaller cost than losing an edit.
      if (sawStateEvent.current && !dirtyRef.current) return;
      e.preventDefault();
      // Modern browsers ignore the message and show their own wording; the
      // returnValue is still required for the prompt to appear at all.
      e.returnValue = "";
      return "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  async function openVersions() {
    if (!Versions) {
      const mod = await import("./history-panel");
      setVersions(() => mod.default);
    }
    setShowVersions(true);
  }

  function navigateAway() {
    // Return to the exact previous view (folder, type filter, search) when
    // there's history; otherwise fall back to the Drive.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/files");
    }
    // The previous view is served from the client cache, so re-fetch the
    // server data. Deferred a tick so it runs after the navigation.
    setTimeout(() => router.refresh(), 0);
  }

  /**
   * Leave — but not while the editor still has changes in hand.
   *
   * Waits for onDocumentStateChange to report clean, which is normally under
   * two seconds, so most of the time this is invisible. After
   * SETTLE_TIMEOUT_MS it gives up and asks, rather than trapping someone in
   * a document because something upstream is stuck.
   */
  async function goBack() {
    if (leaving) return;

    /**
     * The event never fired, so the dirty flag means nothing — being false
     * only tells us we were never told. Pause long enough for the editor to
     * hand over whatever it is holding, then go.
     *
     * A guess at a duration rather than knowing, but it behaves the same
     * everywhere, and it cannot interfere with saving the way commanding a
     * force-save did.
     */
    if (!sawStateEvent.current) {
      setLeaving(true);
      await new Promise((r) => setTimeout(r, BLIND_WAIT_MS));
      setLeaving(false);
      navigateAway();
      return;
    }

    if (!dirtyRef.current) {
      navigateAway();
      return;
    }

    setLeaving(true);

    const settled = await new Promise((resolve) => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (!dirtyRef.current) {
          clearInterval(timer);
          resolve(true);
        } else if (Date.now() - started > SETTLE_TIMEOUT_MS) {
          clearInterval(timer);
          resolve(false);
        }
      }, 150);
    });

    setLeaving(false);

    if (settled) {
      navigateAway();
      return;
    }

    const ok = window.confirm(
      "This document still has changes that haven't reached the server. Leaving now may lose them.\n\nLeave anyway?",
    );
    if (ok) navigateAway();
  }

  return (
    <div className="ed-wrap">
      <style>{CSS}</style>

      <div className="ed-bar">
        <button
          type="button"
          className="ed-back"
          onClick={goBack}
          disabled={leaving}
          title="Back to Drive"
          aria-label="Back to Drive"
        >
          {leaving ? (
            <span className="ed-spin" />
          ) : (
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
            </svg>
          )}
          <span>{leaving ? "Saving…" : "Back"}</span>
        </button>

        <span className="ed-name" title={fileName}>
          {fileName}
        </span>
        {badge ? <span style={S.badge}>{badge}</span> : null}

        {/* Visible while the editor still holds unsent changes, so the state
            isn't only discoverable by trying to leave. */}
        {dirty && !leaving ? (
          <span className="ed-dirty">
            <span className="ed-dot" />
            <span>Saving changes…</span>
          </span>
        ) : null}

        <div className="ed-actions">
          <button type="button" onClick={openVersions} className="ed-action">
            Versions
          </button>

          {/* Maximize the stable OUTER wrapper (id=atlas-editor-frame), which
              OnlyOffice never touches — the inner #atlas-editor div gets replaced
              by an iframe and loses its id once the editor loads. */}
          <FullscreenButton targetId="atlas-editor-frame" />
        </div>
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
    </div>
  );
}

const S = {
  badge: {
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--gold)",
    border: "1px solid var(--line)",
    borderRadius: 3,
    padding: "2px 7px",
    flexShrink: 0,
  },
  frame: {
    flex: 1,
    minHeight: 0,
    border: "1px solid var(--line)",
    borderRadius: 8,
    overflow: "hidden",
  },
  full: { height: "100%" },
  error: { color: "var(--danger)", fontSize: 14 },
};
