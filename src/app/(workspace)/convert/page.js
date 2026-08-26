import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { visibleFilesWhere } from '@/lib/permissions';
import ConvertClient from './convert-client';

const CONVERTIBLE = ['docx', 'doc', 'odt', 'xlsx', 'xls', 'csv', 'pptx', 'ppt', 'pdf'];

export default async function ConvertPage() {
  const user = await getCurrentUser();

  const base = await visibleFilesWhere(user);
  const files = await prisma.file.findMany({
    where: { ...base, extension: { in: CONVERTIBLE } },
    orderBy: { updatedAt: 'desc' },
    take: 300,
    include: { company: true },
  });

  // Companies the user can upload into (for the upload-to-convert path).
  const companies = user.isSuperAdmin
    ? await prisma.company.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } })
    : user.memberships
        .filter((m) => m.role !== 'VIEWER')
        .map((m) => ({ id: m.companyId, name: m.company?.name ?? 'Company' }));

  const plainFiles = files.map((f) => ({
    id: f.id,
    name: f.name,
    extension: f.extension,
    company: f.company?.name ?? '',
  }));

  return <ConvertClient files={plainFiles} companies={companies} />;
}