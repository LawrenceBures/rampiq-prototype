// SOI — Authenticated Operator Identity
// Phase 12: Real auth binding with shift context.
//
// RULES:
//   1. Auth → operator → role → zone → viewerRole mapping
//   2. Preserve existing governance-aware rendering
//   3. Preserve replay determinism
//   4. Preserve coordinator-first semantics
//   5. Append-only shift events for continuity
//
// Currently uses Supabase Auth when available,
// falls back to fixture identity for development.

import { getSupabase } from './supabase';

// ============================================================
// TYPES
// ============================================================

export type ViewerRole = 'coordinator' | 'manager' | 'ops_director';

export interface AuthenticatedOperator {
  userId: string;
  displayName: string;
  email?: string;
  role: string;
  viewerRole: ViewerRole;
  zoneId?: string;
  station: string;
  shiftWindow: string;
  /** Whether this is a real auth session or fixture */
  isAuthenticated: boolean;
}

export interface ShiftContext {
  operatorId: string;
  shiftWindow: string;
  startedAt: string;
  /** Active = currently on shift */
  active: boolean;
  /** Incidents inherited from prior shift */
  inheritedIncidentCount: number;
  /** Unresolved escalations from prior shift */
  inheritedEscalationCount: number;
}

// ============================================================
// ROLE MAPPING
// ============================================================

const ROLE_TO_VIEWER: Record<string, ViewerRole> = {
  CREW_CHIEF: 'coordinator',
  RAMP_AGENT: 'coordinator',
  LT_RUNNER: 'coordinator',
  LAV_TECH: 'coordinator',
  OPS: 'manager',
  OPS_DIRECTOR: 'ops_director',
  STATION_MANAGER: 'ops_director',
};

// ============================================================
// FIXTURE OPERATORS (development fallback)
// ============================================================

export const FIXTURE_OPERATORS: AuthenticatedOperator[] = [
  { userId: 'CC01', displayName: 'Martinez J.', role: 'CREW_CHIEF', viewerRole: 'coordinator', zoneId: 'GATES-52ABC', station: 'LAX', shiftWindow: 'AM', isAuthenticated: false },
  { userId: 'CC02', displayName: 'Reyes M.', role: 'CREW_CHIEF', viewerRole: 'coordinator', zoneId: 'GATES-52DEF', station: 'LAX', shiftWindow: 'AM', isAuthenticated: false },
  { userId: 'OPS01', displayName: 'Kim D.', role: 'OPS', viewerRole: 'manager', station: 'LAX', shiftWindow: 'AM', isAuthenticated: false },
  { userId: 'DIR01', displayName: 'Chen L.', role: 'OPS_DIRECTOR', viewerRole: 'ops_director', station: 'LAX', shiftWindow: 'AM', isAuthenticated: false },
];

// ============================================================
// AUTH SESSION
// ============================================================

/**
 * Get the current authenticated operator.
 * Tries Supabase Auth first, falls back to fixture.
 */
export async function getCurrentOperator(): Promise<AuthenticatedOperator | null> {
  const sb = getSupabase();
  if (!sb) return FIXTURE_OPERATORS[0];

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;

  // Map auth user to operator profile
  const { data: profile } = await sb
    .from('users_lite')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile) {
    // Auth user exists but no operator profile — return basic identity
    return {
      userId: user.id,
      displayName: user.email?.split('@')[0] ?? user.id,
      email: user.email ?? undefined,
      role: 'CREW_CHIEF',
      viewerRole: 'coordinator',
      station: 'LAX',
      shiftWindow: 'AM',
      isAuthenticated: true,
    };
  }

  return {
    userId: profile.id,
    displayName: profile.display_name ?? profile.id,
    email: user.email ?? undefined,
    role: profile.role_type,
    viewerRole: ROLE_TO_VIEWER[profile.role_type] ?? 'coordinator',
    zoneId: undefined, // derived from user_zone_assignments
    station: profile.station,
    shiftWindow: profile.default_shift ?? 'AM',
    isAuthenticated: true,
  };
}

/**
 * Sign in with email/password.
 */
export async function signIn(email: string, password: string): Promise<AuthenticatedOperator | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    console.error('[auth] sign in failed:', error.message);
    return null;
  }

  return getCurrentOperator();
}

/**
 * Sign out.
 */
export async function signOut(): Promise<void> {
  const sb = getSupabase();
  if (sb) await sb.auth.signOut();
}

// ============================================================
// SHIFT CONTEXT
// ============================================================

/**
 * Derive shift context from operational memory.
 * Pure function — replay-safe.
 */
export function deriveShiftContext(
  operatorId: string,
  shiftWindow: string,
  incidents: readonly { opened_at: string; resolved_at: string | null; assigned_to: string | null; created_by: string }[],
  events: readonly { event_type: string; created_at: string; entity_type: string | null }[],
  asOf?: Date,
): ShiftContext {
  const now = asOf ?? new Date();
  const shiftStartHour = shiftWindow === 'AM' ? 6 : shiftWindow === 'PM' ? 14 : 22;
  const shiftStart = new Date(now);
  shiftStart.setHours(shiftStartHour, 0, 0, 0);
  if (shiftStart.getTime() > now.getTime()) {
    shiftStart.setDate(shiftStart.getDate() - 1);
  }

  // Incidents that were open BEFORE this shift started (inherited)
  const inherited = incidents.filter(i => {
    const opened = new Date(i.opened_at).getTime();
    const resolved = i.resolved_at ? new Date(i.resolved_at).getTime() : Infinity;
    return opened < shiftStart.getTime() && resolved > shiftStart.getTime() &&
      (i.assigned_to === operatorId || i.created_by === operatorId);
  });

  const inheritedEscalations = events.filter(e =>
    e.entity_type === 'incident' &&
    e.event_type.includes('escalation') &&
    new Date(e.created_at).getTime() < shiftStart.getTime()
  );

  return {
    operatorId,
    shiftWindow,
    startedAt: shiftStart.toISOString(),
    active: true,
    inheritedIncidentCount: inherited.length,
    inheritedEscalationCount: inheritedEscalations.length,
  };
}
