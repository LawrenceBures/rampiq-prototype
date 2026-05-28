'use client';

/**
 * SOI 3D Spatial Command Layer
 *
 * Premium isometric 3D view of gate operations using React Three Fiber.
 * Data-bound to the same operational state as the 2D SVG field.
 * Restrained command-center aesthetic. Not a game.
 */

import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrthographicCamera, Line, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { OperationalAssessment, ZoneAssessment } from '@/lib/soi-intelligence/operational-reasoning';
import type { FlightWorld } from '@/lib/soi-context/flight-context';

// ============================================================
// TYPES
// ============================================================

interface Props {
  assessment: OperationalAssessment;
  flightWorld?: Map<string, FlightWorld>;
  selectedGateId?: string | null;
  selectedZoneId?: string | null;
  onGateClick?: (gateId: string) => void;
}

// ============================================================
// CONSTANTS
// ============================================================

// Gate positions in 3D space (x, z) — y is vertical
const GATE_3D: Record<string, [number, number]> = {
  '52A': [-3, -2],  '52B': [0, -2.5], '52C': [3, -2],
  '52D': [-2.5, 0], '52E': [0.5, 0],  '52F': [3.5, 0],
  '52G': [-2, 2.5], '52H': [1.5, 2],  '52I': [4.5, 2.5],
};

const ZONE_GATES_3D: Record<string, string[]> = {
  'GATES-52ABC': ['52A', '52B', '52C'],
  'GATES-52DEF': ['52D', '52E', '52F'],
  'GATES-52GHI': ['52G', '52H', '52I'],
};

const TAXIWAYS_3D: Array<[string, string]> = [
  ['52A', '52B'], ['52B', '52C'],
  ['52D', '52E'], ['52E', '52F'],
  ['52G', '52H'], ['52H', '52I'],
  ['52B', '52E'], ['52E', '52H'],
  ['52A', '52D'], ['52D', '52G'],
  ['52C', '52F'], ['52F', '52I'],
];

function pColor(p: number): THREE.Color {
  if (p >= 80) return new THREE.Color('#ff5c5c');
  if (p >= 55) return new THREE.Color('#f5b13d');
  if (p >= 30) return new THREE.Color('#d4a04a');
  return new THREE.Color('#2a9d6a');
}

function gateZone(gateId: string): string | undefined {
  for (const [zone, gates] of Object.entries(ZONE_GATES_3D)) {
    if (gates.includes(gateId)) return zone;
  }
  return undefined;
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

function GateNode({ gateId, pos, pressure, incidents, isFocused, flightNumber, departureRisk, onClick }: {
  gateId: string; pos: [number, number]; pressure: number; incidents: number;
  isFocused: boolean; flightNumber?: string; departureRisk?: string; onClick: () => void;
}) {
  const color = pColor(pressure);
  const height = 0.1 + (pressure / 100) * 1.2; // pressure column height
  const glowOpacity = pressure >= 50 ? 0.3 : pressure >= 20 ? 0.15 : 0.05;
  const dimmed = isFocused === false; // null means no selection

  return (
    <group position={[pos[0], 0, pos[1]]} onClick={(e) => { e.stopPropagation(); onClick(); }}>
      {/* Base platform */}
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[0.7, 0.04, 0.7]} />
        <meshBasicMaterial color="#0a0e16" transparent opacity={dimmed ? 0.3 : 0.8} />
      </mesh>

      {/* Pressure column */}
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[0.5, height, 0.5]} />
        <meshBasicMaterial color={color} transparent opacity={dimmed ? 0.1 : glowOpacity} />
      </mesh>

      {/* Top cap — brighter */}
      <mesh position={[0, height, 0]}>
        <boxGeometry args={[0.55, 0.03, 0.55]} />
        <meshBasicMaterial color={color} transparent opacity={dimmed ? 0.15 : 0.6} />
      </mesh>

      {/* Incident marker */}
      {incidents > 0 && (
        <mesh position={[0.3, height + 0.15, 0.3]}>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshBasicMaterial color={pressure >= 80 ? '#ff5c5c' : '#f5b13d'} />
        </mesh>
      )}

      {/* Gate label */}
      <Text
        position={[0, height + 0.12, 0]}
        fontSize={0.18}
        color={dimmed ? '#333' : color.getStyle()}
        anchorX="center"
        anchorY="bottom"
        font="/fonts/JetBrainsMono-Bold.woff"
        characters="ABCDEFGHI0123456789"
      >
        {gateId.replace('52', '')}
      </Text>

      {/* Flight number */}
      {flightNumber && (
        <Text
          position={[0, -0.15, 0]}
          fontSize={0.1}
          color={dimmed ? '#222' : 'rgba(255,255,255,0.3)'}
          anchorX="center"
          anchorY="top"
          font="/fonts/JetBrainsMono-Bold.woff"
          characters="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        >
          {flightNumber}
        </Text>
      )}
    </group>
  );
}

