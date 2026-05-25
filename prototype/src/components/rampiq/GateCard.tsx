// RampIQ — Canonical gate card.
// Presentation-only. No data fetching. No side effects.
// Consolidates .gate (52px compact), .chief-gate (240px expanded),
// and turn-queue row patterns into one component with variants.

import type { GateState, Severity } from '@/lib/operational-states';
import { statusCssVar, SEVERITY_CSS_VAR } from '@/lib/operational-states';

export type GateCardVariant = 'compact' | 'expanded';

interface GateCardProps {
  /** Gate identifier (e.g., '52A'). */
  gateId: string;
  /** Aircraft tail number. */
  tail?: string;
  /** Departure time display string (e.g., '14:23'). */
  departure?: string;
  /** Derived gate state. Never stored — always computed by parent. */
  state: GateState;
  /** Current service step label (e.g., 'BAG LOAD'). */
  step?: string;
  /** Number of crew assigned. */
  crewCount?: number;
  /** Max severity of open events at this gate. */
  maxSeverity?: Severity;
  /** Number of open issues at this gate. */
  issueCount?: number;
  /** Countdown string (e.g., 'Pushes in 9m'). Computed by parent. */
  countdown?: string;
  /** Visual variant. */
  variant?: GateCardVariant;
  /** Click handler. Parent decides navigation behavior. */
  onClick?: () => void;
  className?: string;
}

// Gate state → CSS styling
const STATE_STYLES: Record<GateState, React.CSSProperties> = {
  EMPTY: {
    background: 'var(--rq-bg-2, #141922)',
    borderColor: 'var(--rq-line, #1f2733)',
    opacity: 0.5,
  },
  OCCUPIED: {
    background: 'var(--rq-bg-3, #1a212c)',
    borderColor: 'var(--rq-line-2, #2a3442)',
  },
  WATCH: {
    background: 'var(--rq-bg-3, #1a212c)',
    borderColor: 'var(--rq-line-2, #2a3442)',
  },
  AT_RISK: {
    background: 'linear-gradient(180deg, rgba(245,177,61,0.2), rgba(245,177,61,0.04))',
    borderColor: 'rgba(245,177,61,0.5)',
  },
  BLOCKED: {
    background: 'linear-gradient(180deg, rgba(255,92,92,0.25), rgba(255,92,92,0.06))',
    borderColor: 'rgba(255,92,92,0.6)',
  },
  RECOVERING: {
    background: 'linear-gradient(180deg, rgba(90,169,255,0.2), rgba(90,169,255,0.04))',
    borderColor: 'rgba(90,169,255,0.5)',
  },
  STABILIZED: {
    background: 'linear-gradient(180deg, rgba(62,213,152,0.15), rgba(62,213,152,0.04))',
    borderColor: 'rgba(62,213,152,0.4)',
  },
};

/**
 * Canonical gate rendering. Replaces three implementations:
 * - .gate (pulse.html, geography.html) — 52px compact
 * - .chief-gate (zone.html) — 240px expanded with crew/countdown
 *
 * Gate state is ALWAYS derived by the parent from events + flights.
 * This component only renders what it's given.
 */
export function GateCard({
  gateId,
  tail,
  departure,
  state,
  step,
  crewCount,
  maxSeverity,
  issueCount,
  countdown,
  variant = 'compact',
  onClick,
  className = '',
}: GateCardProps) {
  const stateStyle = STATE_STYLES[state] ?? STATE_STYLES.OCCUPIED;
  const isBlocked = state === 'BLOCKED';

  if (variant === 'expanded') {
    return (
      <div
        className={className}
        onClick={onClick}
        style={{
          minWidth: 220,
          padding: 14,
          border: '1px solid',
          borderRadius: 4,
          cursor: onClick ? 'pointer' : 'default',
          position: 'relative',
          transition: 'all 0.12s',
          ...stateStyle,
          animation: isBlocked ? 'critFlash 3s infinite' : undefined,
        }}
      >
        {/* Header: gate ID + countdown */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <span style={{ fontFamily: 'var(--rq-mono, monospace)', fontSize: 13, fontWeight: 700 }}>
            {gateId}
          </span>
          {countdown && (
            <span style={{
              fontFamily: 'var(--rq-mono, monospace)',
              fontSize: 10,
              fontVariantNumeric: 'tabular-nums',
              color: isBlocked ? 'var(--rq-red)' : state === 'AT_RISK' ? 'var(--rq-amber)' : 'var(--rq-ink-3)',
            }}>
              {countdown}
            </span>
          )}
        </div>

        {/* Tail + flight */}
        {tail && (
          <div style={{ fontFamily: 'var(--rq-mono, monospace)', fontSize: 11, color: 'var(--rq-ink-2)', marginBottom: 4 }}>
            {tail}
          </div>
        )}

        {/* Current step */}
        {step && (
          <div style={{ fontSize: 11, color: 'var(--rq-ink-3)', marginBottom: 8 }}>
            {step}
          </div>
        )}

        {/* Footer: crew dots + issue badge */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {crewCount != null && (
            <div style={{ display: 'flex', gap: 3 }}>
              {Array.from({ length: Math.min(crewCount, 5) }).map((_, i) => (
                <span
                  key={i}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--rq-green)',
                    opacity: 0.7,
                  }}
                />
              ))}
            </div>
          )}
          {issueCount != null && issueCount > 0 && (
            <span style={{
              background: 'var(--rq-red)',
              color: '#fff',
              fontSize: 9,
              fontWeight: 700,
              padding: '1px 5px',
              borderRadius: 6,
              fontFamily: 'var(--rq-mono, monospace)',
            }}>
              {issueCount}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Compact variant (52px, used in schematic/geography views)
  return (
    <div
      className={className}
      onClick={onClick}
      style={{
        width: 52,
        padding: '5px 3px',
        border: '1px solid',
        borderRadius: 3,
        cursor: onClick ? 'pointer' : 'default',
        textAlign: 'center' as const,
        position: 'relative',
        transition: 'all 0.12s',
        ...stateStyle,
        animation: isBlocked ? 'critFlash 3s infinite' : undefined,
      }}
    >
      {/* Critical indicator dot */}
      {isBlocked && (
        <span style={{
          position: 'absolute',
          top: -3,
          right: -3,
          width: 9,
          height: 9,
          borderRadius: '50%',
          background: 'var(--rq-red)',
          border: '2px solid var(--rq-bg-1, #0f1319)',
          animation: 'pulse 1.5s infinite',
        }} />
      )}

      <div style={{ fontFamily: 'var(--rq-mono, monospace)', fontSize: 11, fontWeight: 700, marginBottom: 1 }}>
        {gateId}
      </div>
      {tail && (
        <div style={{ fontFamily: 'var(--rq-mono, monospace)', fontSize: 9, color: 'var(--rq-ink-3)', marginBottom: 1 }}>
          {tail}
        </div>
      )}
      {departure && (
        <div style={{
          fontFamily: 'var(--rq-mono, monospace)',
          fontSize: 9,
          fontVariantNumeric: 'tabular-nums',
          color: isBlocked ? 'var(--rq-red)' : state === 'AT_RISK' ? 'var(--rq-amber)' : 'var(--rq-ink-3)',
        }}>
          {departure}
        </div>
      )}
    </div>
  );
}
