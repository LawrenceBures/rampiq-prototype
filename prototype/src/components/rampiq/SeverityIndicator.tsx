// RampIQ — Canonical severity rendering.
// Presentation-only. No data fetching. No side effects.
// All color derivation from operational-states.ts.

import type { Severity } from '@/lib/operational-states';
import { SEVERITY_LABELS, SEVERITY_CSS_VAR } from '@/lib/operational-states';

export type SeverityVariant = 'text' | 'pill' | 'badge' | 'dot';

interface SeverityIndicatorProps {
  severity: Severity;
  variant?: SeverityVariant;
  className?: string;
}

/**
 * Canonical severity display. Replaces 7+ inconsistent implementations
 * across the prototype (inc-cat, ev-type, sup-cat, gate state, turn-flag,
 * eq-stat, zone-tile severity markers).
 *
 * Variants:
 * - text: colored text label (monospace, uppercase)
 * - pill: bordered pill with tinted background
 * - badge: compact inline badge
 * - dot: 8px colored circle
 */
export function SeverityIndicator({
  severity,
  variant = 'text',
  className = '',
}: SeverityIndicatorProps) {
  const cssVar = SEVERITY_CSS_VAR[severity];
  const label = SEVERITY_LABELS[severity];

  if (variant === 'dot') {
    return (
      <span
        className={className}
        style={{
          display: 'inline-block',
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: `var(${cssVar})`,
          flexShrink: 0,
        }}
        aria-label={label}
      />
    );
  }

  if (variant === 'pill') {
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
          color: `var(${cssVar})`,
          background: `color-mix(in srgb, var(${cssVar}) 10%, transparent)`,
          border: `1px solid color-mix(in srgb, var(${cssVar}) 30%, transparent)`,
        }}
      >
        {label}
      </span>
    );
  }

  if (variant === 'badge') {
    return (
      <span
        className={className}
        style={{
          padding: '2px 6px',
          borderRadius: 2,
          fontFamily: 'var(--rq-mono, monospace)',
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase' as const,
          color: `var(${cssVar})`,
        }}
      >
        {label}
      </span>
    );
  }

  // Default: text
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
      {label}
    </span>
  );
}
