// RampIQ — Replay-safe elapsed time display.
// Presentation-only. No data fetching. No side effects.
// Accepts `asOf` for deterministic replay rendering.

import { elapsedLabel, elapsedSeconds, formatElapsedCompact, classifyAge, AGE_CLASS_CSS_VAR } from '@/lib/operational-states';

interface ElapsedTimeProps {
  /** ISO timestamp to measure elapsed time from. */
  since: string;
  /** Reference time for calculation. Omit for live (current time). Pass for replay. */
  asOf?: Date;
  /** Display format. */
  format?: 'relative' | 'compact' | 'seconds';
  /** Show age-based color coding (fresh/warm/hot/stale). */
  showAgeColor?: boolean;
  className?: string;
}

/**
 * Deterministic elapsed time display.
 *
 * This component does NOT use setInterval or any timer.
 * The parent is responsible for re-rendering at the desired frequency
 * (e.g., via a shared 1s tick in a layout component or replay controller).
 *
 * For replay: pass `asOf` to render elapsed time as it would appear
 * at any point in history.
 *
 * Formats:
 * - relative: "3m ago", "1h 42m ago" (human-readable)
 * - compact: "3m 42s", "1h 12m" (operational timer style)
 * - seconds: raw seconds count
 */
export function ElapsedTime({
  since,
  asOf,
  format = 'relative',
  showAgeColor = false,
  className = '',
}: ElapsedTimeProps) {
  const seconds = elapsedSeconds(since, asOf);

  let display: string;
  switch (format) {
    case 'compact':
      display = formatElapsedCompact(seconds);
      break;
    case 'seconds':
      display = `${seconds}s`;
      break;
    default:
      display = elapsedLabel(since, asOf);
  }

  const style: React.CSSProperties = {
    fontFamily: 'var(--rq-mono, monospace)',
    fontSize: 10,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '0.02em',
  };

  if (showAgeColor) {
    const ageClass = classifyAge(since, asOf);
    const cssVar = AGE_CLASS_CSS_VAR[ageClass];
    style.color = `var(${cssVar})`;
  }

  return (
    <span className={className} style={style}>
      {display}
    </span>
  );
}
