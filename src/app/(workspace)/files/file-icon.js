/**
 * File type icons.
 *
 * A page with a folded corner, filled in the type's colour, with a white
 * glyph inside: text lines for documents, a table grid for spreadsheets, a
 * slide frame for presentations. The fold is a lighter tint of the same
 * colour, which is what stops the shape reading as a flat sticker.
 *
 * Page-shaped rather than a rounded square tile, matching the convention
 * people already know from Google Drive — and matching the type shortcuts in
 * the sidebar, so the two agree.
 *
 * Original marks, not reproductions of the Microsoft or Google logos.
 */

const TYPES = {
  xlsx: "sheet",
  xls: "sheet",
  csv: "sheet",
  ods: "sheet",
  docx: "doc",
  doc: "doc",
  odt: "doc",
  txt: "doc",
  rtf: "doc",
  pptx: "slides",
  ppt: "slides",
  odp: "slides",
  pdf: "pdf",
};

const COLORS = {
  sheet: "#0f9d58",
  doc: "#4285f4",
  slides: "#f4b400",
  pdf: "#ea4335",
  other: "#5f6368",
  folder: "#5f6368",
};

/** The folded corner: a washed-out version of the body colour. */
const FOLD = {
  sheet: "#9cdcbe",
  doc: "#a0c3ff",
  slides: "#fde293",
  pdf: "#f7b4ae",
  other: "#bdc1c6",
};

export function kindOf(extension) {
  return TYPES[String(extension).toLowerCase()] ?? "other";
}

export function colorOf(extension) {
  return COLORS[kindOf(extension)];
}

/** The white mark inside the page. */
function Glyph({ kind }) {
  if (kind === "sheet") {
    // A table: header row plus a 2x2 grid of cells.
    return (
      <path
        d="M8 11h8v6.2H8V11zm1.3 1.3v1.2h2.1v-1.2H9.3zm3.4 0v1.2h2v-1.2h-2zm-3.4 2.4V16h2.1v-1.3H9.3zm3.4 0V16h2v-1.3h-2z"
        fill="#fff"
      />
    );
  }

  if (kind === "doc") {
    return (
      <path
        d="M8 12h8v1.4H8V12zm0 3.2h8v1.4H8v-1.4zm0-6.4h5v1.4H8V8.8z"
        fill="#fff"
      />
    );
  }

  if (kind === "slides") {
    // An empty slide frame.
    return (
      <path d="M8 11.4h8v5.8H8v-5.8zm1.3 1.3v3.2h5.4v-3.2H9.3z" fill="#fff" />
    );
  }

  if (kind === "pdf") {
    // The letters are too small to read at 20px, so it's a block mark:
    // colour does the identifying, as it does for the other types.
    return <path d="M8 12.4h8v1.5H8v-1.5zm0 3h5.5v1.5H8v-1.5z" fill="#fff" />;
  }

  // Unknown type: plain lines, no promise about what's inside.
  return (
    <path d="M8 12h8v1.4H8V12zm0 3.2h6v1.4H8v-1.4z" fill="#fff" opacity="0.9" />
  );
}

export function FileIcon({ extension, size = 22 }) {
  const kind = kindOf(extension);
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      style={{ flexShrink: 0, display: "block" }}
    >
      {/* Page body, with the top-right corner cut away for the fold. */}
      <path
        d="M14 2H6.5A1.5 1.5 0 0 0 5 3.5v17A1.5 1.5 0 0 0 6.5 22h11a1.5 1.5 0 0 0 1.5-1.5V7l-5-5z"
        fill={COLORS[kind]}
      />
      <path d="M14 2l5 5h-5V2z" fill={FOLD[kind] ?? FOLD.other} />
      <Glyph kind={kind} />
    </svg>
  );
}

export function FolderIcon({ size = 22 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      style={{ flexShrink: 0, display: "block" }}
    >
      <path
        d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"
        fill="#5f6368"
      />
    </svg>
  );
}

/** Large tile for grid view. */
export function FileTile({ extension }) {
  return (
    <div style={tile}>
      {/* Slightly smaller than the old square mark: a page is taller than it
          is wide, so the same number would sit heavier in the tile. */}
      <FileIcon extension={extension} size={40} />
    </div>
  );
}

export function FolderTile() {
  return (
    <div style={tile}>
      <FolderIcon size={46} />
    </div>
  );
}

const tile = {
  height: 108,
  borderRadius: "var(--r-card) var(--r-card) 0 0",
  background: "var(--bg)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