function ZonePlatform({ zoneId, gates, pressure, isSelected }: {
  zoneId: string; gates: string[]; pressure: number; isSelected: boolean;
}) {
  const positions = gates.map(g => GATE_3D[g]).filter(Boolean);
  if (positions.length < 2) return null;

  const cx = positions.reduce((s, p) => s + p[0], 0) / positions.length;
  const cz = positions.reduce((s, p) => s + p[1], 0) / positions.length;
  const color = pColor(pressure);

  return (
    <mesh position={[cx, -0.01, cz]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[4.5, 3.5]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={isSelected ? 0.06 : 0.02}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function TaxiwayLine({ from, to, cascadeActive }: {
  from: [number, number]; to: [number, number]; cascadeActive: boolean;
}) {
  const points = useMemo(() => [
    new THREE.Vector3(from[0], 0.01, from[1]),
    new THREE.Vector3(to[0], 0.01, to[1]),
  ], [from, to]);

  return (
    <Line
      points={points}
      color={cascadeActive ? '#f5b13d' : '#1a2030'}
      lineWidth={cascadeActive ? 1.5 : 0.5}
      transparent
      opacity={cascadeActive ? 0.4 : 0.15}
      dashed={cascadeActive}
      dashSize={0.3}
      gapSize={0.2}
    />
  );
}

function GridFloor() {
  const lines = useMemo(() => {
    const arr: THREE.Vector3[][] = [];
    for (let x = -6; x <= 7; x += 1) {
      arr.push([new THREE.Vector3(x, 0, -4), new THREE.Vector3(x, 0, 4)]);
    }
    for (let z = -4; z <= 4; z += 1) {
      arr.push([new THREE.Vector3(-6, 0, z), new THREE.Vector3(7, 0, z)]);
    }
    return arr;
  }, []);

  return (
    <>
      {lines.map((pts, i) => (
        <Line key={i} points={pts} color="#0e1420" lineWidth={0.3} transparent opacity={0.3} />
      ))}
    </>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function SpatialField3D({ assessment, flightWorld, selectedGateId, selectedZoneId, onGateClick }: Props) {
  const zoneMap = new Map<string, ZoneAssessment>();
  for (const za of assessment.zoneAssessments) zoneMap.set(za.zoneId, za);

  const hasSelection = selectedGateId !== null && selectedGateId !== undefined;

  return (
    <div className="mc-spatial" style={{ background: '#050910' }}>
      <Canvas gl={{ antialias: true, alpha: false }} style={{ background: '#050910' }}>
        <OrthographicCamera makeDefault position={[8, 10, 8]} zoom={65} near={0.1} far={100} />

        {/* Ambient light only — no shadows */}
        <ambientLight intensity={0.8} />

        <GridFloor />

        {/* Zone platforms */}
        {Object.entries(ZONE_GATES_3D).map(([zoneId, gates]) => {
          const za = zoneMap.get(zoneId);
          return (
            <ZonePlatform
              key={zoneId}
              zoneId={zoneId}
              gates={gates}
              pressure={za?.pressure ?? 0}
              isSelected={selectedZoneId === zoneId}
            />
          );
        })}

        {/* Taxiways */}
        {TAXIWAYS_3D.map(([from, to], i) => {
          const p1 = GATE_3D[from];
          const p2 = GATE_3D[to];
          if (!p1 || !p2) return null;
          const z1 = gateZone(from);
          const z2 = gateZone(to);
          const za1 = z1 ? zoneMap.get(z1) : null;
          const za2 = z2 ? zoneMap.get(z2) : null;
          const cascade = !!(z1 && z2 && z1 !== z2 && za1 && za2 && za1.pressure >= 50 && za2.pressure >= 50);
          return <TaxiwayLine key={i} from={p1} to={p2} cascadeActive={cascade} />;
        })}

        {/* Gate nodes */}
        {Object.entries(GATE_3D).map(([gateId, pos]) => {
          const zoneId = gateZone(gateId);
          const za = zoneId ? zoneMap.get(zoneId) : null;
          const pressure = za?.pressure ?? 0;
          const incidents = za ? Math.ceil(za.unresolvedCount / 3) : 0;
          const fw = flightWorld?.get(gateId);
          const isFocused = !!(hasSelection ? selectedGateId === gateId : true);

          return (
            <GateNode
              key={gateId}
              gateId={gateId}
              pos={pos}
              pressure={pressure}
              incidents={incidents}
              isFocused={isFocused}
              flightNumber={fw?.flightNumber}
              departureRisk={fw?.departureRisk}
              onClick={() => onGateClick?.(gateId)}
            />
          );
        })}
      </Canvas>
    </div>
  );
}
