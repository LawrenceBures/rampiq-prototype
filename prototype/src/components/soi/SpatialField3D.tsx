'use client';

/**
 * SOI 3D Spatial Command Layer v2 — Immersive
 *
 * Premium isometric 3D with:
 * - Smooth pressure transitions (useFrame lerp)
 * - Hover context cards
 * - Recovery trace animation
 * - Atmospheric depth via fog + gradient ground
 * - Subtle camera drift
 * - Gate focus choreography
 */

import { useRef, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrthographicCamera, Line, Text, Html } from '@react-three/drei';
import * as THREE from 'three';
import type { OperationalAssessment, ZoneAssessment } from '@/lib/soi-intelligence/operational-reasoning';
import type { FlightWorld } from '@/lib/soi-context/flight-context';
import type { LiveExecutionState } from '@/lib/soi-execution/live-execution-engine';
import type { ExecutionPlan } from '@/lib/soi-agentic/execution-planner';

interface Props {
  assessment: OperationalAssessment;
  flightWorld?: Map<string, FlightWorld>;
  selectedGateId?: string | null;
  selectedZoneId?: string | null;
  liveExec?: LiveExecutionState | null;
  activePlan?: ExecutionPlan | null;
  onGateClick?: (gateId: string) => void;
}

// ============================================================
// CONSTANTS
// ============================================================

const GATE_3D: Record<string, [number, number]> = {
  '52A': [-3, -2], '52B': [0, -2.5], '52C': [3, -2],
  '52D': [-2.5, 0], '52E': [0.5, 0], '52F': [3.5, 0],
  '52G': [-2, 2.5], '52H': [1.5, 2], '52I': [4.5, 2.5],
};

const ZONE_GATES_3D: Record<string, string[]> = {
  'GATES-52ABC': ['52A', '52B', '52C'],
  'GATES-52DEF': ['52D', '52E', '52F'],
  'GATES-52GHI': ['52G', '52H', '52I'],
};

const TAXIWAYS_3D: Array<[string, string]> = [
  ['52A', '52B'], ['52B', '52C'], ['52D', '52E'], ['52E', '52F'],
  ['52G', '52H'], ['52H', '52I'], ['52B', '52E'], ['52E', '52H'],
  ['52A', '52D'], ['52D', '52G'], ['52C', '52F'], ['52F', '52I'],
];

function pColorHex(p: number): string {
  if (p >= 80) return '#ff5c5c';
  if (p >= 55) return '#f5b13d';
  if (p >= 30) return '#d4a04a';
  return '#2a9d6a';
}

function gateZone(gateId: string): string | undefined {
  for (const [zone, gates] of Object.entries(ZONE_GATES_3D)) {
    if (gates.includes(gateId)) return zone;
  }
  return undefined;
}

// ============================================================
// ANIMATED GATE NODE (smooth pressure transitions)
// ============================================================

