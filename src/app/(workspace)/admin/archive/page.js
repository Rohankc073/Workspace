import { FileIcon } from "@/app/(workspace)/files/file-icon";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import ArchiveActions from "./archive-actions";

function fmtSize(bytes) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * /admin/archive — documents kept from deleted companies.
 *
 * Super admins only. These files belong to the hidden archive company, which
 * has no members, so nobody else can reach them through the Drive.
 */
export default async function ArchivePage() {
  const user = await getCurrentUser();

  if (!user?.isSuperAdmin) {
    return (
      <div style={S.empty}>
        <p style={S.muted}>This area is for super admins.</p>
      </div>
    );
  }

  const archive = await prisma.company.findFirst({
    where: { isArchive: true },
  });

  const [files, companies] = await Promise.all([
    archive
      ? prisma.file.findMany({
          where: { companyId: archive.id, deletedAt: null },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            name: true,
            extension: true,
            size: true,
            archivedFrom: true,
            updatedAt: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
    prisma.company.findMany({
      where: { deletedAt: null, isArchive: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const totalBytes = files.reduce((sum, f) => sum + (f.size ?? 0), 0);

  return (
    <>
      <style>{`
        .arc-row { transition: background-color .12s ease; }
        .arc-row:hover { background: var(--bg); }
      `}</style>

      <header style={S.hero}>
        <p style={S.eyebrow}>Administration</p>
        <h1 style={S.h1}>Archive</h1>
        <p style={S.sub}>
          Documents kept from companies that were deleted. They belong to no
          company and only super admins can see them — move one into a live
          company to bring it back into use.
        </p>
      </header>

      <div style={S.sectionHead}>
        <h2 style={S.h2}>Documents</h2>
        <span style={S.count}>{files.length}</span>
        {files.length > 0 ? (
          <span style={S.size}>{fmtSize(totalBytes)}</span>
        ) : null}
      </div>

      {files.length === 0 ? (
        <div style={S.emptyCard}>
          <p style={S.emptyTitle}>The archive is empty</p>
          <p style={S.emptyBody}>
            When you permanently delete a company you can choose to keep its
            documents. Anything kept that way appears here.
          </p>
          <Link href="/admin" style={S.emptyAction}>
            Back to companies
          </Link>
        </div>
      ) : (
        <div style={S.card}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Name</th>
                <th style={S.th}>Originally in</th>
                <th style={S.thNum}>Size</th>
                <th style={S.th}>Archived</th>
                <th style={S.thRight} />
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.id} className="arc-row">
                  <td style={S.td}>
                    <span style={S.nameCell}>
                      <FileIcon extension={f.extension} size={22} />
                      <span style={S.name}>{f.name}</span>
                    </span>
                  </td>
                  <td style={S.tdMuted}>
                    {f.archivedFrom ?? <span style={S.unknown}>Unknown</span>}
                  </td>
                  <td style={S.tdNum}>{fmtSize(f.size)}</td>
                  <td style={S.tdMuted}>{fmtDate(f.updatedAt)}</td>
                  <td style={S.tdRight}>
                    <ArchiveActions
                      fileId={f.id}
                      fileName={f.name}
                      companies={companies}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const S = {
  hero: {
    padding: "26px 28px",
    marginBottom: 22,
    borderRadius: 16,
    background:
      "linear-gradient(135deg, var(--accent-soft) 0%, rgba(161,66,244,.07) 55%, transparent 100%)",
    border: "1px solid var(--line-soft)",
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: ".09em",
    textTransform: "uppercase",
    color: "var(--muted)",
    marginBottom: 10,
  },
  h1: {
    fontSize: 30,
    fontWeight: 400,
    letterSpacing: "-0.02em",
    color: "var(--text)",
  },
  sub: {
    fontSize: 14,
    color: "var(--muted)",
    marginTop: 8,
    lineHeight: 1.55,
    maxWidth: 620,
  },

  sectionHead: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  h2: { fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em" },
  count: {
    fontSize: 12,
    fontWeight: 500,
    color: "var(--muted)",
    background: "var(--bg)",
    padding: "2px 9px",
    borderRadius: 999,
    fontVariantNumeric: "tabular-nums",
  },
  size: { fontSize: 12.5, color: "var(--muted)", marginLeft: "auto" },

  card: {
    background: "var(--panel)",
    border: "1px solid var(--line-soft)",
    borderRadius: 14,
    boxShadow: "0 1px 2px rgba(17,24,39,.04)",
    overflowX: "auto",
  },
  table: { width: "100%", borderCollapse: "collapse", minWidth: 720 },
  th: {
    textAlign: "left",
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: ".04em",
    textTransform: "uppercase",
    color: "var(--muted)",
    padding: "15px 18px 13px",
    whiteSpace: "nowrap",
  },
  thNum: {
    textAlign: "right",
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: ".04em",
    textTransform: "uppercase",
    color: "var(--muted)",
    padding: "15px 18px 13px",
    whiteSpace: "nowrap",
  },
  thRight: { padding: "15px 18px 13px" },
  td: {
    padding: "13px 18px",
    borderTop: "1px solid var(--line-soft)",
    fontSize: 14,
  },
  tdMuted: {
    padding: "13px 18px",
    borderTop: "1px solid var(--line-soft)",
    fontSize: 13,
    color: "var(--muted)",
    whiteSpace: "nowrap",
  },
  tdNum: {
    padding: "13px 18px",
    borderTop: "1px solid var(--line-soft)",
    fontSize: 13,
    color: "var(--text-2)",
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  tdRight: {
    padding: "13px 18px",
    borderTop: "1px solid var(--line-soft)",
    textAlign: "right",
  },
  nameCell: { display: "inline-flex", alignItems: "center", gap: 12 },
  name: { fontWeight: 500 },
  // Files archived before the provenance column existed have nothing to show.
  unknown: { fontStyle: "italic", opacity: 0.7 },

  emptyCard: {
    padding: "48px 28px",
    background: "var(--bg)",
    borderRadius: 14,
    textAlign: "center",
  },
  emptyTitle: { fontSize: 15, fontWeight: 600, color: "var(--text)" },
  emptyBody: {
    fontSize: 13.5,
    color: "var(--muted)",
    marginTop: 7,
    lineHeight: 1.55,
    maxWidth: 420,
    marginLeft: "auto",
    marginRight: "auto",
  },
  emptyAction: {
    display: "inline-block",
    marginTop: 16,
    padding: "9px 18px",
    fontSize: 13.5,
    fontWeight: 500,
    background: "var(--accent)",
    color: "#fff",
    borderRadius: 8,
    textDecoration: "none",
  },

  empty: {
    padding: "56px 28px",
    background: "var(--bg)",
    borderRadius: 14,
    textAlign: "center",
  },
  muted: { color: "var(--muted)", fontSize: 14 },
};
