'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Tab {
  label: string;
  href: string;
  icon: string;
  match: string;
}

const TABS: Tab[] = [
  { label: 'Tasks', href: '/prototype/soi/mobile', icon: '▦', match: '/prototype/soi/mobile' },
  { label: 'Scan', href: '/prototype/soi/mobile/scan', icon: '⌗', match: '/prototype/soi/mobile/scan' },
  { label: 'Queue', href: '/prototype/soi/mobile/queue', icon: '⇅', match: '/prototype/soi/mobile/queue' },
  { label: 'Profile', href: '/prototype/soi/mobile/profile', icon: '◉', match: '/prototype/soi/mobile/profile' },
];

export function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav className="rq-mobile-tabs">
      {TABS.map((tab) => {
        // Tasks tab: exact match only (don't highlight for sub-routes like /gate/52A)
        // Other tabs: prefix match
        const active = tab.href === '/prototype/soi/mobile'
          ? pathname === '/prototype/soi/mobile'
          : pathname.startsWith(tab.match);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rq-mobile-tab${active ? ' active' : ''}`}
          >
            <span className="rq-mobile-tab-icon">{tab.icon}</span>
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
