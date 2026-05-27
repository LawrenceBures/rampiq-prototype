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
      {children}
    </div>
  );
}