function GateNode({ gateId, pos, pressure, incidents, isFocused, isHovered, flightNumber, departureRisk, fw, onClick, onHover }: {
  gateId: string; pos: [number, number]; pressure: number; incidents: number;
  isFocused: boolean; isHovered: boolean; flightNumber?: string; departureRisk?: string;
  fw?: FlightWorld; onClick: () => void; onHover: (h: boolean) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const columnRef = useRef<THREE.Mesh>(null);
  const capRef = useRef<THREE.Mesh>(null);
  const targetHeight = useRef(0.1);
  const currentHeight = useRef(0.1);

  targetHeight.current = 0.1 + (pressure / 100) * 1.2;
  const color = pColorHex(pressure);
  const dimmed = !isFocused;
  const baseOpacity = dimmed ? 0.08 : pressure >= 50 ? 0.28 : pressure >= 20 ? 0.14 : 0.04;
  const capOpacity = dimmed ? 0.12 : isHovered ? 0.8 : 0.55;

  // Smooth height interpolation
  useFrame(() => {
    const h = currentHeight.current;
    const t = targetHeight.current;
    currentHeight.current = h + (t - h) * 0.06; // lerp
    const ch = currentHeight.current;
    if (columnRef.current) {
      columnRef.current.scale.y = ch / 0.5; // normalized
      columnRef.current.position.y = ch / 2;
    }
    if (capRef.current) {
      capRef.current.position.y = ch;
    }
  });

  return (
    <group ref={groupRef} position={[pos[0], 0, pos[1]]}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
    >
      {/* Base platform */}
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[0.7, 0.04, 0.7]} />
        <meshBasicMaterial color={isHovered ? '#141c28' : '#0a0e16'} transparent opacity={dimmed ? 0.25 : 0.7} />
      </mesh>

      {/* Pressure column (animated via useFrame) */}
      <mesh ref={columnRef} position={[0, 0.25, 0]}>
        <boxGeometry args={[0.45, 0.5, 0.45]} />
        <meshBasicMaterial color={color} transparent opacity={baseOpacity} />
      </mesh>

      {/* Top cap (animated position via useFrame) */}
      <mesh ref={capRef} position={[0, 0.5, 0]}>
        <boxGeometry args={[0.5, 0.025, 0.5]} />
        <meshBasicMaterial color={color} transparent opacity={capOpacity} />
      </mesh>

      {/* Hover glow ring */}
      {isHovered && (
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.4, 0.5, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.15} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Incident marker */}
      {incidents > 0 && !dimmed && (
        <mesh position={[0.3, targetHeight.current + 0.15, 0.3]}>
          <sphereGeometry args={[0.07, 8, 8]} />
          <meshBasicMaterial color={pressure >= 80 ? '#ff5c5c' : '#f5b13d'} />
        </mesh>
      )}

      {/* Gate label */}
      <Text position={[0, targetHeight.current + 0.1, 0]} fontSize={0.16}
        color={dimmed ? '#2a2a2a' : color} anchorX="center" anchorY="bottom">
        {gateId.replace('52', '')}
      </Text>

      {/* Flight number */}
      {flightNumber && !dimmed && (
        <Text position={[0, -0.12, 0]} fontSize={0.09}
          color={dimmed ? '#1a1a1a' : '#ffffff40'} anchorX="center" anchorY="top">
          {flightNumber}
        </Text>
      )}

      {/* Hover card (HTML overlay) */}
      {isHovered && fw && (
        <Html position={[0.8, targetHeight.current + 0.3, 0]} center={false}
          style={{ pointerEvents: 'none', width: 150 }}>
          <div style={{
            background: 'rgba(8,12,20,.95)', border: '1px solid rgba(255,255,255,.08)',
            padding: '8px 10px', fontFamily: "'JetBrains Mono', monospace",
            borderRadius: 3, backdropFilter: 'blur(4px)',
          }}>
            <div style={{ color: color, fontSize: 10, fontWeight: 700, marginBottom: 3 }}>
              {gateId} · {fw.flightNumber}
            </div>
            <div style={{ color: '#6b7585', fontSize: 7, marginBottom: 2 }}>{fw.aircraft} · {fw.route}</div>
            <div style={{ color: '#5aa9ff', fontSize: 7, marginBottom: 2 }}>
              {fw.minutesToDeparture}m to dep · {fw.departureRisk}
            </div>
            <div style={{ color: 'rgba(255,255,255,.25)', fontSize: 7 }}>
              {incidents > 0 ? `${incidents} incident${incidents > 1 ? 's' : ''}` : 'No incidents'}
              {fw.hasActiveRecovery ? ' · Recovery active' : ''}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

// ============================================================
// RECOVERY TRACE (animated dot along path)
// ============================================================

function RecoveryTrace({ target }: { target: [number, number] }) {
  const dotRef = useRef<THREE.Mesh>(null);
  const progress = useRef(0);

  useFrame((_, delta) => {
    progress.current = (progress.current + delta * 0.4) % 1;
    if (dotRef.current) {
      const src = new THREE.Vector3(0, 0.05, 3.5);
      const dst = new THREE.Vector3(target[0], 0.05, target[1]);
      dotRef.current.position.lerpVectors(src, dst, progress.current);
    }
  });

  const linePoints = useMemo(() => [
    new THREE.Vector3(0, 0.03, 3.5),
    new THREE.Vector3(target[0], 0.03, target[1]),
  ], [target]);

  return (
    <>
      <Line points={linePoints} color="#5aa9ff" lineWidth={0.8} transparent opacity={0.2} dashed dashSize={0.2} gapSize={0.15} />
      <mesh ref={dotRef}>
        <sphereGeometry args={[0.04, 6, 6]} />
        <meshBasicMaterial color="#5aa9ff" transparent opacity={0.7} />
      </mesh>
    </>
  );
}

// ============================================================
// SUBTLE CAMERA DRIFT
// ============================================================

function CameraDrift() {
  useFrame(({ camera, clock }) => {
    const t = clock.getElapsedTime();
    camera.position.x = 8 + Math.sin(t * 0.05) * 0.15;
    camera.position.z = 8 + Math.cos(t * 0.07) * 0.1;
  });
  return null;
}

// ============================================================
// GRID + ATMOSPHERE
// ============================================================

function AtmosphericGrid() {
  const lines = useMemo(() => {
    const arr: THREE.Vector3[][] = [];
    for (let x = -6; x <= 7; x += 1) arr.push([new THREE.Vector3(x, 0, -4), new THREE.Vector3(x, 0, 4)]);
    for (let z = -4; z <= 4; z += 1) arr.push([new THREE.Vector3(-6, 0, z), new THREE.Vector3(7, 0, z)]);
    return arr;
  }, []);

  return (
    <>
      {lines.map((pts, i) => (
        <Line key={i} points={pts} color="#0c1320" lineWidth={0.3} transparent opacity={0.25} />
      ))}
      {/* Ground plane for depth */}
      <mesh position={[0.5, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[16, 10]} />
        <meshBasicMaterial color="#050810" transparent opacity={0.95} side={THREE.DoubleSide} />
      </mesh>
    </>
  );
}

// ============================================================
// MAIN
// ============================================================

export function SpatialField3D({ assessment, flightWorld, selectedGateId, selectedZoneId, liveExec, activePlan, onGateClick }: Props) {
  const [hoveredGate, setHoveredGate] = useState<string | null>(null);
  const zoneMap = new Map<string, ZoneAssessment>();
  for (const za of assessment.zoneAssessments) zoneMap.set(za.zoneId, za);

  const hasSelection = selectedGateId != null;

  // Recovery targets
  const activeStepTargets: [number, number][] = [];
  if (liveExec && activePlan) {
    for (let i = 0; i < activePlan.steps.length; i++) {
      const ph = liveExec.steps[i]?.phase;
      if (ph === 'active' || ph === 'dispatched' || ph === 'acknowledged') {
        const pos = GATE_3D[activePlan.steps[i].target];
        if (pos) activeStepTargets.push(pos);
      }
    }
  }

  return (
    <div className="mc-spatial" style={{ background: '#040810' }}>
      <Canvas gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }} style={{ background: '#040810' }}>
        <OrthographicCamera makeDefault position={[8, 10, 8]} zoom={65} near={0.1} far={100} />
        <CameraDrift />

        <ambientLight intensity={0.7} />
        {/* Soft directional for subtle depth cues */}
        <directionalLight position={[5, 8, 3]} intensity={0.15} color="#8899cc" />

        {/* Atmospheric fog */}
        <fog attach="fog" args={['#040810', 12, 22]} />

        <AtmosphericGrid />

        {/* Zone platforms */}
        {Object.entries(ZONE_GATES_3D).map(([zoneId, gates]) => {
          const za = zoneMap.get(zoneId);
          const positions = gates.map(g => GATE_3D[g]).filter(Boolean);
          if (positions.length < 2) return null;
          const cx = positions.reduce((s, p) => s + p[0], 0) / positions.length;
          const cz = positions.reduce((s, p) => s + p[1], 0) / positions.length;
          const pressure = za?.pressure ?? 0;
          const isSel = selectedZoneId === zoneId;
          return (
            <mesh key={zoneId} position={[cx, -0.01, cz]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[4.5, 3.5]} />
              <meshBasicMaterial color={pColorHex(pressure)} transparent opacity={isSel ? 0.05 : 0.015} side={THREE.DoubleSide} />
            </mesh>
          );
        })}

        {/* Taxiways */}
        {TAXIWAYS_3D.map(([from, to], i) => {
          const p1 = GATE_3D[from], p2 = GATE_3D[to];
          if (!p1 || !p2) return null;
          const z1 = gateZone(from), z2 = gateZone(to);
          const za1 = z1 ? zoneMap.get(z1) : null, za2 = z2 ? zoneMap.get(z2) : null;
          const cascade = !!(z1 && z2 && z1 !== z2 && za1 && za2 && za1.pressure >= 50 && za2.pressure >= 50);
          const pts = [new THREE.Vector3(p1[0], 0.01, p1[1]), new THREE.Vector3(p2[0], 0.01, p2[1])];
          return (
            <Line key={i} points={pts} color={cascade ? '#f5b13d' : '#111828'}
              lineWidth={cascade ? 1.2 : 0.4} transparent opacity={cascade ? 0.35 : 0.12}
              dashed={cascade} dashSize={0.3} gapSize={0.2} />
          );
        })}

        {/* Recovery traces */}
        {activeStepTargets.map((t, i) => <RecoveryTrace key={i} target={t} />)}

        {/* Gate nodes */}
        {Object.entries(GATE_3D).map(([gateId, pos]) => {
          const zoneId = gateZone(gateId);
          const za = zoneId ? zoneMap.get(zoneId) : null;
          const pressure = za?.pressure ?? 0;
          const incidents = za ? Math.ceil(za.unresolvedCount / 3) : 0;
          const fw = flightWorld?.get(gateId);
          const focused = !!(hasSelection ? selectedGateId === gateId : true);
          const hovered = hoveredGate === gateId;

          return (
            <GateNode key={gateId} gateId={gateId} pos={pos} pressure={pressure} incidents={incidents}
              isFocused={focused} isHovered={hovered} flightNumber={fw?.flightNumber}
              departureRisk={fw?.departureRisk} fw={fw ?? undefined}
              onClick={() => onGateClick?.(gateId)}
              onHover={h => setHoveredGate(h ? gateId : null)} />
          );
        })}
      </Canvas>
    </div>
  );
}
