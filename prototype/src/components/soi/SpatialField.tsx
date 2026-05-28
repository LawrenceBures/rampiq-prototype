'use client';

/**
 * SOI Spatial Operations Field
 *
 * SVG gate topology with pressure-colored overlays,
 * cascade path visualization, and incident markers.
 * Uses real operational state data.
 */

import type { OperationalAssessment, ZoneAssessment } from '@/lib/soi-intelligence/operational-reasoning';

interface Props {
  assessment: OperationalAssessment;
  gates: string[];
  selectedZoneId?: string | null;
  onGateClick?: (gateId: string) => void;
}

const GATE_LABELS: Record<string, string> = {
  '52A': 'Alpha', '52B': 'Bravo', '52C': 'Charlie',
  '52D': 'Delta', '52E': 'Echo', '52F': 'Foxtrot',
  '52G': 'Golf', '52H': 'Hotel', '52I': 'India',
};

// Gate positions in SVG viewBox (1000x600)
const GATE_POS: Record<string, { x: number; y: number }> = {
  '52A': { x: 140, y: 130 }, '52B': { x: 320, y: 100 }, '52C': { x: 500, y: 130 },
  '52D': { x: 180, y: 300 }, '52E': { x: 400, y: 280 }, '52F': { x: 620, y: 300 },
  '52G': { x: 220, y: 470 }, '52H': { x: 500, y: 450 }, '52I': { x: 740, y: 470 },
};

// Zone boundaries for grouping
const ZONE_GATES: Record<string, string[]> = {
  'GATES-52ABC': ['52A', '52B', '52C'],
  'GATES-52DEF': ['52D', '52E', '52F'],
  'GATES-52GHI': ['52G', '52H', '52I'],
};

// Taxiway paths connecting gates
const TAXIWAYS: Array<{ from: string; to: string }> = [
  // Within zone A-C
  { from: '52A', to: '52B' }, { from: '52B', to: '52C' },
  // Within zone D-F
  { from: '52D', to: '52E' }, { from: '52E', to: '52F' },
  // Within zone G-I
  { from: '52G', to: '52H' }, { from: '52H', to: '52I' },
  // Cross-zone connectors (main taxiway)
  { from: '52B', to: '52E' }, { from: '52E', to: '52H' },
  { from: '52A', to: '52D' }, { from: '52D', to: '52G' },
  { from: '52C', to: '52F' }, { from: '52F', to: '52I' },
];

function gateZone(gateId: string): string | undefined {
  for (const [zone, gates] of Object.entries(ZONE_GATES)) {
    if (gates.includes(gateId)) return zone;
  }
  return undefined;
}

function pressureColor(pressure: number): string {
  if (pressure >= 80) return '#ff5c5c';
  if (pressure >= 55) return '#f5b13d';
  if (pressure >= 30) return '#f5b13d';
  return '#3ed598';
}

