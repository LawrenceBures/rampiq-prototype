'use client';

/**
 * SOI Spatial Operations Field v3
 *
 * Per-gate operational fidelity:
 * - Per-gate pressure derived from incidents
 * - Directional cascade flow with arrowheads
 * - Gate-specific incident markers
 * - Aircraft/turnaround occupancy
 * - Resource movement traces from active recovery
 * - Selected gate focus
 */

import type { OperationalAssessment, ZoneAssessment } from '@/lib/soi-intelligence/operational-reasoning';
import type { LiveExecutionState } from '@/lib/soi-execution/live-execution-engine';
import type { ExecutionPlan } from '@/lib/soi-agentic/execution-planner';
import type { Incident } from '@/lib/lifecycle-types';
import type { SoiEvent } from '@/lib/soi-types';

// ============================================================
// TYPES
// ============================================================

interface Props {
  assessment: OperationalAssessment;
  gates: string[];
  incidents: readonly Incident[];
  events: readonly SoiEvent[];
  selectedZoneId?: string | null;
  selectedGateId?: string | null;
  liveExec?: LiveExecutionState | null;
  activePlan?: ExecutionPlan | null;
  onGateClick?: (gateId: string) => void;
}

interface GateState {
  gateId: string;
  pressure: number;
  incidents: number;
  criticalCount: number;
  highCount: number;
  occupied: boolean;
  hasEquipmentIssue: boolean;
  oldestIncidentMin: number;
}

// ============================================================
// CONSTANTS
// ============================================================

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

const SEV_W: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

function pColor(p: number): string {
  if (p >= 80) return '#ff5c5c';
  if (p >= 55) return '#f5b13d';
  if (p >= 30) return '#d4a04a';
  return '#2a9d6a';
}

// ============================================================
// PER-GATE PRESSURE COMPUTATION
// ============================================================

function computeGateStates(
  gates: string[],
  incidents: readonly Incident[],
  events: readonly SoiEvent[],
  assessment: OperationalAssessment,
): Map<string, GateState> {
  const map = new Map<string, GateState>();
  const now = Date.now();

  for (const gateId of gates) {
    const gateIncidents = incidents.filter(i =>
      i.gate_id === gateId && i.status !== 'RESOLVED' && i.status !== 'CLOSED'
    );
    const gateEvents = events.filter(e => e.gate_id === gateId);
    const zoneId = gateZone(gateId);
    const za = zoneId ? assessment.zoneAssessments.find(z => z.zoneId === zoneId) : null;

    // Per-gate pressure: derived from incidents at this gate + zone baseline
    const incidentPressure = gateIncidents.reduce((s, i) => s + (SEV_W[i.severity] ?? 1) * 12, 0);
    const agePressure = gateIncidents.reduce((s, i) => {
      const age = (now - new Date(i.opened_at).getTime()) / 60000;
      return s + Math.min(age / 3, 15);
    }, 0);
    const zoneBaseline = za ? za.pressure * 0.2 : 0; // 20% zone influence
    const rawPressure = incidentPressure + agePressure + zoneBaseline;
    const pressure = Math.max(0, Math.min(100, Math.round(rawPressure)));

    const occupied = gateEvents.some(e =>
      (e.event_type === 'service.started' || e.event_type === 'service.confirmed') &&
      e.operational_status !== 'RESOLVED'
    ) || gateIncidents.length > 0;

    const hasEquipment = gateEvents.some(e =>
      e.equipment_id && e.operational_status !== 'RESOLVED'
    );

    const oldest = gateIncidents.length > 0
      ? Math.max(...gateIncidents.map(i => (now - new Date(i.opened_at).getTime()) / 60000))
      : 0;

    map.set(gateId, {
      gateId,
      pressure,
      incidents: gateIncidents.length,
      criticalCount: gateIncidents.filter(i => i.severity === 'CRITICAL').length,
      highCount: gateIncidents.filter(i => i.severity === 'HIGH').length,
      occupied,
      hasEquipmentIssue: hasEquipment,
      oldestIncidentMin: Math.round(oldest),
    });
  }

  return map;
}

// ============================================================
// COMPONENT
// ============================================================

