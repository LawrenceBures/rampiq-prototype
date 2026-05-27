// SOI — Zone/gate pressure visualization.
// Presentation-only. No data fetching. No side effects.
// Pressure value and thresholds from operational-states.ts.

import { pressureCssVar } from '@/lib/operational-states';

interface PressureBarProps {
  /** Pressure value 0-100. */
  pressure: number;
  /** Show numeric value alongside the bar. */
  showValue?: boolean;
  /** Bar height in pixels. */
  height?: number;
  className?: string;
}

/**
 * Operational pressure bar with threshold-based coloring.
 * Green < 40, Amber 40-79, Red 80+.
 * Thresholds defined in operational-states.ts PRESSURE_THRESHOLDS.
 */
export function PressureBar({
  pressure,
  showValue = true,
  height = 4,
  className = '',
}: PressureBarProps) {
  const cssVar = pressureCssVar(pressure);
  const clampedWidth = Math.max(0, Math.min(100, pressure));

  return (
    <div
      className={className}
      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
    >
      <div
        style={{
          flex: 1,
          height,
          background: 'var(--rq-bg-3, #1a212c)',
          borderRadius: height / 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${clampedWidth}%`,
            background: `var(${cssVar})`,
            borderRadius: height / 2,
            transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      </div>
      {showValue && (
        <span
          style={{
            fontFamily: 'var(--rq-mono, monospace)',
            fontSize: 10,
            fontVariantNumeric: 'tabular-nums',
            color: `var(${cssVar})`,
            minWidth: 24,
            textAlign: 'right' as const,
          }}
        >
          {Math.round(pressure)}
        </span>
      )}
    </div>
  );
}
