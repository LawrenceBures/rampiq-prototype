// RampIQ — Canonical zone pressure/status tile.
// Presentation-only. No data fetching. No side effects.
// All pressure values and counts are computed by the parent.

import { pressureCssVar } from '@/lib/operational-states';

interface ZoneTileProps {
  /** Zone display name (e.g., 'Gates 52A\u2013C'). */
  name: string;
  /** Number of gates in this zone. */
  gateCount: number;
  /** Computed pressure value 0-100. Derived from events by parent. */
  pressure: number;
  /** Number of active turns. */
  turnCount?: number;
  /** Number of open support requests. */
  supportCount?: number;
  /** Number of active incidents. */
  incidentCount?: number;
  /** Zone chief name. */
  chief?: string;
  /** Whether this zone is selected/active. */
  isActive?: boolean;
  /** Click handler. */
  onClick?: () => void;
  className?: string;
}

/**
 * Zone summary tile from the station pulse view.
 * Shows zone name, pressure bar, and operational stats.
 *
 * Pressure determines accent color:
 * - Green (< 40): nominal
 * - Amber (40-79): elevated
 * - Red (80+): critical
 *
 * All values are props — no internal state computation.
 */
export function ZoneTile({
  name,
  gateCount,
  pressure,
  turnCount,
  supportCount,
  incidentCount,
  chief,
  isActive = false,
  onClick,
  className = '',
}: ZoneTileProps) {
  const cssVar = pressureCssVar(pressure);
  const isCritical = pressure >= 80;
  const isElevated = pressure >= 40;

  // Left border + background based on pressure
  const accentStyle: React.CSSProperties = isCritical
    ? { borderLeft: `2px solid var(--rq-red)`, background: 'color-mix(in srgb, var(--rq-red) 8%, transparent)' }
    : isElevated
      ? { borderLeft: `2px solid var(--rq-amber)`, background: 'color-mix(in srgb, var(--rq-amber) 6%, transparent)' }
      : isActive
        ? { borderLeft: '2px solid var(--rq-amber)', background: 'var(--rq-bg-2, #141922)' }
        : { borderLeft: '2px solid transparent' };

  return (
    <div
      className={className}
      onClick={onClick}
      style={{
        padding: '12px 14px',
        borderBottom: '1px solid var(--rq-line, #1f2733)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 0.12s',
        position: 'relative',
        ...accentStyle,
      }}
    >
      {/* Name + gate count */}
      <div style={{
        fontWeight: 600,
        fontSize: 13,
        marginBottom: 6,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span>{name}</span>
        <span style={{
          fontFamily: 'var(--rq-mono, monospace)',
          fontSize: 10,
          color: 'var(--rq-ink-3, #6b7585)',
          fontWeight: 400,
        }}>
          {gateCount} gates
        </span>
      </div>

      {/* Pressure bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <div style={{
          flex: 1,
          height: 4,
          background: 'var(--rq-bg-3, #1a212c)',
          borderRadius: 2,
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${Math.max(0, Math.min(100, pressure))}%`,
            background: `var(${cssVar})`,
            transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
          }} />
        </div>
        <span style={{
          fontFamily: 'var(--rq-mono, monospace)',
          fontSize: 10,
          fontVariantNumeric: 'tabular-nums',
          color: `var(${cssVar})`,
          minWidth: 20,
          textAlign: 'right' as const,
        }}>
          {Math.round(pressure)}
        </span>
      </div>

      {/* Stats row */}
      <div style={{
        display: 'flex',
        gap: 10,
        fontFamily: 'var(--rq-mono, monospace)',
        fontSize: 10,
        color: 'var(--rq-ink-3, #6b7585)',
        marginTop: 8,
      }}>
        {turnCount != null && (
          <span>{turnCount} turns</span>
        )}
        {supportCount != null && supportCount > 0 && (
          <span style={{ color: 'var(--rq-amber)' }}>
            {supportCount} sup
          </span>
        )}
        {incidentCount != null && incidentCount > 0 && (
          <span style={{ color: 'var(--rq-red)' }}>
            {incidentCount} inc
          </span>
        )}
        {chief && (
          <span style={{ marginLeft: 'auto', color: 'var(--rq-ink-3)' }}>
            {chief}
          </span>
        )}
      </div>
    </div>
  );
}
