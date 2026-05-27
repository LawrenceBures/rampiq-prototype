import { MobileTabBar } from '@/components/soi/MobileTabBar';

export default function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="rq-device" data-surface="mobile">
      <header className="rq-topbar">
        <div className="rq-topbar-row">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="SOI" style={{ width: 28, height: 28, borderRadius: 6 }} />
          <span className="rq-brand-text" style={{ fontSize: 11, letterSpacing: '.06em' }}>
            Systems Operational Intelligence
          </span>
          <div className="rq-topbar-meta">
            <span>LAX</span>
            <span>&middot;</span>
            <span className="rq-pulse" />
          </div>
        </div>
      </header>

      <main className="rq-mobile-main">
        {children}
      </main>

      <MobileTabBar />
    </div>
  );
}
