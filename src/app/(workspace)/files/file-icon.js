/**
 * File type icons.
 *
 * Each type gets a coloured tile with its own white glyph: a grid for
 * spreadsheets, text lines for documents, a slide for presentations.
 * Original marks, not reproductions of the Microsoft or Google logos.
 */

const TYPES = {
  xlsx: 'sheet',
  xls: 'sheet',
  csv: 'sheet',
  ods: 'sheet',
  docx: 'doc',
  doc: 'doc',
  odt: 'doc',
  txt: 'doc',
  rtf: 'doc',
  pptx: 'slides',
  ppt: 'slides',
  odp: 'slides',
  pdf: 'pdf',
};

const COLORS = {
  sheet: '#0f9d58',
  doc: '#4285f4',
  slides: '#f4b400',
  pdf: '#ea4335',
  other: '#5f6368',
  folder: '#5f6368',
};

export function kindOf(extension) {
  return TYPES[String(extension).toLowerCase()] ?? 'other';
}

export function colorOf(extension) {
  return COLORS[kindOf(extension)];
}

function Glyph({ kind }) {
  if (kind === 'sheet') {
    return (
      <>
        <rect x="6" y="7" width="12" height="3" fill="#fff" opacity="0.95" />
        <path
          d="M6 11.5h12M6 15h12M12 11v7"
          stroke="#fff"
          strokeWidth="1.3"
          fill="none"
          opacity="0.95"
        />
      </>
    );
  }

  if (kind === 'doc') {
    return (
      <path
        d="M7 8h10M7 11.5h10M7 15h6"
        stroke="#fff"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    );
  }

  if (kind === 'slides') {
    return (
      <>
        <rect x="6.5" y="7.5" width="11" height="7.5" rx="1" fill="#fff" />
        <path d="M12 15v2M10 18h4" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" />
      </>
    );
  }

  if (kind === 'pdf') {
    return (
      <>
        <path d="M8 6h5l4 4v8H8z" fill="#fff" opacity="0.95" />
        <path d="M13 6v4h4" fill={COLORS.pdf} />
        <path d="M10 14h5" stroke={COLORS.pdf} strokeWidth="1.3" strokeLinecap="round" />
      </>
    );
  }

  return (
    <path
      d="M8 7h5l4 4v6H8z"
      fill="#fff"
      opacity="0.95"
    />
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
      style={{ flexShrink: 0, display: 'block' }}
    >
      <rect x="2" y="2" width="20" height="20" rx="4" fill={COLORS[kind]} />
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
      style={{ flexShrink: 0, display: 'block' }}
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
      <FileIcon extension={extension} size={44} />
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
  borderRadius: 'var(--r-card) var(--r-card) 0 0',
  background: 'var(--bg)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};