export function SpatialField({ assessment, gates, selectedZoneId, onGateClick }: Props) {
  // Build pressure map per zone
  const zoneMap = new Map<string, ZoneAssessment>();
  for (const za of assessment.zoneAssessments) {
    zoneMap.set(za.zoneId, za);
  }

  return (
    <div className="mc-spatial">
      <svg viewBox="0 0 1000 600" style={{ width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid meet">
        <defs>
          {/* Glow filters */}
          <filter id="glow-red" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="12" result="blur" />
            <feFlood floodColor="#ff5c5c" floodOpacity="0.3" />
            <feComposite in2="blur" operator="in" />
            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glow-amber" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="10" result="blur" />
            <feFlood floodColor="#f5b13d" floodOpacity="0.2" />
            <feComposite in2="blur" operator="in" />
            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glow-green" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feFlood floodColor="#3ed598" floodOpacity="0.15" />
            <feComposite in2="blur" operator="in" />
            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Background grid */}
        <g opacity="0.04">
          {[100, 200, 300, 400, 500].map(y => (
            <line key={`hg-${y}`} x1="0" y1={y} x2="1000" y2={y} stroke="#fff" strokeWidth="0.5" />
          ))}
          {[100, 200, 300, 400, 500, 600, 700, 800, 900].map(x => (
            <line key={`vg-${x}`} x1={x} y1="0" x2={x} y2="600" stroke="#fff" strokeWidth="0.5" />
          ))}
        </g>

        {/* Zone boundary regions */}
        {Object.entries(ZONE_GATES).map(([zoneId, zoneGates]) => {
          const za = zoneMap.get(zoneId);
          const positions = zoneGates.map(g => GATE_POS[g]).filter(Boolean);
          if (positions.length < 2) return null;
          const minX = Math.min(...positions.map(p => p.x)) - 60;
          const maxX = Math.max(...positions.map(p => p.x)) + 60;
          const minY = Math.min(...positions.map(p => p.y)) - 50;
          const maxY = Math.max(...positions.map(p => p.y)) + 50;
          const isSelected = selectedZoneId === zoneId;
          const pColor = za ? pressureColor(za.pressure) : '#2a3442';

          return (
            <rect key={zoneId} x={minX} y={minY} width={maxX - minX} height={maxY - minY}
              rx="4" fill={pColor} fillOpacity={isSelected ? 0.08 : 0.03}
              stroke={isSelected ? pColor : '#1f2733'} strokeWidth={isSelected ? 1.5 : 0.5}
              strokeDasharray={isSelected ? 'none' : '4 4'} />
          );
        })}

        {/* Taxiway paths */}
        {TAXIWAYS.map(({ from, to }) => {
          const p1 = GATE_POS[from];
          const p2 = GATE_POS[to];
          if (!p1 || !p2) return null;

          // Color cascade paths between zones
          const z1 = gateZone(from);
          const z2 = gateZone(to);
          const isCrossZone = z1 !== z2;
          const za1 = z1 ? zoneMap.get(z1) : null;
          const za2 = z2 ? zoneMap.get(z2) : null;
          const bothPressured = za1 && za2 && za1.pressure >= 50 && za2.pressure >= 50;

          return (
            <line key={`${from}-${to}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
              stroke={bothPressured && isCrossZone ? '#f5b13d' : '#1f2733'}
              strokeWidth={bothPressured && isCrossZone ? 1.5 : 1}
              strokeDasharray={isCrossZone ? '6 4' : 'none'}
              opacity={bothPressured && isCrossZone ? 0.5 : 0.25} />
          );
        })}

        {/* Gate nodes */}
        {gates.map(gateId => {
          const pos = GATE_POS[gateId];
          if (!pos) return null;
          const zoneId = gateZone(gateId);
          const za = zoneId ? zoneMap.get(zoneId) : null;
          const pressure = za?.pressure ?? 0;
          const incidents = za ? Math.ceil(za.unresolvedCount / 3) : 0;
          const pColor = pressureColor(pressure);
          const glowFilter = pressure >= 80 ? 'url(#glow-red)' : pressure >= 50 ? 'url(#glow-amber)' : pressure >= 20 ? 'url(#glow-green)' : 'none';

          return (
            <g key={gateId} onClick={() => onGateClick?.(gateId)} style={{ cursor: 'pointer' }}>
              {/* Pressure glow */}
              <circle cx={pos.x} cy={pos.y} r={pressure >= 50 ? 32 : 24} fill={pColor} fillOpacity={0.08} filter={glowFilter} />

              {/* Gate node */}
              <circle cx={pos.x} cy={pos.y} r={20} fill="var(--rq-bg-1)" stroke={pColor} strokeWidth={1.5} />

              {/* Gate ID */}
              <text x={pos.x} y={pos.y - 2} textAnchor="middle" dominantBaseline="middle"
                fill={pColor} fontSize="13" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
                {gateId.replace('52', '')}
              </text>

              {/* NATO label */}
              <text x={pos.x} y={pos.y + 32} textAnchor="middle"
                fill="#6b7585" fontSize="7" letterSpacing="0.1em" fontFamily="'JetBrains Mono', monospace">
                {GATE_LABELS[gateId]?.toUpperCase()}
              </text>

              {/* Pressure value */}
              <text x={pos.x} y={pos.y + 44} textAnchor="middle"
                fill={pColor} fontSize="9" fontWeight="600" fontFamily="'JetBrains Mono', monospace">
                {pressure}
              </text>

              {/* Incident count badge */}
              {incidents > 0 && (
                <>
                  <circle cx={pos.x + 16} cy={pos.y - 16} r={8} fill={pColor} fillOpacity={0.9} />
                  <text x={pos.x + 16} y={pos.y - 16} textAnchor="middle" dominantBaseline="central"
                    fill="#fff" fontSize="8" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
                    {incidents}
                  </text>
                </>
              )}
            </g>
          );
        })}

        {/* Zone labels */}
        {Object.entries(ZONE_GATES).map(([zoneId, zoneGates]) => {
          const positions = zoneGates.map(g => GATE_POS[g]).filter(Boolean);
          if (positions.length === 0) return null;
          const cx = positions.reduce((s, p) => s + p.x, 0) / positions.length;
          const minY = Math.min(...positions.map(p => p.y));
          const za = zoneMap.get(zoneId);

          return (
            <text key={`lbl-${zoneId}`} x={cx} y={minY - 40} textAnchor="middle"
              fill="#454e5d" fontSize="8" letterSpacing="0.14em" fontFamily="'JetBrains Mono', monospace">
              {za?.zoneLabel?.toUpperCase() ?? zoneId}
            </text>
          );
        })}

        {/* Elevated badge on worst zone */}
        {(() => {
          const worst = [...assessment.zoneAssessments].sort((a, b) => b.pressure - a.pressure)[0];
          if (!worst || worst.pressure < 50) return null;
          const zoneGates = ZONE_GATES[worst.zoneId];
          if (!zoneGates) return null;
          const positions = zoneGates.map(g => GATE_POS[g]).filter(Boolean);
          const maxX = Math.max(...positions.map(p => p.x));
          const minY = Math.min(...positions.map(p => p.y));
          const label = worst.stability.toUpperCase();
          const color = pressureColor(worst.pressure);

          return (
            <g>
              <rect x={maxX + 30} y={minY - 10} width={80} height={22} rx={2} fill={color} fillOpacity={0.15} stroke={color} strokeWidth={1} />
              <text x={maxX + 70} y={minY + 3} textAnchor="middle" dominantBaseline="middle"
                fill={color} fontSize="8" fontWeight="700" letterSpacing="0.1em" fontFamily="'JetBrains Mono', monospace">
                {label}
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