export function SpatialField({ assessment, gates, incidents, events, selectedZoneId, selectedGateId, liveExec, activePlan, onGateClick }: Props) {
  const zoneMap = new Map<string, ZoneAssessment>();
  for (const za of assessment.zoneAssessments) zoneMap.set(za.zoneId, za);

  const gateStates = computeGateStates(gates, incidents, events, assessment);

  // Recovery targets
  const activeTargets = new Set<string>();
  const completedTargets = new Set<string>();
  const stalledTargets = new Set<string>();
  if (liveExec && activePlan) {
    for (let i = 0; i < activePlan.steps.length; i++) {
      const t = activePlan.steps[i].target;
      const ph = liveExec.steps[i]?.phase;
      if (ph === 'active' || ph === 'dispatched' || ph === 'acknowledged') activeTargets.add(t);
      else if (ph === 'completed') completedTargets.add(t);
      else if (ph === 'stalled') stalledTargets.add(t);
    }
  }

  return (
    <div className="mc-spatial">
      <svg viewBox="0 0 1000 600" style={{ width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid meet">
        <defs>
          <filter id="ng" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <radialGradient id="vig" cx="0.5" cy="0.5" r="0.6">
            <stop offset="0%" stopColor="transparent" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.4" />
          </radialGradient>
          {/* Cascade arrowhead */}
          <marker id="arrow-amber" viewBox="0 0 8 6" refX="8" refY="3" markerWidth="8" markerHeight="6" orient="auto">
            <path d="M0,0 L8,3 L0,6 Z" fill="#f5b13d" opacity="0.5" />
          </marker>
          <marker id="arrow-red" viewBox="0 0 8 6" refX="8" refY="3" markerWidth="8" markerHeight="6" orient="auto">
            <path d="M0,0 L8,3 L0,6 Z" fill="#ff5c5c" opacity="0.5" />
          </marker>
        </defs>

        {/* Vignette */}
        <rect width="1000" height="600" fill="url(#vig)" />

        {/* Tactical grid */}
        <g opacity="0.025" stroke="#8899aa" strokeWidth="0.5">
          {[80,160,240,320,400,480,560].map(y => <line key={`h${y}`} x1="40" y1={y} x2="960" y2={y} />)}
          {[80,160,240,320,400,480,560,640,720,800,880,960].map(x => <line key={`v${x}`} x1={x} y1="40" x2={x} y2="560" />)}
        </g>

        {/* Per-gate pressure heat fields */}
        {gates.map(gateId => {
          const gs = gateStates.get(gateId);
          const pos = GATE_POS[gateId];
          if (!gs || !pos || gs.pressure < 10) return null;
          const r = 20 + (gs.pressure / 100) * 50;
          const op = gs.pressure >= 80 ? 0.16 : gs.pressure >= 55 ? 0.10 : gs.pressure >= 30 ? 0.05 : 0.02;
          return (
            <circle key={`heat-${gateId}`} cx={pos.x} cy={pos.y} r={r}
              fill={pColor(gs.pressure)} fillOpacity={op} filter={gs.pressure >= 40 ? 'url(#ng)' : undefined}>
              {gs.pressure >= 60 && (
                <animate attributeName="r" values={`${r-5};${r+5};${r-5}`}
                  dur={gs.pressure >= 80 ? '2.5s' : '4s'} repeatCount="indefinite" />
              )}
            </circle>
          );
        })}

        {/* Zone boundaries */}
        {Object.entries(ZONE_GATES).map(([zoneId, zg]) => {
          const positions = zg.map(g => GATE_POS[g]).filter(Boolean);
          if (positions.length < 2) return null;
          const minX = Math.min(...positions.map(p => p.x)) - 55;
          const maxX = Math.max(...positions.map(p => p.x)) + 55;
          const minY = Math.min(...positions.map(p => p.y)) - 45;
          const maxY = Math.max(...positions.map(p => p.y)) + 45;
          const isSel = selectedZoneId === zoneId;
          const za = zoneMap.get(zoneId);
          const c = za ? pColor(za.pressure) : '#1f2733';
          return (
            <rect key={`zb-${zoneId}`} x={minX} y={minY} width={maxX-minX} height={maxY-minY}
              rx="3" fill="none" stroke={isSel ? c : 'rgba(255,255,255,.03)'}
              strokeWidth={isSel ? 1.5 : 0.5} strokeDasharray={isSel ? 'none' : '8 6'}
              opacity={isSel ? 0.7 : 0.3} />
          );
        })}

        {/* Taxiways + directional cascade */}
        {TAXIWAYS.map(({ from, to }, i) => {
          const p1 = GATE_POS[from];
          const p2 = GATE_POS[to];
          if (!p1 || !p2) return null;
          const z1 = gateZone(from);
          const z2 = gateZone(to);
          const isCross = z1 !== z2;
          const za1 = z1 ? zoneMap.get(z1) : null;
          const za2 = z2 ? zoneMap.get(z2) : null;
          const cascadeActive = isCross && za1 && za2 && za1.pressure >= 50 && za2.pressure >= 50;

          // Directional: flow from higher pressure to lower
          let flowFrom = p1, flowTo = p2;
          let arrowMarker = 'url(#arrow-amber)';
          if (cascadeActive && za1 && za2) {
            if (za2.pressure > za1.pressure) { flowFrom = p2; flowTo = p1; }
            if (Math.max(za1.pressure, za2.pressure) >= 80) arrowMarker = 'url(#arrow-red)';
          }

          return (
            <g key={`tw-${i}`}>
              <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                stroke={cascadeActive ? pColor(Math.max(za1?.pressure??0, za2?.pressure??0)) : 'rgba(255,255,255,.05)'}
                strokeWidth={cascadeActive ? 1.5 : 0.7}
                strokeDasharray={isCross ? '8 5' : 'none'}
                opacity={cascadeActive ? 0.35 : 0.25}
                markerEnd={cascadeActive ? arrowMarker : undefined} />
              {cascadeActive && (
                <circle r="2.5" fill={pColor(Math.max(za1?.pressure??0, za2?.pressure??0))} opacity="0.5">
                  <animateMotion dur="3s" repeatCount="indefinite"
                    path={`M${flowFrom.x},${flowFrom.y} L${flowTo.x},${flowTo.y}`} />
                  <animate attributeName="opacity" values="0.15;0.6;0.15" dur="3s" repeatCount="indefinite" />
                </circle>
              )}
            </g>
          );
        })}

        {/* Resource movement traces (active recovery steps) */}
        {activePlan && liveExec && activePlan.steps.map((step, i) => {
          const ls = liveExec.steps[i];
          if (!ls || (ls.phase !== 'active' && ls.phase !== 'dispatched' && ls.phase !== 'acknowledged')) return null;
          const targetPos = GATE_POS[step.target];
          if (!targetPos) return null;
          // Trace from center-bottom toward target gate
          const srcX = 500;
          const srcY = 580;
          return (
            <g key={`res-${i}`} opacity="0.4">
              <line x1={srcX} y1={srcY} x2={targetPos.x} y2={targetPos.y}
                stroke="#5aa9ff" strokeWidth="1" strokeDasharray="4 6" />
              <circle r="3" fill="#5aa9ff" opacity="0.7">
                <animateMotion dur="2s" repeatCount="indefinite"
                  path={`M${srcX},${srcY} L${targetPos.x},${targetPos.y}`} />
              </circle>
            </g>
          );
        })}

        {/* Gate nodes */}
        {gates.map(gateId => {
          const pos = GATE_POS[gateId];
          if (!pos) return null;
          const gs = gateStates.get(gateId);
          const pressure = gs?.pressure ?? 0;
          const zoneId = gateZone(gateId);
          const isActive = activeTargets.has(gateId) || activeTargets.has(zoneId ?? '');
          const isDone = completedTargets.has(gateId) || completedTargets.has(zoneId ?? '');
          const isStalled = stalledTargets.has(gateId) || stalledTargets.has(zoneId ?? '');
          const isFocused = selectedGateId === gateId;
          const nodeColor = isActive ? '#5aa9ff' : isStalled ? '#f5b13d' : isDone ? '#3ed598' : pColor(pressure);
          const strokeW = isFocused ? 3 : isActive || isStalled ? 2.5 : 1.5;

          return (
            <g key={gateId} onClick={() => onGateClick?.(gateId)} style={{ cursor: 'pointer' }}>
              {/* Selected gate focus ring */}
              {isFocused && (
                <circle cx={pos.x} cy={pos.y} r={30} fill="none" stroke={nodeColor} strokeWidth="1"
                  strokeDasharray="3 3" opacity="0.6">
                  <animateTransform attributeName="transform" type="rotate"
                    from={`0 ${pos.x} ${pos.y}`} to={`360 ${pos.x} ${pos.y}`} dur="12s" repeatCount="indefinite" />
                </circle>
              )}

              {/* Recovery ring */}
              {isActive && (
                <circle cx={pos.x} cy={pos.y} r={27} fill="none" stroke="#5aa9ff" strokeWidth="1"
                  strokeDasharray="4 4" opacity="0.5">
                  <animateTransform attributeName="transform" type="rotate"
                    from={`0 ${pos.x} ${pos.y}`} to={`360 ${pos.x} ${pos.y}`} dur="8s" repeatCount="indefinite" />
                </circle>
              )}

              {/* Gate circle */}
              <circle cx={pos.x} cy={pos.y} r={21} fill="#0a0d12" stroke={nodeColor} strokeWidth={strokeW} />

              {/* Occupancy marker (small aircraft glyph) */}
              {gs?.occupied && (
                <text x={pos.x - 18} y={pos.y - 18} fill={nodeColor} fontSize="8" opacity="0.5"
                  fontFamily="'JetBrains Mono', monospace">✈</text>
              )}

              {/* Equipment issue marker */}
              {gs?.hasEquipmentIssue && (
                <text x={pos.x + 14} y={pos.y + 18} fill="#f5b13d" fontSize="7" opacity="0.6"
                  fontFamily="'JetBrains Mono', monospace">⚠</text>
              )}

              {/* Gate letter */}
              <text x={pos.x} y={pos.y + 1} textAnchor="middle" dominantBaseline="middle"
                fill={nodeColor} fontSize="14" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
                {gateId.replace('52', '')}
              </text>

              {/* NATO label */}
              <text x={pos.x} y={pos.y + 34} textAnchor="middle"
                fill="#3a4454" fontSize="7" letterSpacing="0.12em" fontFamily="'JetBrains Mono', monospace">
                {GATE_LABELS[gateId]?.toUpperCase()}
              </text>

              {/* Per-gate pressure */}
              {pressure > 0 && (
                <text x={pos.x} y={pos.y + 46} textAnchor="middle"
                  fill={nodeColor} fontSize="9" fontWeight="600" fontFamily="'JetBrains Mono', monospace" opacity="0.7">
                  {pressure}
                </text>
              )}

              {/* Incident count badge */}
              {(gs?.incidents ?? 0) > 0 && (
                <g>
                  <circle cx={pos.x + 18} cy={pos.y - 18} r={9}
                    fill={gs!.criticalCount > 0 ? '#ff5c5c' : gs!.highCount > 0 ? '#f5b13d' : '#5aa9ff'} fillOpacity={0.85}>
                    {gs!.criticalCount > 0 && (
                      <animate attributeName="r" values="9;11;9" dur="2s" repeatCount="indefinite" />
                    )}
                  </circle>
                  <text x={pos.x + 18} y={pos.y - 18} textAnchor="middle" dominantBaseline="central"
                    fill="#fff" fontSize="8" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
                    {gs!.incidents}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Zone labels */}
        {Object.entries(ZONE_GATES).map(([zoneId, zg]) => {
          const positions = zg.map(g => GATE_POS[g]).filter(Boolean);
          if (!positions.length) return null;
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

        {/* Worst zone badge */}
        {(() => {
          const worst = [...assessment.zoneAssessments].sort((a, b) => b.pressure - a.pressure)[0];
          if (!worst || worst.pressure < 50) return null;
          const zg = ZONE_GATES[worst.zoneId];
          if (!zg) return null;
          const positions = zg.map(g => GATE_POS[g]).filter(Boolean);
          const maxX = Math.max(...positions.map(p => p.x));
          const minY = Math.min(...positions.map(p => p.y));
          const c = pColor(worst.pressure);
          return (
            <g>
              <rect x={maxX+35} y={minY-12} width={84} height={24} rx={2} fill={c} fillOpacity={0.1} stroke={c} strokeWidth={0.8} />
              <text x={maxX+77} y={minY+2} textAnchor="middle" dominantBaseline="middle"
                fill={c} fontSize="8" fontWeight="700" letterSpacing="0.12em" fontFamily="'JetBrains Mono', monospace">
                {worst.stability.toUpperCase()}
              </text>
              {worst.pressure >= 80 && (
                <rect x={maxX+35} y={minY-12} width={84} height={24} rx={2} fill="none" stroke={c} strokeWidth={0.5}>
                  <animate attributeName="opacity" values="0.2;0.5;0.2" dur="2s" repeatCount="indefinite" />
                </rect>
              )}
            </g>
          );
        })()}

        {/* Coordinate markers */}
        <text x="30" y="582" fill="#222838" fontSize="7" fontFamily="'JetBrains Mono', monospace" letterSpacing="0.1em">LAX T5 RAMP</text>
        <text x="970" y="582" fill="#222838" fontSize="7" fontFamily="'JetBrains Mono', monospace" letterSpacing="0.1em" textAnchor="end">52A–I</text>
      </svg>
    </div>
  );
}
