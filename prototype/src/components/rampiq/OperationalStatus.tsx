// RampIQ — Canonical status lifecycle pill.
// Presentation-only. No data fetching. No side effects.
// Works across all lifecycle types (events, assignments, support, incidents, etc.).

import { statusCssVar } from '@/lib/operational-states';

interface OperationalStatusProps {
  /** The status value (e.g., 'OPEN', 'ACKNOWLEDGED', 'ACTIVE', 'PROPOSED'). */
  status: string;
  /** Human-readable label. If omitted, displays the raw status. */
  label?: string;
  /** Visual variant. */
  variant?: 'pill' | 'text' | 'dot';
  className?: string;
}

/**
 * Canonical status display for any lifecycle entity.
 * Color is derived from the status value via operational-states.ts statusCssVar().
 * Works for operational_status, assignment status, support request status,
 * incident status, recovery action status, and equipment status.
 */
export function OperationalStatus({
  status,
  label,
  variant = 'pill',
  className = '',
}: OperationalStatusProps) {
  const cssVar = statusCssVar(status);
  const displayLabel = label ?? status;

  if (variant === 'dot') {
    return (
      <span
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: 'var(--rq-mono, monospace)',
          fontSize: 10,
          letterSpacing: '0.06em',
          textTransform: 'uppercase' as const,
          color: `var(${cssVar})`,
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: `var(${cssVar})`,
            flexShrink: 0,
          }}
        />
        {displayLabel}
      </span>
    );
  }

  if (variant === 'text') {
    return (
      <span
        className={className}
        style={{
          fontFamily: 'var(--rq-mono, monospace)',
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase' as const,
          color: `var(${cssVar})`,
        }}
      >
        {displayLabel}
      </span>
    );
  }

  // Default: pill
  return (
    <span
      className={className}
      style={{
        padding: '3px 8px',
        borderRadius: 3,
        fontFamily: 'var(--rq-mono, monospace)',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase' as const,
        textAlign: 'center' as const,
        color: `var(${cssVar})`,
        background: `color-mix(in srgb, var(${cssVar}) 10%, transparent)`,
        border: `1px solid color-mix(in srgb, var(${cssVar}) 30%, transparent)`,
      }}
    >
      {displayLabel}
    </span>
  );
}
