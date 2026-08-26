"use client";

import { useEffect, useState } from "react";

/**
 * "Maximize" toggle for the OnlyOffice editor.
 *
 * Targets the STABLE outer wrapper (default id "atlas-editor-frame"), not the
 * inner mount div — OnlyOffice replaces that inner div with an iframe and drops
 * its id, so getElementById on it returns null after load. The wrapper always
 * exists. We pin it over the whole viewport with fixed positioning (reliable,
 * unlike the native Fullscreen API on a cross-origin iframe) and stretch the
 * iframe inside to fill it.
 */
export default function FullscreenButton({ targetId = "atlas-editor-frame" }) {
  const [isFull, setIsFull] = useState(false);

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
  }

  function toggle() {
    setIsFull((prev) => {
      const next = !prev;
      apply(next);
      return next;
    });
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape" && isFull) {
        apply(false);
        setIsFull(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isFull]);

  useEffect(() => {
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <button
      type="button"
      onClick={toggle}
      style={S.button}
      aria-label={isFull ? "Exit full screen" : "Full screen"}
      title={isFull ? "Exit full screen (Esc)" : "Full screen"}
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
  );
}

const S = {
  button: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    background: "none",
    border: "1px solid var(--line)",
    borderRadius: 3,
    color: "var(--muted)",
    fontSize: 12,
    padding: "5px 12px",
    cursor: "pointer",
  },
};
