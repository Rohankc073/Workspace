"use client";

import { presence } from "@/lib/presence";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * A small status pill: green dot + "Online", or grey dot + "Last seen …".
 * Hovering shows the exact last-seen time in a tooltip that is portalled to
 * the body, so a scrolling table can never clip it.
 */
export default function PresenceDot({ lastSeenAt, showLabel = true }) {
  const { online, label, exact } = presence(lastSeenAt);
  const ref = useRef(null);
  const [tip, setTip] = useState(null);

  function show() {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Anchor the tooltip just above the pill, horizontally centred on it.
    setTip({ left: r.left + r.width / 2, top: r.top - 8 });
  }
  function hide() {
    setTip(null);
  }

  return (
    <span
      ref={ref}
      style={S.wrap}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      tabIndex={0}
    >
      <span
        style={{
          ...S.dot,
          background: online ? "var(--online, #12b76a)" : "var(--line)",
        }}
      />
      {showLabel ? (
        <span
          suppressHydrationWarning
          style={{
            ...S.label,
            color: online ? "var(--online-text, #067647)" : "var(--muted)",
          }}
        >
          {label}
        </span>
      ) : null}

      {tip && typeof document !== "undefined"
        ? createPortal(
            <span style={{ ...S.tip, left: tip.left, top: tip.top }}>
              {exact}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}

const S = {
  wrap: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    whiteSpace: "nowrap",
    cursor: "default",
    outline: "none",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    flexShrink: 0,
    display: "inline-block",
  },
  label: { fontSize: 12, fontWeight: 500 },
  tip: {
    position: "fixed",
    transform: "translate(-50%, -100%)",
    background: "#202124",
    color: "#fff",
    fontSize: 11,
    lineHeight: 1.3,
    padding: "5px 9px",
    borderRadius: 6,
    whiteSpace: "nowrap",
    boxShadow: "0 4px 14px rgba(0,0,0,0.22)",
    zIndex: 2000,
    pointerEvents: "none",
  },
};
