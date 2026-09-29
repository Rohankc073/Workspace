"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * "Maximize" toggle for the OnlyOffice editor.
 *
 * Targets the STABLE outer wrapper (default id "atlas-editor-frame"), not the
 * inner mount div — OnlyOffice replaces that inner div with an iframe and drops
 * its id, so getElementById on it returns null after load. The wrapper always
 * exists. We pin it over the whole viewport with fixed positioning (reliable,
 * unlike the native Fullscreen API on a cross-origin iframe) and stretch the
 * iframe inside to fill it.
 *
 * Escape alone is NOT a sufficient way out. Once you click into the document
 * the focus is inside a cross-origin iframe, and OnlyOffice claims Escape for
 * its own use — closing dialogs, cancelling a cell edit — so the keydown never
 * reaches this page. That's why exiting worked while merely viewing and failed
 * while editing. The overlay also sits above the toolbar, hiding the button
 * that put you there. So fullscreen now renders its own floating exit control,
 * which works regardless of where the focus is.
 */
export default function FullscreenButton({ targetId = "atlas-editor-frame" }) {
  const [isFull, setIsFull] = useState(false);
  const [mounted, setMounted] = useState(false);
  const fullRef = useRef(false);

  useEffect(() => setMounted(true), []);

  function apply(full) {
    const el = document.getElementById(targetId);
    if (!el) return;
    const iframe = el.querySelector("iframe");
    if (full) {
      el.style.position = "fixed";
      el.style.inset = "0";
      el.style.width = "100vw";
      el.style.height = "100vh";
      el.style.zIndex = "9999";
      el.style.background = "#fff";
      el.style.borderRadius = "0";
      if (iframe) {
        iframe.style.width = "100%";
        iframe.style.height = "100%";
      }
      document.body.style.overflow = "hidden";
    } else {
      el.style.position = "";
      el.style.inset = "";
      el.style.width = "";
      el.style.height = "";
      el.style.zIndex = "";
      el.style.background = "";
      el.style.borderRadius = "";
      if (iframe) {
        iframe.style.width = "";
        iframe.style.height = "";
      }
      document.body.style.overflow = "";
    }
    fullRef.current = full;
  }

  function toggle() {
    setIsFull((prev) => {
      const next = !prev;
      apply(next);
      return next;
    });
  }

  function exit() {
    apply(false);
    setIsFull(false);
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape" && isFull) exit();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFull]);

  // Leaving the page while maximised would otherwise strand the wrapper with
  // fixed positioning and the body unable to scroll.
  useEffect(() => {
    return () => {
      if (fullRef.current) apply(false);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const floating =
    isFull && mounted
      ? createPortal(
          <div className="fs-layer" style={S.layer}>
            <style>{`
              .fs-exit {
                transition: background .14s ease, transform .1s ease, opacity .25s ease;
                opacity: .55;
              }
              /* Sits quietly until you go looking for it. */
              .fs-exit:hover, .fs-exit:focus-visible { background: #000; opacity: 1; }
              .fs-exit:active { transform: scale(.96); }
              /* Under ~1100px OnlyOffice starts collapsing its toolbar and
                 the gap we're sitting in stops existing. Drop back to the
                 top-left corner, which is clear at every width. */
              @media (max-width: 1100px) {
                .fs-layer { top: 10px !important; right: auto !important; left: 12px; }
              }
              @media (max-width: 860px) {
                .fs-exit { opacity: 1; padding: 0 14px; }
              }
            `}</style>
            <button
              type="button"
              className="fs-exit"
              onClick={exit}
              style={S.exitBtn}
              aria-label="Exit full screen"
              title="Exit full screen"
            >
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
              </svg>
              <span>Exit full screen</span>
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        style={S.button}
        aria-label={isFull ? "Exit full screen" : "Full screen"}
        title={isFull ? "Exit full screen" : "Full screen"}
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="currentColor"
          aria-hidden="true"
        >
          {isFull ? (
            <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
          ) : (
            <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
          )}
        </svg>
        <span>{isFull ? "Exit" : "Full screen"}</span>
      </button>

      {floating}
    </>
  );
}

const S = {
  button: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    background: "none",
    border: "1px solid var(--line)",
    borderRadius: 6,
    color: "var(--text-2)",
    fontSize: 12.5,
    padding: "6px 13px",
    cursor: "pointer",
  },

  /**
   * In the toolbar gap, just left of OnlyOffice's "Editing" control.
   *
   * Anchored to the RIGHT edge, not the left: the Editing/search cluster
   * keeps a fixed distance from the right of the window, while the menu
   * items on the left shift with the filename length. Anchoring left would
   * drift onto them.
   *
   * This is a coordinate guess at content inside a cross-origin iframe, so
   * it is not guaranteed the way the page corners are. If OnlyOffice changes
   * its toolbar, or the window gets narrow enough for it to reflow, this can
   * end up overlapping something — nudge `right` if it does. Below 1100px it
   * falls back to the top-left corner, which is always clear.
   */
  layer: {
    position: "fixed",
    top: 10,
    right: 190,
    zIndex: 10000,
  },
  exitBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    height: 38,
    padding: "0 18px",
    background: "rgba(32,33,36,.86)",
    color: "#fff",
    border: "none",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    boxShadow: "0 4px 16px rgba(0,0,0,.3)",
    backdropFilter: "blur(6px)",
    whiteSpace: "nowrap",
  },
};
