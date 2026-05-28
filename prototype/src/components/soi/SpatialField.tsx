'use client';

/**
 * SOI Spatial Operations Field v2
 *
 * Living operational environment with:
 * - Data-driven pressure heat rendering
 * - Cascade flow animation on cross-zone paths
 * - Recovery chain visualization
 * - Incident markers with severity glow
 * - Environmental depth and motion
 */

import type { OperationalAssessment, ZoneAssessment } from '@/lib/soi-intelligence/operational-reasoning';
import type { LiveExecutionState } from '@/lib/soi-execution/live-execution-engine';
import type { ExecutionPlan } from '@/lib/soi-agentic/execution-planner';

interface Props {
  assessment: OperationalAssessment;
  gates: string[];
  selectedZoneId?: string | null;
  liveExec?: LiveExecutionState | null;
  activePlan?: ExecutionPlan | null;
  onGateClick?: (gateId: string) => void;
}

const GATE_LABELS: Record<string, string> = {
  '52A': 'Alpha', '52B': 'Bravo', '52C': 'Charlie',
  '52D': 'Delta', '52E': 'Echo', '52F': 'Foxtrot',
  '52G': 'Golf', '52H': 'Hotel', '52I': 'India',
};

const GATE_POS: Record<string, { x: number; y: number }> = {
  '52A': { x: 140, y: 130 }, '52B': { x: 320, y: 100 }, '52C': { x: 500, y: 130 },
  '52D': { x: 180, y: 300 }, '52E': { x: 400, y: 280 }, '52F': { x: 620, y: 300 },
  '52G': { x: 220, y: 470 }, '52H': { x: 500, y: 450 }, '52I': { x: 740, y: 470 },
};

const ZONE_GATES: Record<string, string[]> = {
  'GATES-52ABC': ['52A', '52B', '52C'],
  'GATES-52DEF': ['52D', '52E', '52F'],
  'GATES-52GHI': ['52G', '52H', '52I'],
};

