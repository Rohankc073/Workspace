'use client';

import { useEffect, useRef } from 'react';

const CONTAINER_ID = 'atlas-shared-editor';

export default function SharedViewer({ config, scriptUrl, fileName, canDownload, canEdit }) {
  const editorRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    function mount() {
      if (cancelled || !window.DocsAPI) return;
      try {
        editorRef.current?.destroyEditor?.();
      } catch {}
      editorRef.current = new window.DocsAPI.DocEditor(CONTAINER_ID, config);
    }

    if (window.DocsAPI) {
      mount();
    } else {
      const existing = document.querySelector('script[data-onlyoffice-api]');
      if (existing) {
        existing.addEventListener('load', mount);
      } else {
        const s = document.createElement('script');
        s.src = scriptUrl;
        s.async = true;
        s.setAttribute('data-onlyoffice-api', 'true');
        s.onload = mount;
        document.body.appendChild(s);
      }
    }

    return () => {
      cancelled = true;
      try {
        editorRef.current?.destroyEditor?.();
      } catch {}
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function download() {
    try {
      editorRef.current?.downloadAs?.();
    } catch {}
  }

  return (
    <div style={S.page}>
      <div style={S.bar}>
        <span style={S.brand}>
          <span style={S.mark} />
          Atlas
        </span>

        <span style={S.sep} />

        <span style={S.fileWrap}>
          <span style={S.fileName}>{fileName}</span>
          {canEdit ? (
            <span style={S.pill}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
              Can edit
            </span>
          ) : (
            <span style={S.pill}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              View only
            </span>
          )}
        </span>

        <span style={S.spacer} />

        {canDownload ? (
          <button type="button" onClick={download} style={S.download}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
            </svg>
            Download
          </button>
        ) : null}
      </div>

      <div id={CONTAINER_ID} style={S.editor} />
    </div>
  );
}

const S = {
  page: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg, #24272e)',
  },
  bar: {
    flex: '0 0 auto',
    height: 52,
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '0 16px',
    background: 'var(--panel, #101317)',
    borderBottom: '0.5px solid var(--line, rgba(255,255,255,0.1))',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: 'var(--gold, #e7c675)',
    fontWeight: 500,
    fontSize: 14,
    flex: '0 0 auto',
  },
  mark: {
    width: 16,
    height: 16,
    borderRadius: 4,
    background: 'var(--gold, #e7c675)',
    display: 'inline-block',
  },
  sep: {
    width: '0.5px',
    height: 22,
    background: 'var(--line, rgba(255,255,255,0.14))',
    flex: '0 0 auto',
  },
  fileWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  fileName: {
    color: 'var(--text, #f2f3f5)',
    fontSize: 14,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    background: 'rgba(231,198,117,0.14)',
    color: 'var(--gold, #e7c675)',
    fontSize: 11,
    padding: '3px 9px',
    borderRadius: 999,
    whiteSpace: 'nowrap',
    flex: '0 0 auto',
  },
  spacer: { flex: 1 },
  download: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: 'transparent',
    color: 'var(--gold, #e7c675)',
    border: '0.5px solid rgba(231,198,117,0.5)',
    borderRadius: 6,
    padding: '7px 13px',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    flex: '0 0 auto',
  },
  editor: { flex: '1 1 auto', minHeight: 0 },
};