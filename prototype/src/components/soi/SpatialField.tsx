'use client';

/**
 * SOI Spatial Operations Field v4 — Operational World Layer
 *
 * Living operational environment with:
 * - Per-gate pressure + turnaround state
 * - Aircraft presence and state
 * - Equipment glyphs and failures
 * - Workforce presence indicators
 * - Operational flow traces
 * - Gate hover context cards
 */

import { useState } from 'react';
import type { OperationalAssessment, ZoneAssessment } from '@/lib/soi-intelligence/operational-reasoning';
import type { LiveExecutionState } from '@/lib/soi-execution/live-execution-engine';
import type { ExecutionPlan } from '@/lib/soi-agentic/execution-planner';
import type { Incident } from '@/lib/lifecycle-types';
import type { RecoveryAction } from '@/lib/lifecycle-types';
import type { SoiEvent } from '@/lib/soi-types';
import type { FlightWorld } from '@/lib/soi-context/flight-context';
import { computeGateWorld, getGateCascadeRisks, type GateWorld, type TurnState } from '@/lib/soi-context/gate-world';

// ============================================================
// TYPES
// ============================================================

interface Props {
  assessment: OperationalAssessment;
  gates: string[];
  incidents: readonly Incident[];
  recoveryActions?: readonly RecoveryAction[];
  events: readonly SoiEvent[];
  flightWorld?: Map<string, FlightWorld>;
  selectedZoneId?: string | null;
  selectedGateId?: string | null;
  liveExec?: LiveExecutionState | null;
  activePlan?: ExecutionPlan | null;
  onGateClick?: (gateId: string) => void;
}

// GateWorld and TurnState imported from @/lib/soi-context/gate-world

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

const TURN_LABEL: Record<TurnState, string> = {
  empty: 'EMPTY', inbound: 'INBOUND', deplaning: 'DEPLANE', servicing: 'SERVICE', boarding: 'BOARD',
  delayed: 'DELAY', push_ready: 'PUSH', departed: 'DEPT', recovery: 'RCVRY', stabilized: 'STABLE',
};

const TURN_COLOR: Record<TurnState, string> = {
  empty: '#2a3442', inbound: '#5aa9ff', deplaning: '#5aa9ff', servicing: '#3ed598', boarding: '#3ed598',
  delayed: '#f5b13d', push_ready: '#c9ff3a', departed: '#2a3442', recovery: '#ff5c5c', stabilized: '#2a9d6a',
};

// ============================================================
// WORLD STATE COMPUTATION
// ============================================================

// computeGateWorld imported from @/lib/soi-context/gate-world

// ============================================================
// COMPONENT
// ============================================================

