// SOI — Canonical event stream row.
// Presentation-only. No data fetching. No side effects.
// Replaces .event-row pattern from pulse.html and recovery feed.

import type { Severity } from '@/lib/operational-states';
import { SEVERITY_CSS_VAR } from '@/lib/operational-states';

interface EventRowProps {
  /** Display time (e.g., '14:23:08'). Formatted by parent. */
  time: string;
  /** Event type label (e.g., 'SERVICE', 'SUPPORT', 'INCIDENT'). */
  type: string;
  /** Severity for type coloring. */
  severity: Severity;
  /** Event message/description. */
  message: string;
  /** Location context (e.g., 'Gate 52A' or '\u2014'). */
  location?: string;
  /** Actor who caused the event (e.g., 'SANTOS R.'). */
  actor?: string;
  /** Whether this event is newly arrived (triggers highlight animation). */
  isNew?: boolean;
  /** Click handler. */
  onClick?: () => void;
  className?: string;
}

/**
 * Single event row for the operational event stream.
 * Grid layout: time | type | message | location | actor
 *
 * The `isNew` prop triggers a blue flash animation matching the
 * prototype's @keyframes newEvent.
 */
export function EventRow({
  time,
  type,
  severity,
  message,
  location,
  actor,
  isNew = false,
  onClick,
  className = '',
}: EventRowProps) {
  const severityCssVar = SEVERITY_CSS_VAR[severity];

  return (
    <div
      className={className}
      onClick={onClick}
      style={{
        padding: '7px 14px',
        borderBottom: '1px solid var(--rq-line, #1f2733)',
        display: 'grid',
        gridTemplateColumns: '70px 110px 1fr 130px 100px',
        gap: 14,
        alignItems: 'center',
        fontSize: 11,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 0.1s',
        animation: isNew ? 'newEvent 1.2s' : undefined,
      }}
    >
      {/* Time */}
      <span style={{
        fontFamily: 'var(--rq-mono, monospace)',
        fontSize: 10,
        color: 'var(--rq-ink-3, #6b7585)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {time}
      </span>

      {/* Type */}
      <span style={{
        fontFamily: 'var(--rq-mono, monospace)',
        fontSize: 9,
        letterSpacing: '0.08em',
        textTransform: 'uppercase' as const,
        color: `var(${severityCssVar})`,
      }}>
        {type}
      </span>

      {/* Message */}
      <span style={{ color: 'var(--rq-ink, #e8ecf2)' }}>
        {message}
      </span>

      {/* Location */}
      <span style={{
        fontFamily: 'var(--rq-mono, monospace)',
        fontSize: 10,
        color: 'var(--rq-ink-3, #6b7585)',
        textAlign: 'right' as const,
      }}>
        {location ?? '\u2014'}
      </span>

      {/* Actor */}
      <span style={{
        fontFamily: 'var(--rq-mono, monospace)',
        fontSize: 10,
        color: 'var(--rq-ink-3, #6b7585)',
        textAlign: 'right' as const,
      }}>
        {actor ?? '\u2014'}
      </span>
    </div>
  );
}
