'use client';

import Link from 'next/link';
import { ThemeToggle } from './ThemeToggle';

/**
 * Desktop operations topbar.
 * Compact header for desktop command surfaces.
 */
export function DesktopTopbar() {
  return (
    <header className="rq-desktop-topbar">
      <Link href="/prototype/soi" className="rq-desktop-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="SOI" style={{ width: 22, height: 22, borderRadius: 4 }} />
        <span className="rq-desktop-brand-text">SOI</span>
      </Link>
      <div className="rq-desktop-topbar-meta">
        <span style={{ color: 'var(--rq-ink-3)' }}>LAX</span>
        <span className="rq-pulse" />
      </div>
      <div style={{ marginLeft: 'auto' }}>
        <ThemeToggle />
      </div>
    </header>
  );
}
