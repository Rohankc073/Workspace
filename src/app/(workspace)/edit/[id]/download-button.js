'use client';

export default function DownloadButton({ fileId }) {
  return (
    <a href={`/api/files/${fileId}/download`} download style={S.link}>
      Download
    </a>
  );
}

const S = {
  link: {
    padding: '5px 12px',
    border: '1px solid var(--line)',
    borderRadius: 3,
    color: 'var(--muted)',
    textDecoration: 'none',
    fontSize: 12,
  },
};