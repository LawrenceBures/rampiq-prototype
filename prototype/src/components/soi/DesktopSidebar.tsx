'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  label: string;
  href: string;
  match: string; // pathname prefix to match for active state
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Operations',
    items: [
      { label: 'Dashboard', href: '/prototype/soi/dashboard', match: '/prototype/soi/dashboard' },
      { label: 'Dispatch', href: '/prototype/soi/operations/dispatch', match: '/prototype/soi/operations/dispatch' },
      { label: 'Flight Ops', href: '/prototype/soi/operations/flights', match: '/prototype/soi/operations/flights' },
      { label: 'Assignments', href: '/prototype/soi/operations/assignments', match: '/prototype/soi/operations/assignments' },
    ],
  },
  {
    label: 'Workforce',
    items: [
      { label: 'Workforce Pool', href: '/prototype/soi/operations/workforce-pool', match: '/prototype/soi/operations/workforce-pool' },
      { label: 'Team Builder', href: '/prototype/soi/operations/team-builder', match: '/prototype/soi/operations/team-builder' },
      { label: 'Readiness', href: '/prototype/soi/workforce', match: '/prototype/soi/workforce' },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { label: 'Enterprise', href: '/prototype/soi/enterprise', match: '/prototype/soi/enterprise' },
    ],
  },
  {
    label: 'Field Tools',
    items: [
      { label: 'Agent Mobile', href: '/prototype/soi/mobile', match: '/prototype/soi/mobile' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { label: 'QR Codes', href: '/prototype/soi/admin/qr', match: '/prototype/soi/admin/qr' },
    ],
  },
];

export function DesktopSidebar() {
  const pathname = usePathname();

  return (
    <nav className="rq-desktop-sidebar">
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="rq-sidebar-group">
          <div className="rq-sidebar-group-label">{group.label}</div>
          {group.items.map((item) => {
            const active = pathname.startsWith(item.match);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rq-sidebar-item${active ? ' active' : ''}`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