const TAXIWAYS: Array<{ from: string; to: string }> = [
  { from: '52A', to: '52B' }, { from: '52B', to: '52C' },
  { from: '52D', to: '52E' }, { from: '52E', to: '52F' },
  { from: '52G', to: '52H' }, { from: '52H', to: '52I' },
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

function pressureColor(p: number): string {
  if (p >= 80) return '#ff5c5c';
  if (p >= 55) return '#f5b13d';
  if (p >= 30) return '#d4a04a';
  return '#2a9d6a';
}

function pressureGlowRadius(p: number): number {
  return 20 + (p / 100) * 40;
}

function pressureGlowOpacity(p: number): number {
  if (p >= 80) return 0.18;
  if (p >= 55) return 0.12;
  if (p >= 30) return 0.06;
  return 0.03;
}

export function SpatialField({ assessment, gates, selectedZoneId, liveExec, activePlan, onGateClick }: Props) {
  const zoneMap = new Map<string, ZoneAssessment>();
  for (const za of assessment.zoneAssessments) {
    zoneMap.set(za.zoneId, za);
  }

  // Recovery step targets for visualization
  const activeStepTargets = new Set<string>();
  const completedStepTargets = new Set<string>();
  const stalledStepTargets = new Set<string>();
  if (liveExec && activePlan) {
    for (let i = 0; i < activePlan.steps.length; i++) {
      const step = activePlan.steps[i];
      const ls = liveExec.steps[i];
      const gate = step.target;
      if (ls?.phase === 'active' || ls?.phase === 'dispatched' || ls?.phase === 'acknowledged') activeStepTargets.add(gate);
      else if (ls?.phase === 'completed') completedStepTargets.add(gate);
      else if (ls?.phase === 'stalled') stalledStepTargets.add(gate);
    }
  }

  return (
    <div className="mc-spatial">
      <svg viewBox="0 0 1000 600" style={{ width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid meet">
        <defs>
          {/* Pressure heat gradients — one per zone, data-driven */}
          {Object.entries(ZONE_GATES).map(([zoneId, zoneGateIds]) => {
            const za = zoneMap.get(zoneId);
            const p = za?.pressure ?? 0;
            const positions = zoneGateIds.map(g => GATE_POS[g]).filter(Boolean);
            if (positions.length === 0) return null;
            const cx = positions.reduce((s, pos) => s + pos.x, 0) / positions.length;
            const cy = positions.reduce((s, pos) => s + pos.y, 0) / positions.length;
            return (
              <radialGradient key={`heat-${zoneId}`} id={`heat-${zoneId}`}
                cx={cx / 1000} cy={cy / 600} r="0.35" fx={cx / 1000} fy={cy / 600}>
                <stop offset="0%" stopColor={pressureColor(p)} stopOpacity={pressureGlowOpacity(p)} />
                <stop offset="60%" stopColor={pressureColor(p)} stopOpacity={pressureGlowOpacity(p) * 0.3} />
                <stop offset="100%" stopColor={pressureColor(p)} stopOpacity="0" />
              </radialGradient>
            );
          })}

          {/* Glow filter for nodes */}
          <filter id="node-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>

          {/* Cascade flow dot */}
          <circle id="flow-dot" r="3" fill="#f5b13d" opacity="0.7" />
        </defs>

        {/* ── Layer 0: Environmental vignette ── */}
        <rect width="1000" height="600" fill="url(#vignette)" opacity="0.5" />
        <radialGradient id="vignette" cx="0.5" cy="0.5" r="0.6">
          <stop offset="0%" stopColor="transparent" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.4" />
        </radialGradient>

        {/* ── Layer 1: Tactical grid ── */}
        <g opacity="0.03" strokeWidth="0.5" stroke="#8899aa">
          {[80, 160, 240, 320, 400, 480, 560].map(y => (
            <line key={`g-h-${y}`} x1="40" y1={y} x2="960" y2={y} />
          ))}
          {[80, 160, 240, 320, 400, 480, 560, 640, 720, 800, 880, 960].map(x => (
            <line key={`g-v-${x}`} x1={x} y1="40" x2={x} y2="560" />
          ))}
        </g>

        {/* ── Layer 2: Pressure heat fields ── */}
        {Object.entries(ZONE_GATES).map(([zoneId]) => {
          const za = zoneMap.get(zoneId);
          if (!za || za.pressure < 10) return null;
          return (
            <rect key={`hf-${zoneId}`} width="1000" height="600" fill={`url(#heat-${zoneId})`}>
              {za.pressure >= 60 && (
                <animate attributeName="opacity" values="0.8;1;0.8" dur={za.pressure >= 80 ? '3s' : '5s'} repeatCount="indefinite" />
              )}
            </rect>
          );
        })}

        {/* ── Layer 3: Zone boundary regions ── */}
        {Object.entries(ZONE_GATES).map(([zoneId, zoneGateIds]) => {
          const za = zoneMap.get(zoneId);
          const positions = zoneGateIds.map(g => GATE_POS[g]).filter(Boolean);
          if (positions.length < 2) return null;
          const minX = Math.min(...positions.map(p => p.x)) - 55;
          const maxX = Math.max(...positions.map(p => p.x)) + 55;
          const minY = Math.min(...positions.map(p => p.y)) - 45;
          const maxY = Math.max(...positions.map(p => p.y)) + 45;
          const isSelected = selectedZoneId === zoneId;
          const pColor = za ? pressureColor(za.pressure) : '#1f2733';

          return (
            <rect key={`zb-${zoneId}`} x={minX} y={minY} width={maxX - minX} height={maxY - minY}
              rx="3" fill="none"
              stroke={isSelected ? pColor : 'rgba(255,255,255,.04)'}
              strokeWidth={isSelected ? 1.5 : 0.5}
              strokeDasharray={isSelected ? 'none' : '8 6'}
              opacity={isSelected ? 0.8 : 0.4} />
          );
        })}

        {/* ── Layer 4: Taxiway paths + cascade flow ── */}
        {TAXIWAYS.map(({ from, to }, i) => {
          const p1 = GATE_POS[from];
          const p2 = GATE_POS[to];
          if (!p1 || !p2) return null;

          const z1 = gateZone(from);
          const z2 = gateZone(to);
          const isCrossZone = z1 !== z2;
          const za1 = z1 ? zoneMap.get(z1) : null;
          const za2 = z2 ? zoneMap.get(z2) : null;
          const bothPressured = za1 && za2 && za1.pressure >= 50 && za2.pressure >= 50;
          const cascadeActive = bothPressured && isCrossZone;

          return (
            <g key={`tw-${i}`}>
              {/* Base taxiway */}
              <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                stroke={cascadeActive ? pressureColor(Math.max(za1?.pressure ?? 0, za2?.pressure ?? 0)) : 'rgba(255,255,255,.06)'}
                strokeWidth={cascadeActive ? 1.5 : 0.8}
                strokeDasharray={isCrossZone ? '8 5' : 'none'}
                opacity={cascadeActive ? 0.4 : 0.3} />

              {/* Cascade flow animation */}
              {cascadeActive && (
                <circle r="2.5" fill="#f5b13d" opacity="0.6">
                  <animateMotion dur="3s" repeatCount="indefinite"
                    path={`M${p1.x},${p1.y} L${p2.x},${p2.y}`} />
                  <animate attributeName="opacity" values="0.2;0.7;0.2" dur="3s" repeatCount="indefinite" />
                </circle>
              )}
            </g>
          );
        })}

        {/* ── Layer 5: Gate nodes ── */}
        {gates.map(gateId => {
          const pos = GATE_POS[gateId];
          if (!pos) return null;
          const zoneId = gateZone(gateId);
          const za = zoneId ? zoneMap.get(zoneId) : null;
          const pressure = za?.pressure ?? 0;
          const incidents = za ? Math.ceil(za.unresolvedCount / 3) : 0;
          const pColor = pressureColor(pressure);
          const isRecoveryActive = activeStepTargets.has(gateId) || activeStepTargets.has(zoneId ?? '');
          const isRecoveryDone = completedStepTargets.has(gateId) || completedStepTargets.has(zoneId ?? '');
          const isRecoveryStalled = stalledStepTargets.has(gateId) || stalledStepTargets.has(zoneId ?? '');

          const nodeStroke = isRecoveryActive ? '#5aa9ff' : isRecoveryStalled ? '#f5b13d' : isRecoveryDone ? '#3ed598' : pColor;
          const nodeStrokeWidth = isRecoveryActive || isRecoveryStalled ? 2.5 : 1.5;

          return (
            <g key={gateId} onClick={() => onGateClick?.(gateId)} style={{ cursor: 'pointer' }}>
              {/* Pressure heat bloom */}
              <circle cx={pos.x} cy={pos.y} r={pressureGlowRadius(pressure)}
                fill={pColor} fillOpacity={pressureGlowOpacity(pressure)}
                filter={pressure >= 40 ? 'url(#node-glow)' : undefined}>
                {pressure >= 60 && (
                  <animate attributeName="r" values={`${pressureGlowRadius(pressure) - 4};${pressureGlowRadius(pressure) + 4};${pressureGlowRadius(pressure) - 4}`}
                    dur={pressure >= 80 ? '2.5s' : '4s'} repeatCount="indefinite" />
                )}
              </circle>

              {/* Gate circle */}
              <circle cx={pos.x} cy={pos.y} r={21}
                fill="#0a0d12" stroke={nodeStroke} strokeWidth={nodeStrokeWidth} />

              {/* Recovery ring animation */}
              {isRecoveryActive && (
                <circle cx={pos.x} cy={pos.y} r={26} fill="none" stroke="#5aa9ff" strokeWidth="1"
                  strokeDasharray="4 4" opacity="0.5">
                  <animateTransform attributeName="transform" type="rotate"
                    from={`0 ${pos.x} ${pos.y}`} to={`360 ${pos.x} ${pos.y}`} dur="8s" repeatCount="indefinite" />
                </circle>
              )}

              {/* Gate letter */}
              <text x={pos.x} y={pos.y + 1} textAnchor="middle" dominantBaseline="middle"
                fill={nodeStroke} fontSize="14" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
                {gateId.replace('52', '')}
              </text>

              {/* NATO label */}
              <text x={pos.x} y={pos.y + 34} textAnchor="middle"
                fill="#4a5568" fontSize="7" letterSpacing="0.12em" fontFamily="'JetBrains Mono', monospace"
                textDecoration="none">
                {GATE_LABELS[gateId]?.toUpperCase()}
              </text>

              {/* Pressure score */}
              {pressure > 0 && (
                <text x={pos.x} y={pos.y + 46} textAnchor="middle"
                  fill={pColor} fontSize="9" fontWeight="600" fontFamily="'JetBrains Mono', monospace"
                  opacity="0.8">
                  {pressure}
                </text>
              )}

              {/* Incident badge */}
              {incidents > 0 && (
                <g>
                  <circle cx={pos.x + 18} cy={pos.y - 18} r={9} fill={pColor} fillOpacity={0.85} />
                  <text x={pos.x + 18} y={pos.y - 18} textAnchor="middle" dominantBaseline="central"
                    fill="#fff" fontSize="8" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
                    {incidents}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* ── Layer 6: Zone labels ── */}
        {Object.entries(ZONE_GATES).map(([zoneId, zoneGateIds]) => {
          const positions = zoneGateIds.map(g => GATE_POS[g]).filter(Boolean);
          if (positions.length === 0) return null;
          const cx = positions.reduce((s, p) => s + p.x, 0) / positions.length;
          const minY = Math.min(...positions.map(p => p.y));
          const za = zoneMap.get(zoneId);

          return (
            <text key={`lbl-${zoneId}`} x={cx} y={minY - 38} textAnchor="middle"
              fill="#3a4454" fontSize="8" letterSpacing="0.16em" fontFamily="'JetBrains Mono', monospace">
              {za?.zoneLabel?.toUpperCase() ?? zoneId}
            </text>
          );
        })}

        {/* ── Layer 7: Status badge on worst zone ── */}
        {(() => {
          const worst = [...assessment.zoneAssessments].sort((a, b) => b.pressure - a.pressure)[0];
          if (!worst || worst.pressure < 50) return null;
          const zg = ZONE_GATES[worst.zoneId];
          if (!zg) return null;
          const positions = zg.map(g => GATE_POS[g]).filter(Boolean);
          const maxX = Math.max(...positions.map(p => p.x));
          const minY = Math.min(...positions.map(p => p.y));
          const color = pressureColor(worst.pressure);
          const label = worst.stability.toUpperCase();

          return (
            <g>
              <rect x={maxX + 35} y={minY - 12} width={84} height={24} rx={2}
                fill={color} fillOpacity={0.1} stroke={color} strokeWidth={0.8} />
              <text x={maxX + 77} y={minY + 2} textAnchor="middle" dominantBaseline="middle"
                fill={color} fontSize="8" fontWeight="700" letterSpacing="0.12em" fontFamily="'JetBrains Mono', monospace">
                {label}
              </text>
              {worst.pressure >= 80 && (
                <rect x={maxX + 35} y={minY - 12} width={84} height={24} rx={2}
                  fill="none" stroke={color} strokeWidth={0.5} opacity="0.4">
                  <animate attributeName="opacity" values="0.2;0.5;0.2" dur="2s" repeatCount="indefinite" />
                </rect>
              )}
            </g>
          );
        })()}

        {/* ── Layer 8: Coordinate markers ── */}
        <text x="30" y="580" fill="#2a3040" fontSize="7" fontFamily="'JetBrains Mono', monospace" letterSpacing="0.1em">LAX T5 RAMP</text>
        <text x="930" y="580" fill="#2a3040" fontSize="7" fontFamily="'JetBrains Mono', monospace" letterSpacing="0.1em" textAnchor="end">52A–I</text>
      </svg>
    </div>
  );
}