export function SpatialField({ assessment, gates, incidents, recoveryActions, events, flightWorld, selectedZoneId, selectedGateId, liveExec, activePlan, onGateClick }: Props) {
  const [hoveredGate, setHoveredGate] = useState<string | null>(null);
  const zoneMap = new Map<string, ZoneAssessment>();
  for (const za of assessment.zoneAssessments) zoneMap.set(za.zoneId, za);

  const gateWorld = computeGateWorld(gates, incidents, recoveryActions ?? [], events, assessment, flightWorld);

  // Recovery targets
  const activeTargets = new Set<string>();
  const completedTargets = new Set<string>();
  if (liveExec && activePlan) {
    for (let i = 0; i < activePlan.steps.length; i++) {
      const t = activePlan.steps[i].target;
      const ph = liveExec.steps[i]?.phase;
      if (ph === 'active' || ph === 'dispatched' || ph === 'acknowledged') activeTargets.add(t);
      else if (ph === 'completed') completedTargets.add(t);
    }
  }

  const hovered = hoveredGate ? gateWorld.get(hoveredGate) : null;
  const hoveredPos = hoveredGate ? GATE_POS[hoveredGate] : null;

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
          <marker id="arr-a" viewBox="0 0 8 6" refX="8" refY="3" markerWidth="8" markerHeight="6" orient="auto">
            <path d="M0,0 L8,3 L0,6 Z" fill="#f5b13d" opacity="0.5" />
          </marker>
          <marker id="arr-r" viewBox="0 0 8 6" refX="8" refY="3" markerWidth="8" markerHeight="6" orient="auto">
            <path d="M0,0 L8,3 L0,6 Z" fill="#ff5c5c" opacity="0.5" />
          </marker>
          {/* Aircraft silhouette */}
          <symbol id="aircraft" viewBox="0 0 20 20">
            <path d="M10,2 L12,8 L18,10 L12,12 L10,18 L8,12 L2,10 L8,8 Z" fill="currentColor" />
          </symbol>
        </defs>

        <rect width="1000" height="600" fill="url(#vig)" />

        {/* Grid */}
        <g opacity="0.02" stroke="#8899aa" strokeWidth="0.5">
          {[80,160,240,320,400,480,560].map(y => <line key={`h${y}`} x1="40" y1={y} x2="960" y2={y} />)}
          {[80,160,240,320,400,480,560,640,720,800,880,960].map(x => <line key={`v${x}`} x1={x} y1="40" x2={x} y2="560" />)}
        </g>

        {/* Per-gate heat */}
        {gates.map(gateId => {
          const gw = gateWorld.get(gateId);
          const pos = GATE_POS[gateId];
          if (!gw || !pos || gw.pressure < 10) return null;
          const r = 20 + (gw.pressure / 100) * 50;
          const op = gw.pressure >= 80 ? 0.14 : gw.pressure >= 55 ? 0.08 : gw.pressure >= 30 ? 0.04 : 0.02;
          return (
            <circle key={`ht-${gateId}`} cx={pos.x} cy={pos.y} r={r} fill={pColor(gw.pressure)} fillOpacity={op} filter={gw.pressure >= 40 ? 'url(#ng)' : undefined}>
              {gw.pressure >= 60 && <animate attributeName="r" values={`${r-4};${r+4};${r-4}`} dur={gw.pressure >= 80 ? '2.5s' : '4s'} repeatCount="indefinite" />}
            </circle>
          );
        })}

        {/* Zone boundaries */}
        {Object.entries(ZONE_GATES).map(([zoneId, zg]) => {
          const positions = zg.map(g => GATE_POS[g]).filter(Boolean);
          if (positions.length < 2) return null;
          const pad = 55;
          const minX = Math.min(...positions.map(p => p.x)) - pad;
          const maxX = Math.max(...positions.map(p => p.x)) + pad;
          const minY = Math.min(...positions.map(p => p.y)) - 45;
          const maxY = Math.max(...positions.map(p => p.y)) + 50;
          const isSel = selectedZoneId === zoneId;
          const za = zoneMap.get(zoneId);
          const c = za ? pColor(za.pressure) : '#1f2733';
          return <rect key={`zb-${zoneId}`} x={minX} y={minY} width={maxX-minX} height={maxY-minY} rx="3" fill="none" stroke={isSel ? c : 'rgba(255,255,255,.025)'} strokeWidth={isSel ? 1.5 : 0.5} strokeDasharray={isSel ? 'none' : '8 6'} opacity={isSel ? 0.7 : 0.25} />;
        })}

        {/* Taxiways + cascade */}
        {TAXIWAYS.map(({ from, to }, i) => {
          const p1 = GATE_POS[from], p2 = GATE_POS[to];
          if (!p1 || !p2) return null;
          const z1 = gateZone(from), z2 = gateZone(to);
          const isCross = z1 !== z2;
          const za1 = z1 ? zoneMap.get(z1) : null, za2 = z2 ? zoneMap.get(z2) : null;
          const cascade = isCross && za1 && za2 && za1.pressure >= 50 && za2.pressure >= 50;
          let fFrom = p1, fTo = p2;
          if (cascade && za1 && za2 && za2.pressure > za1.pressure) { fFrom = p2; fTo = p1; }
          const maxP = Math.max(za1?.pressure ?? 0, za2?.pressure ?? 0);
          return (
            <g key={`tw-${i}`} style={{ opacity: selectedGateId && from !== selectedGateId && to !== selectedGateId ? 0.2 : 1, transition: 'opacity .4s cubic-bezier(.23,1,.32,1)' }}>
              <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={cascade ? pColor(maxP) : 'rgba(255,255,255,.04)'} strokeWidth={cascade ? 1.5 : 0.6} strokeDasharray={isCross ? '8 5' : 'none'} opacity={cascade ? 0.3 : 0.2} markerEnd={cascade ? (maxP >= 80 ? 'url(#arr-r)' : 'url(#arr-a)') : undefined} />
              {cascade && (
                <circle r="2.5" fill={pColor(maxP)} opacity="0.5">
                  <animateMotion dur="3s" repeatCount="indefinite" path={`M${fFrom.x},${fFrom.y} L${fTo.x},${fTo.y}`} />
                  <animate attributeName="opacity" values="0.15;0.6;0.15" dur="3s" repeatCount="indefinite" />
                </circle>
              )}
            </g>
          );
        })}

        {/* Resource traces */}
        {activePlan && liveExec && activePlan.steps.map((step, i) => {
          const ls = liveExec.steps[i];
          if (!ls || !['active','dispatched','acknowledged'].includes(ls.phase)) return null;
          const tp = GATE_POS[step.target];
          if (!tp) return null;
          return (
            <g key={`res-${i}`} opacity="0.35">
              <line x1={500} y1={580} x2={tp.x} y2={tp.y} stroke="#5aa9ff" strokeWidth="1" strokeDasharray="4 6" />
              <circle r="3" fill="#5aa9ff" opacity="0.7"><animateMotion dur="2s" repeatCount="indefinite" path={`M500,580 L${tp.x},${tp.y}`} /></circle>
            </g>
          );
        })}

        {/* Gate nodes with world layer */}
        {gates.map(gateId => {
          const pos = GATE_POS[gateId];
          if (!pos) return null;
          const gw = gateWorld.get(gateId);
          if (!gw) return null;
          const zoneId = gateZone(gateId);
          const isActive = activeTargets.has(gateId) || activeTargets.has(zoneId ?? '');
          const isDone = completedTargets.has(gateId) || completedTargets.has(zoneId ?? '');
          const isFocused = selectedGateId === gateId;
          const nodeColor = isActive ? '#5aa9ff' : isDone ? '#3ed598' : pColor(gw.pressure);
          const turnColor = TURN_COLOR[gw.turnState];

          return (
            <g key={gateId}
              onClick={() => onGateClick?.(gateId)}
              onMouseEnter={() => setHoveredGate(gateId)}
              onMouseLeave={() => setHoveredGate(null)}
              style={{ cursor: 'pointer', opacity: selectedGateId && selectedGateId !== gateId ? 0.35 : 1, transition: 'opacity .4s cubic-bezier(.23,1,.32,1)' }}>

              {/* Focus ring */}
              {isFocused && (
                <circle cx={pos.x} cy={pos.y} r={32} fill="none" stroke={nodeColor} strokeWidth="1" strokeDasharray="3 3" opacity="0.5">
                  <animateTransform attributeName="transform" type="rotate" from={`0 ${pos.x} ${pos.y}`} to={`360 ${pos.x} ${pos.y}`} dur="12s" repeatCount="indefinite" />
                </circle>
              )}
              {isActive && (
                <circle cx={pos.x} cy={pos.y} r={28} fill="none" stroke="#5aa9ff" strokeWidth="1" strokeDasharray="4 4" opacity="0.4">
                  <animateTransform attributeName="transform" type="rotate" from={`0 ${pos.x} ${pos.y}`} to={`360 ${pos.x} ${pos.y}`} dur="8s" repeatCount="indefinite" />
                </circle>
              )}

              {/* Gate circle */}
              <circle cx={pos.x} cy={pos.y} r={22} fill="#080c14" stroke={nodeColor} strokeWidth={isFocused ? 2.5 : 1.5} />

              {/* Turnaround state ring (outer) */}
              {gw.turnState !== 'empty' && (
                <circle cx={pos.x} cy={pos.y} r={22} fill="none" stroke={turnColor} strokeWidth="2" strokeDasharray={`${Math.PI * 44 * 0.75} ${Math.PI * 44 * 0.25}`} strokeDashoffset={Math.PI * 44 * 0.125} opacity="0.3" />
              )}

              {/* Aircraft marker */}
              {gw.hasAircraft && (
                <use href="#aircraft" x={pos.x - 6} y={pos.y - 30} width="12" height="12" color={turnColor} opacity="0.5" />
              )}

              {/* Gate letter */}
              <text x={pos.x} y={pos.y + 1} textAnchor="middle" dominantBaseline="middle" fill={nodeColor} fontSize="14" fontWeight="700" fontFamily="'JetBrains Mono', monospace">{gateId.replace('52', '')}</text>

              {/* Flight number + carrier */}
              {(() => {
                const fw = flightWorld?.get(gateId);
                if (!fw) return (
                  <text x={pos.x} y={pos.y + 34} textAnchor="middle" fill={turnColor} fontSize="6" letterSpacing="0.14em" fontFamily="'JetBrains Mono', monospace" opacity="0.5">{TURN_LABEL[gw.turnState]}</text>
                );
                const riskColor = fw.departureRisk === 'CRITICAL' ? '#ff5c5c' : fw.departureRisk === 'HIGH' ? '#f5b13d' : fw.departureRisk === 'MEDIUM' ? '#d4a04a' : 'rgba(255,255,255,.25)';
                const depLabel = fw.isOverdue ? `+${Math.abs(fw.minutesToDeparture)}m` : fw.minutesToDeparture <= 0 ? 'NOW' : `${fw.minutesToDeparture}m`;
                return (
                  <>
                    {/* Flight ID */}
                    <text x={pos.x} y={pos.y + 34} textAnchor="middle" fill="rgba(255,255,255,.35)" fontSize="8" fontWeight="600" fontFamily="'JetBrains Mono', monospace">{fw.flightNumber}</text>
                    {/* Departure timer + risk */}
                    <text x={pos.x} y={pos.y + 45} textAnchor="middle" fill={riskColor} fontSize="7" fontWeight="600" fontFamily="'JetBrains Mono', monospace" letterSpacing="0.06em">
                      {depLabel}{fw.departureRisk !== 'LOW' ? ` · ${fw.departureRisk}` : ''}
                    </text>
                  </>
                );
              })()}

              {/* Staffing dots */}
              {gw.staffingLevel > 0 && (
                <g>
                  {Array.from({ length: gw.staffingLevel }).map((_, si) => (
                    <circle key={si} cx={pos.x - 8 + si * 6} cy={pos.y + 54} r={2} fill="#5aa9ff" opacity="0.35" />
                  ))}
                </g>
              )}

              {/* Equipment failure */}
              {gw.hasEquipmentFailure && (
                <g>
                  <rect x={pos.x + 16} y={pos.y + 8} width={12} height={12} rx={1} fill="#f5b13d" fillOpacity="0.15" stroke="#f5b13d" strokeWidth="0.5" opacity="0.7" />
                  <text x={pos.x + 22} y={pos.y + 16} textAnchor="middle" dominantBaseline="middle" fill="#f5b13d" fontSize="8" fontFamily="'JetBrains Mono', monospace">⚡</text>
                </g>
              )}

              {/* Incident badge */}
              {gw.incidents > 0 && (
                <g>
                  <circle cx={pos.x + 20} cy={pos.y - 18} r={9} fill={gw.criticalCount > 0 ? '#ff5c5c' : gw.highCount > 0 ? '#f5b13d' : '#5aa9ff'} fillOpacity={0.85}>
                    {gw.criticalCount > 0 && <animate attributeName="r" values="9;11;9" dur="2s" repeatCount="indefinite" />}
                  </circle>
                  <text x={pos.x + 20} y={pos.y - 18} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize="8" fontWeight="700" fontFamily="'JetBrains Mono', monospace">{gw.incidents}</text>
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
          return <text key={`lbl-${zoneId}`} x={cx} y={minY - 38} textAnchor="middle" fill="#303848" fontSize="8" letterSpacing="0.16em" fontFamily="'JetBrains Mono', monospace">{za?.zoneLabel?.toUpperCase() ?? zoneId}</text>;
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
              <text x={maxX+77} y={minY+2} textAnchor="middle" dominantBaseline="middle" fill={c} fontSize="8" fontWeight="700" letterSpacing="0.12em" fontFamily="'JetBrains Mono', monospace">{worst.stability.toUpperCase()}</text>
              {worst.pressure >= 80 && <rect x={maxX+35} y={minY-12} width={84} height={24} rx={2} fill="none" stroke={c} strokeWidth={0.5}><animate attributeName="opacity" values="0.2;0.5;0.2" dur="2s" repeatCount="indefinite" /></rect>}
            </g>
          );
        })()}

        {/* Hover context card */}
        {hovered && hoveredPos && (() => {
          const fw = flightWorld?.get(hovered.gateId);
          const cx = hoveredPos.x + 30;
          const cy = hoveredPos.y - 55;
          const riskColor = fw?.departureRisk === 'CRITICAL' ? '#ff5c5c' : fw?.departureRisk === 'HIGH' ? '#f5b13d' : 'rgba(255,255,255,.3)';
          return (
            <g style={{ pointerEvents: 'none' }}>
              <rect x={cx} y={cy} width={150} height={fw ? 95 : 80} rx={3} fill="#0a0e16" fillOpacity="0.96" stroke="rgba(255,255,255,.07)" strokeWidth="1" />
              {/* Gate + flight */}
              <text x={cx + 8} y={cy + 14} fill={pColor(hovered.pressure)} fontSize="10" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
                {hovered.gateId}{fw ? ` · ${fw.flightNumber}` : ''}
              </text>
              {fw && (
                <text x={cx + 8} y={cy + 26} fill="rgba(255,255,255,.25)" fontSize="7" fontFamily="'JetBrains Mono', monospace">{fw.aircraft} · {fw.route}</text>
              )}
              {/* Status */}
              <text x={cx + 8} y={cy + (fw ? 40 : 28)} fill="#6b7585" fontSize="7" fontFamily="'JetBrains Mono', monospace" letterSpacing="0.08em">
                {TURN_LABEL[hovered.turnState]} · P{hovered.pressure}
                {fw ? ` · ${fw.minutesToDeparture}m to dep` : ''}
              </text>
              {/* Risk */}
              {fw && fw.departureRisk !== 'LOW' && (
                <text x={cx + 8} y={cy + 52} fill={riskColor} fontSize="7" fontWeight="600" fontFamily="'JetBrains Mono', monospace">
                  Departure Risk: {fw.departureRisk}
                </text>
              )}
              {/* Incidents */}
              <text x={cx + 8} y={cy + (fw ? 64 : 42)} fill="rgba(255,255,255,.25)" fontSize="7" fontFamily="'JetBrains Mono', monospace">
                {hovered.incidents > 0 ? `${hovered.incidents} incident${hovered.incidents > 1 ? 's' : ''}` : 'No incidents'}
                {hovered.activeRecoveries > 0 ? ` · ${hovered.activeRecoveries} rcvry` : ''}
              </text>
              {/* Equipment + crew */}
              <text x={cx + 8} y={cy + (fw ? 76 : 56)} fill="rgba(255,255,255,.2)" fontSize="7" fontFamily="'JetBrains Mono', monospace">
                {hovered.hasEquipmentFailure ? 'Equip issue' : hovered.equipmentIds.length > 0 ? `${hovered.equipmentIds.length} equip` : ''}
                {hovered.staffingLevel > 0 ? ` · ${hovered.staffingLevel} crew` : ' · No crew'}
              </text>
              {fw && fw.riskFactors.length > 0 && (
                <text x={cx + 8} y={cy + 88} fill="rgba(255,255,255,.15)" fontSize="6" fontFamily="'JetBrains Mono', monospace">
                  {fw.riskFactors[0]}
                </text>
              )}
            </g>
          );
        })()}

        {/* Coordinates */}
        <text x="30" y="582" fill="#1c2230" fontSize="7" fontFamily="'JetBrains Mono', monospace" letterSpacing="0.1em">LAX T5 RAMP</text>
        <text x="970" y="582" fill="#1c2230" fontSize="7" fontFamily="'JetBrains Mono', monospace" letterSpacing="0.1em" textAnchor="end">52A–I</text>
      </svg>
    </div>
  );
}
