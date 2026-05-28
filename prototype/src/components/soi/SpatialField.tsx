'use client';

/**
 * SOI Spatial Operations Field
 *
 * Stylized gate map with pressure-colored overlays.
 * Uses real operational state data.
 */

import type { OperationalAssessment } from '@/lib/soi-intelligence/operational-reasoning';

interface Props {
  assessment: OperationalAssessment;
  gates: string[];
  onGateClick?: (gateId: string) => void;
}

const GATE_LABELS: Record<string, string> = {
  '52A': 'Alpha', '52B': 'Bravo', '52C': 'Charlie',
  '52D': 'Delta', '52E': 'Echo', '52F': 'Foxtrot',
  '52G': 'Golf', '52H': 'Hotel', '52I': 'India',
};

function gateZone(gateId: string): string | undefined {
  if (['52A', '52B', '52C'].includes(gateId)) return 'GATES-52ABC';
  if (['52D', '52E', '52F'].includes(gateId)) return 'GATES-52DEF';
  if (['52G', '52H', '52I'].includes(gateId)) return 'GATES-52GHI';
  return undefined;
}

function pressureLevel(pressure: number): string {
  if (pressure >= 80) return 'critical';
  if (pressure >= 55) return 'high';
  if (pressure >= 30) return 'medium';
  return 'low';
}

export function SpatialField({ assessment, gates, onGateClick }: Props) {
  return (
    <div className="mc-spatial">
      {/* Grid lines SVG overlay */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.06 }}>
        {/* Horizontal grid lines */}
        {[0.25, 0.5, 0.75].map(y => (
          <line key={`h-${y}`} x1="0" y1={`${y * 100}%`} x2="100%" y2={`${y * 100}%`} stroke="var(--rq-ink-3)" strokeWidth="0.5" />
        ))}
        {/* Vertical grid lines */}
        {[0.33, 0.67].map(x => (
          <line key={`v-${x}`} x1={`${x * 100}%`} y1="0" x2={`${x * 100}%`} y2="100%" stroke="var(--rq-ink-3)" strokeWidth="0.5" />
        ))}
      </svg>

      {/* Zone connection lines */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        {/* Zone A-C to D-F connector */}
        <line x1="50%" y1="33%" x2="50%" y2="67%" stroke="var(--rq-line-2)" strokeWidth="1" strokeDasharray="4 4" opacity="0.3" />
        {/* Horizontal zone connectors */}
        <line x1="33%" y1="50%" x2="67%" y2="50%" stroke="var(--rq-line-2)" strokeWidth="1" strokeDasharray="4 4" opacity="0.3" />
      </svg>

      <div className="mc-spatial-grid">
        {gates.map(gateId => {
          const zoneId = gateZone(gateId);
          const za = zoneId ? assessment.zoneAssessments.find(z => z.zoneId === zoneId) : null;
          const pressure = za?.pressure ?? 0;
          const incidents = za ? Math.round(za.unresolvedCount / (za.zoneId.includes('ABC') ? 3 : za.zoneId.includes('DEF') ? 3 : 3)) : 0;
          const level = pressureLevel(pressure);
          const pColor = level === 'critical' ? 'var(--rq-red)' : level === 'high' ? 'var(--rq-amber)' : level === 'medium' ? 'var(--rq-amber)' : 'var(--rq-green)';

          return (
            <div
              key={gateId}
              className="mc-gate"
              data-pressure={level}
              onClick={() => onGateClick?.(gateId)}
            >
              <div className="mc-gate-id">{gateId}</div>
              <div className="mc-gate-label">{GATE_LABELS[gateId] ?? gateId}</div>
              <div className="mc-gate-pressure" style={{ color: pColor }}>{pressure}</div>
              {incidents > 0 && (
                <div className="mc-gate-incidents">{incidents} incident{incidents > 1 ? 's' : ''}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
