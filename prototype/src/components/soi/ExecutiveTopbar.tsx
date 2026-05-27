'use client';

import Link from 'next/link';
import { ThemeToggle } from './ThemeToggle';

/**
 * Executive / analytics topbar.
 * Minimal topbar for enterprise intelligence surfaces.
 */
export function ExecutiveTopbar() {
  return (
    <header className="rq-exec-topbar">
      <Link href="/prototype/soi" className="rq-desktop-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="SOI" style={{ width: 22, height: 22, borderRadius: 4 }} />
        <span className="rq-desktop-brand-text">SOI</span>
      </Link>
      <span className="rq-exec-surface-label">Enterprise Operations</span>
      <div className="rq-desktop-topbar-meta">
        <span style={{ color: 'var(--rq-ink-3)' }}>LAX</span>
        <span className="rq-pulse" />
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/prototype/soi/dashboard" className="rq-exec-nav-link">Operations</Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
