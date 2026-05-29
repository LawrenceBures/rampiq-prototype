/**
 * SOI Identity — Access Code Identity
 *
 * Lightweight demo access-code identity system.
 * Maps short access codes to operator profiles.
 * Stored in localStorage for session persistence.
 */

import type { AuthenticatedOperator } from '@/lib/auth-identity';

// ============================================================
// ACCESS CODE REGISTRY
// ============================================================

const ACCESS_CODES: Record<string, AuthenticatedOperator> = {
  CHIEF52: {
    userId: 'CC01',
    displayName: 'Martinez J.',
    role: 'CREW_CHIEF',
    viewerRole: 'coordinator',
    zoneId: 'GATES-52ABC',
    station: 'LAX',
    shiftWindow: 'AM',
    isAuthenticated: true,
  },
  CHIEF56: {
    userId: 'CC02',
    displayName: 'Reyes M.',
    role: 'CREW_CHIEF',
    viewerRole: 'coordinator',
    zoneId: 'GATES-52DEF',
    station: 'LAX',
    shiftWindow: 'AM',
    isAuthenticated: true,
  },
  MGRLAX: {
    userId: 'OPS01',
    displayName: 'Kim D.',
    role: 'OPS',
    viewerRole: 'manager',
    station: 'LAX',
    shiftWindow: 'AM',
    isAuthenticated: true,
  },
  OPSDIR: {
    userId: 'DIR01',
    displayName: 'Chen L.',
    role: 'OPS_DIRECTOR',
    viewerRole: 'ops_director',
    station: 'LAX',
    shiftWindow: 'AM',
    isAuthenticated: true,
  },
  AGENT14: {
    userId: 'RA14',
    displayName: 'Okafor D.',
    role: 'RAMP_AGENT',
    viewerRole: 'coordinator',
    station: 'LAX',
    shiftWindow: 'AM',
    isAuthenticated: true,
  },
};

const STORAGE_KEY = 'soi_identity';

// ============================================================
// PUBLIC API
// ============================================================

export function validateAccessCode(code: string): AuthenticatedOperator | null {
  return ACCESS_CODES[code.toUpperCase().trim()] ?? null;
}

export function getStoredIdentity(): AuthenticatedOperator | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthenticatedOperator;
  } catch { return null; }
}

export function storeIdentity(op: AuthenticatedOperator): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(op));
}

export function clearIdentity(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

export function generateGreeting(op: AuthenticatedOperator, operationalContext?: {
  pressure: number;
  stability: string;
  activeIncidents: number;
  activeRecoveries: number;
  worstZone?: string;
  worstZonePressure?: number;
}): string {
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const name = op.displayName.split(' ')[0] ?? op.displayName;

  if (!operationalContext || operationalContext.pressure === 0) {
    return `${timeOfDay}, ${name}. Operations are holding steady. I'm watching all gates.`;
  }

  const { pressure, activeIncidents, activeRecoveries, worstZone, worstZonePressure } = operationalContext;

  if (pressure >= 70) {
    return `${timeOfDay}, ${name}. Pressure is at ${pressure} — ${worstZone ? `${worstZone} is your priority at ${worstZonePressure}` : 'elevated across the board'}. ${activeIncidents} active incident${activeIncidents !== 1 ? 's' : ''}.${activeRecoveries > 0 ? ` ${activeRecoveries} recovery action${activeRecoveries !== 1 ? 's' : ''} running.` : ' No recovery started yet.'}`;
  }
  if (pressure >= 40) {
    return `${timeOfDay}, ${name}. Pressure is moderate at ${pressure}. ${activeIncidents > 0 ? `${activeIncidents} incident${activeIncidents !== 1 ? 's' : ''} being managed.` : 'Operations are manageable.'} I'm watching for changes.`;
  }
  return `${timeOfDay}, ${name}. Everything is holding steady. Pressure at ${pressure}, no elevated concerns. I'll flag anything that needs attention.`;
}

export function getRoleLabel(op: AuthenticatedOperator): string {
  switch (op.viewerRole) {
    case 'coordinator': return `${op.role.replace('_', ' ')} · ${op.station}`;
    case 'manager': return `Operations Manager · ${op.station}`;
    case 'ops_director': return `Operations Director · ${op.station}`;
    default: return op.role;
  }
}
