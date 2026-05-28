'use client';

/**
 * SOI 3D Airport Scene
 *
 * Procedural Three.js airport with terminal, gates, aircraft,
 * jetbridges, taxiway, and ground equipment. No external models.
 * Data-bound to live operational state.
 */

import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';
import type { OperationalAssessment } from '@/lib/soi-intelligence/operational-reasoning';
import type { FlightWorld } from '@/lib/soi-context/flight-context';

interface Props {
  assessment: OperationalAssessment;
  flightWorld?: Map<string, FlightWorld>;
  selectedGateId?: string | null;
  onGateClick?: (gateId: string) => void;
}

// Gate positions along the terminal (x position, side: 1=top, -1=bottom)
const GATES: Array<{ id: string; x: number; side: number }> = [
  { id: '52A', x: -6, side: 1 },
  { id: '52B', x: -4, side: 1 },
  { id: '52C', x: -2, side: 1 },
  { id: '52D', x: 0, side: -1 },
  { id: '52E', x: 2, side: -1 },
  { id: '52F', x: 4, side: -1 },
  { id: '52G', x: 6, side: 1 },
  { id: '52H', x: 8, side: 1 },
  { id: '52I', x: 10, side: 1 },
];

function gateZone(gateId: string): string | undefined {
  if (['52A', '52B', '52C'].includes(gateId)) return 'GATES-52ABC';
  if (['52D', '52E', '52F'].includes(gateId)) return 'GATES-52DEF';
  if (['52G', '52H', '52I'].includes(gateId)) return 'GATES-52GHI';
  return undefined;
}

function pressureColor(p: number): string {
  if (p >= 80) return '#ff5564';
  if (p >= 60) return '#ff7d4d';
  if (p >= 40) return '#f3b13c';
  return '#52d6e6';
}

// ============================================================
// AIRCRAFT — procedural fuselage + wings + tail
// ============================================================

