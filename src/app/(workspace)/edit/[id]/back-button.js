"use client";

import { useRouter } from "next/navigation";

export default function BackButton({ href = "/files", label = "Back" }) {
  const router = useRouter();

  function goBack() {
    // Return to the exact previous view (folder, type filter, search) when
    // there's history; otherwise fall back to the Drive.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(href);
    }
    // The previous view is served from the client cache, so a file created in
    // the editor won't be there yet. Re-fetch the server data so the list is
    // current on return. Deferred a tick so it runs after the navigation.
    setTimeout(() => router.refresh(), 0);
  }

  return (
    <button
      type="button"
      onClick={goBack}
      style={S.btn}
      title="Back to Drive"
      aria-label="Back to Drive"
    >
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
      </svg>
      {label ? <span>{label}</span> : null}
    </button>
  );
}

const S = {
  btn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px 6px 9px",
    background: "transparent",
    color: "inherit",
    border: "1px solid rgba(128,128,128,0.35)",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    lineHeight: 1,
  },
};
