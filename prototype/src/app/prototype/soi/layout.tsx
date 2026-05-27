import type { Metadata } from 'next';
import './soi.css';

export const metadata: Metadata = {
  title: 'SOI · Systems Operational Intelligence',
  description: 'Systems Operational Intelligence — operational cognition infrastructure for high-tempo coordination environments',
};

export default function SOILayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="rq-shell">
      <div className="rq-device">
        <header className="rq-topbar">
          <div className="rq-topbar-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-192.png" alt="SOI" style={{ width: 28, height: 28, borderRadius: 6 }} />
            <span className="rq-brand-text" style={{ fontSize: 11, letterSpacing: '.06em' }}>
              Systems Operational Intelligence
            </span>
            <div className="rq-topbar-meta">
              <span>LAX</span>
              <span>·</span>
              <span className="rq-pulse" />
            </div>
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}
