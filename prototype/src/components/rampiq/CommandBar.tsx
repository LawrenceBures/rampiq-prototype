// SOI — Operations command bar.
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
          ...mono, fontSize: 12, fontWeight: 700,
          color: 'var(--rq-accent)', textTransform: 'uppercase',
          letterSpacing: '.14em',
        }}>
          {station}
        </span>
        <span style={{ width: 1, height: 14, background: 'var(--rq-line-2)' }} />
        <span style={{ ...mono, color: 'var(--rq-ink-3)', textTransform: 'uppercase' }}>
          {role}
        </span>
        <div className="rq-pulse" />
      </div>

      {/* Quick counts */}
      <div style={{ display: 'flex', gap: 8 }}>
        {openEventCount > 0 && (
          <span style={{
            ...mono, fontSize: 9, padding: '2px 7px', borderRadius: 2,
            background: 'rgba(255,92,92,.08)', color: 'var(--rq-red)',
            border: '1px solid rgba(255,92,92,.15)',
          }}>
            {openEventCount} open
          </span>
        )}
        {activeIncidentCount > 0 && (
          <span style={{
            ...mono, fontSize: 9, padding: '2px 7px', borderRadius: 2,
            background: 'rgba(232,161,58,.08)', color: 'var(--rq-amber)',
            border: '1px solid rgba(232,161,58,.15)',
          }}>
            {activeIncidentCount} incident{activeIncidentCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Sync timestamps — pushed right, dimmed */}
      <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
        <span style={{ ...mono, fontSize: 8, color: 'var(--rq-ink-4)' }}>
          ev {ts(lastEventSync)}
        </span>
        <span style={{ ...mono, fontSize: 8, color: 'var(--rq-ink-4)' }}>
          inc {ts(lastIncidentSync)}
        </span>
      </div>
    </div>
  );
}
