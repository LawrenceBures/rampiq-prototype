import type { Metadata } from 'next';
import './rampiq.css';

export const metadata: Metadata = {
  title: 'RampIQ · Operational Memory',
  description: 'Operational memory system for airline ramp operations',
};

export default function RampIQLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="rq-shell">
      <div className="rq-device">
        <header className="rq-topbar">
          <div className="rq-topbar-row">
            <div className="rq-brand-mark" />
            <span className="rq-brand-text">
              Ramp<span className="rq-brand-iq">IQ</span>
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
