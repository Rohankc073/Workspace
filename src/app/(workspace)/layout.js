import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import WorkspaceShell from './workspace-shell';

export default async function WorkspaceLayout({ children }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const company = user.memberships[0]?.company;

  const canAdminister =
    user.isSuperAdmin || user.memberships.some((m) => m.role === 'ADMIN');

  const driveItems = [
    {
      label: '',
      links: [
        { href: '/', label: 'Home', icon: 'home' },
        { href: '/files', label: 'My Drive', icon: 'folder' },
      ],
    },
  ];

  const otherItems = [
    {
      label: 'Insights',
      links: [{ href: '/activity', label: 'Activity', icon: 'clock' }],
    },
    {
      label: 'Tools',
      links: [{ href: '/convert', label: 'Convert', icon: 'convert' }],
    },
  ];

  if (canAdminister) {
    otherItems.push({
      label: 'Manage',
      links: [{ href: '/admin', label: 'People', icon: 'people' }],
    });
  }

  const initials = user.name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const userSummary = {
    name: user.name,
    initials,
    where: user.isSuperAdmin ? 'All companies' : company?.name ?? 'No company',
  };

  return (
    <WorkspaceShell driveItems={driveItems} otherItems={otherItems} user={userSummary}>
      {children}
    </WorkspaceShell>
  );
}