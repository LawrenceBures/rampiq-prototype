// RampIQ — Operations command bar.
// Presentation-only. No data fetching. No side effects.
// Top-level strip for the desktop operations console.

interface CommandBarProps {
  station: string;
  role: string;
  lastEventSync: Date | null;
  lastIncidentSync: Date | null;
  activeIncidentCount: number;
  openEventCount: number;
}

function ts(d: Date | null): string {
  return d ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '—';
}

export function CommandBar({
  station,
  role,
  lastEventSync,
  lastIncidentSync,
  activeIncidentCount,
  openEventCount,
}: CommandBarProps) {
  const mono: React.CSSProperties = {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    letterSpacing: '.06em',
  };

  return (
    <div className="rq-console-command">
      {/* Station + role */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          ...mono, fontSize: 13, fontWeight: 700,
          color: 'var(--rq-accent)', textTransform: 'uppercase',
          letterSpacing: '.12em',
        }}>
          {station}
        </span>
        <span style={{ ...mono, color: 'var(--rq-ink-3)', textTransform: 'uppercase' }}>
          {role}
        </span>
        <div className="rq-pulse" />
      </div>

      {/* Sync timestamps */}
      <div style={{ display: 'flex', gap: 12, marginLeft: 'auto' }}>
        <span style={{ ...mono, color: 'var(--rq-ink-4)' }}>
          events {ts(lastEventSync)}
        </span>
        <span style={{ ...mono, color: 'var(--rq-ink-4)' }}>
          incidents {ts(lastIncidentSync)}
        </span>
      </div>

      {/* Quick counts */}
      <div style={{ display: 'flex', gap: 10 }}>
        {openEventCount > 0 && (
          <span style={{
            ...mono, padding: '2px 8px', borderRadius: 3,
            background: 'rgba(255,92,92,.1)', color: 'var(--rq-red)',
          }}>
            {openEventCount} open
          </span>
        )}
        {activeIncidentCount > 0 && (
          <span style={{
            ...mono, padding: '2px 8px', borderRadius: 3,
            background: 'rgba(232,161,58,.1)', color: 'var(--rq-amber)',
          }}>
            {activeIncidentCount} incident{activeIncidentCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  );
}