function Aircraft({ position, rotation, color, delayed }: {
  position: [number, number, number];
  rotation: [number, number, number];
  color: string;
  delayed: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);

  // Subtle idle bob for delayed aircraft
  useFrame(({ clock }) => {
    if (groupRef.current && delayed) {
      groupRef.current.position.y = position[1] + Math.sin(clock.getElapsedTime() * 1.5) * 0.02;
    }
  });

  return (
    <group ref={groupRef} position={position} rotation={rotation}>
      {/* Fuselage */}
      <mesh>
        <cylinderGeometry args={[0.12, 0.12, 1.4, 8]} />
        <meshBasicMaterial color="#c8d0da" />
      </mesh>
      {/* Nose cone */}
      <mesh position={[0, 0.75, 0]}>
        <coneGeometry args={[0.12, 0.3, 8]} />
        <meshBasicMaterial color="#b0b8c4" />
      </mesh>
      {/* Wings */}
      <mesh position={[0, -0.1, 0]} rotation={[0, 0, Math.PI / 2]}>
        <boxGeometry args={[0.04, 1.6, 0.5]} />
        <meshBasicMaterial color="#a8b2be" />
      </mesh>
      {/* Tail vertical stabilizer */}
      <mesh position={[0, -0.6, 0.15]}>
        <boxGeometry args={[0.03, 0.35, 0.25]} />
        <meshBasicMaterial color="#a8b2be" />
      </mesh>
      {/* Tail horizontal stabilizer */}
      <mesh position={[0, -0.65, 0]} rotation={[0, 0, Math.PI / 2]}>
        <boxGeometry args={[0.03, 0.5, 0.12]} />
        <meshBasicMaterial color="#a0aab6" />
      </mesh>
      {/* Engine pods */}
      <mesh position={[0.35, -0.15, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.25, 6]} />
        <meshBasicMaterial color="#8892a0" />
      </mesh>
      <mesh position={[-0.35, -0.15, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.25, 6]} />
        <meshBasicMaterial color="#8892a0" />
      </mesh>
      {/* Status light — pressure color */}
      <mesh position={[0, 0.9, 0]}>
        <sphereGeometry args={[0.04, 6, 6]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

// ============================================================
// TERMINAL BUILDING
// ============================================================

function Terminal() {
  return (
    <group>
      {/* Main terminal body */}
      <mesh position={[2, 0.4, 0]}>
        <boxGeometry args={[18, 0.8, 1.2]} />
        <meshBasicMaterial color="#0c1018" />
      </mesh>
      {/* Terminal roof accent */}
      <mesh position={[2, 0.82, 0]}>
        <boxGeometry args={[18.1, 0.04, 1.3]} />
        <meshBasicMaterial color="#1a2030" />
      </mesh>
      {/* Window strip */}
      <mesh position={[2, 0.5, 0.61]}>
        <boxGeometry args={[17.8, 0.3, 0.01]} />
        <meshBasicMaterial color="rgba(82,214,230,0.06)" transparent opacity={0.15} />
      </mesh>
      <mesh position={[2, 0.5, -0.61]}>
        <boxGeometry args={[17.8, 0.3, 0.01]} />
        <meshBasicMaterial color="rgba(82,214,230,0.06)" transparent opacity={0.15} />
      </mesh>
    </group>
  );
}

// ============================================================
// GATE BAY — jetbridge + apron pad
// ============================================================

function GateBay({ gateId, x, side, pressure, hasAircraft, flightDelayed, selected, onClick }: {
  gateId: string; x: number; side: number; pressure: number;
  hasAircraft: boolean; flightDelayed: boolean; selected: boolean;
  onClick: () => void;
}) {
  const color = pressureColor(pressure);
  const z = side * 2.2;
  const bridgeZ = side * 1.1;

  return (
    <group onClick={(e) => { e.stopPropagation(); onClick(); }}>
      {/* Apron pad */}
      <mesh position={[x, 0.01, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.6, 2]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={selected ? 0.12 : pressure > 30 ? 0.04 : 0.02}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Apron boundary lines */}
      <mesh position={[x - 0.8, 0.02, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.02, 2]} />
        <meshBasicMaterial color={color} transparent opacity={0.2} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[x + 0.8, 0.02, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.02, 2]} />
        <meshBasicMaterial color={color} transparent opacity={0.2} side={THREE.DoubleSide} />
      </mesh>

      {/* Jetbridge */}
      <mesh position={[x, 0.35, bridgeZ]}>
        <boxGeometry args={[0.15, 0.2, side * 1.0]} />
        <meshBasicMaterial color="#141c28" />
      </mesh>
      {/* Jetbridge connection head */}
      <mesh position={[x, 0.35, z - side * 0.4]}>
        <boxGeometry args={[0.3, 0.25, 0.15]} />
        <meshBasicMaterial color="#1a2434" />
      </mesh>

      {/* Gate number marker */}
      <mesh position={[x, 0.85, side * 0.7]}>
        <boxGeometry args={[0.3, 0.15, 0.02]} />
        <meshBasicMaterial color={color} transparent opacity={0.6} />
      </mesh>

      {/* Selection ring */}
      {selected && (
        <mesh position={[x, 0.02, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.0, 1.1, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.2} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Aircraft */}
      {hasAircraft && (
        <Aircraft
          position={[x, 0.2, z]}
          rotation={[Math.PI / 2, 0, side > 0 ? 0 : Math.PI]}
          color={color}
          delayed={flightDelayed}
        />
      )}

      {/* Ground service vehicle (if active) */}
      {hasAircraft && pressure > 40 && (
        <mesh position={[x + 0.5, 0.08, z + side * 0.5]}>
          <boxGeometry args={[0.2, 0.12, 0.35]} />
          <meshBasicMaterial color="#f3b13c" transparent opacity={0.5} />
        </mesh>
      )}
    </group>
  );
}

// ============================================================
// TAXIWAY / GROUND
// ============================================================

function Taxiway() {
  return (
    <group>
      {/* Main apron surface */}
      <mesh position={[2, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[22, 8]} />
        <meshBasicMaterial color="#060a10" side={THREE.DoubleSide} />
      </mesh>
      {/* Taxiway center line */}
      <mesh position={[2, 0.005, 3.8]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[20, 0.04]} />
        <meshBasicMaterial color="#f3b13c" transparent opacity={0.15} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[2, 0.005, -3.8]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[20, 0.04]} />
        <meshBasicMaterial color="#f3b13c" transparent opacity={0.15} side={THREE.DoubleSide} />
      </mesh>
      {/* Apron edge markings */}
      {[-7, -3, 1, 5, 9, 13].map((x, i) => (
        <mesh key={i} position={[x, 0.005, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
          <planeGeometry args={[6, 0.02]} />
          <meshBasicMaterial color="#1a2030" transparent opacity={0.3} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

// ============================================================
// SUBTLE CAMERA DRIFT
// ============================================================

function CameraDrift() {
  useFrame(({ camera, clock }) => {
    const t = clock.getElapsedTime();
    camera.position.x = 10 + Math.sin(t * 0.03) * 0.2;
    camera.position.z = 10 + Math.cos(t * 0.04) * 0.15;
  });
  return null;
}

// ============================================================
// MAIN SCENE
// ============================================================

export function AirportScene({ assessment, flightWorld, selectedGateId, onGateClick }: Props) {
  const zoneMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const za of assessment.zoneAssessments) m.set(za.zoneId, za.pressure);
    return m;
  }, [assessment]);

  return (
    <Canvas
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      style={{ width: '100%', height: '100%', background: 'transparent' }}
    >
      <OrthographicCamera makeDefault position={[10, 12, 10]} zoom={48} near={0.1} far={100} />
      <CameraDrift />

      <ambientLight intensity={0.9} />
      <directionalLight position={[8, 15, 5]} intensity={0.25} color="#8899cc" />

      <fog attach="fog" args={['#05070a', 20, 35]} />

      <Taxiway />
      <Terminal />

      {GATES.map(gate => {
        const zoneId = gateZone(gate.id);
        const pressure = zoneId ? (zoneMap.get(zoneId) ?? 0) : 0;
        const fw = flightWorld?.get(gate.id);
        const hasAircraft = fw ? fw.turnPhase !== 'pre_arrival' && (fw.turnPhase as string) !== 'departed' : false;
        const flightDelayed = fw ? fw.departureRisk === 'CRITICAL' || fw.departureRisk === 'HIGH' : false;
        const selected = selectedGateId === gate.id;

        return (
          <GateBay
            key={gate.id}
            gateId={gate.id}
            x={gate.x}
            side={gate.side}
            pressure={pressure}
            hasAircraft={hasAircraft}
            flightDelayed={flightDelayed}
            selected={selected}
            onClick={() => onGateClick?.(gate.id)}
          />
        );
      })}
    </Canvas>
  );
}
