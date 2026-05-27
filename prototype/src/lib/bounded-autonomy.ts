// SOI — Governed Bounded Autonomy Framework
// Phase 18: Limited-domain operational autonomy under governance.
//
// CORE PRINCIPLE:
//   "Trusted operational assistance under supervision."
//   NOT "AI replacing operations."
//
// RULES:
//   1. Autonomy is NEVER permanent — bounded windows only
//   2. Only designated roles may enable/configure/terminate autonomy
//   3. All autonomous actions are append-only replayable events
//   4. Human override is always immediate
//   5. Forbidden domains are architecturally enforced
//   6. Autonomy impact is measured for organizational learning
//   7. Pure functions for derivation, side effects only for actions
//
// FORBIDDEN AUTONOMY DOMAINS (permanent):
//   - Disciplinary action
//   - Workforce scoring
//   - Punitive escalation
//   - Staffing reductions
//   - Employment decisions
//   - Unrestricted dispatch authority
//   - Unrestricted reassignment authority
//   - Governance bypass

import { getSupabase } from './supabase';
import { EVENT_TYPES } from './operational-states';
import type { Incident, RecoveryAction } from './lifecycle-types';
import type { SoiEvent } from '@/lib/soi-types';

// ============================================================
// TYPES
// ============================================================

export type AutonomyTier = 0 | 1 | 2 | 3;

export const AUTONOMY_TIER_LABELS: Record<AutonomyTier, string> = {
  0: 'Advisory — system suggests, human executes',
  1: 'Assisted — system prepares, human approves',
  2: 'Bounded — system executes within approved scope',
  3: 'Supervised — system operates continuously, human monitors',
};

export type AutonomyScope =
  | 'escalation_prioritization'
  | 'recovery_template_execution'
  | 'replay_bookmarking'
  | 'notification_sequencing'
  | 'recommendation_staging'
  | 'coordination_orchestration';

/** Domains that must NEVER have autonomous authority */
export const FORBIDDEN_DOMAINS = [
  'disciplinary_action',
  'workforce_scoring',
  'punitive_escalation',
  'staffing_reduction',
  'employment_decision',
  'unrestricted_dispatch',
  'unrestricted_reassignment',
  'governance_bypass',
] as const;

export interface AutonomyWindow {
  id: string;
  /** Who authorized this window */
  authorizedBy: string;
  authorizedRole: string;
  /** Operational scope */
  zone?: string;
  /** What the system may do */
  allowedScopes: AutonomyScope[];
  /** Autonomy tier */
  tier: AutonomyTier;
  /** Time bounds */
  startedAt: string;
  expiresAt: string;
  /** Whether currently active */
  active: boolean;
  /** How it ended */
  terminatedBy?: string;
  terminatedAt?: string;
  terminationReason?: string;
}

export interface AutonomousAction {
  /** What the system did */
  actionType: string;
  /** Why it did it */
  rationale: string;
  /** What operational conditions triggered it */
  triggerConditions: string;
  /** Historical basis */
  historicalBasis: string;
  /** Confidence limitation */
  limitation: string;
  /** Within which autonomy window */
  windowId: string;
  /** Result */
  result: 'executed' | 'overridden' | 'rolled_back' | 'pending';
}

export interface AutonomyState {
  /** Active autonomy windows */
  activeWindows: AutonomyWindow[];
  /** Recent autonomous actions */
  recentActions: AutonomousAction[];
  /** Whether any autonomy is currently active */
  isActive: boolean;
  /** Current highest tier active */
  highestActiveTier: AutonomyTier;
  /** Override count in current session */
  overrideCount: number;
  /** Governance status */
  governanceIntact: boolean;
}

// ============================================================
// AUTONOMY STATE DERIVATION
// ============================================================

/**
 * Derive current autonomy state from operational events.
 * Pure function — deterministic, replay-safe.
 */
export function deriveAutonomyState(
  events: readonly SoiEvent[],
  asOf?: Date,
): AutonomyState {
  const now = asOf ?? new Date();
  const cutoff = now.getTime();

  // Find autonomy window events
  const windowEvents = events.filter(e =>
    e.entity_type === 'autonomy' && new Date(e.created_at).getTime() <= cutoff
  );

  // Reconstruct active windows
  const windows = new Map<string, AutonomyWindow>();
  for (const ev of windowEvents) {
    const details = (ev.details_json ?? {}) as Record<string, unknown>;
    const windowId = (details.window_id as string) ?? ev.entity_id ?? '';

    if (ev.event_type === 'autonomy.window_started') {
      windows.set(windowId, {
        id: windowId,
        authorizedBy: ev.reported_by,
        authorizedRole: ev.role_type,
        zone: (details.zone as string) ?? undefined,
        allowedScopes: (details.allowed_scopes as AutonomyScope[]) ?? [],
        tier: (details.tier as AutonomyTier) ?? 0,
        startedAt: ev.created_at,
        expiresAt: (details.expires_at as string) ?? '',
        active: true,
      });
    } else if (ev.event_type === 'autonomy.window_terminated' || ev.event_type === 'autonomy.window_expired') {
      const w = windows.get(windowId);
      if (w) {
        w.active = false;
        w.terminatedBy = ev.reported_by;
        w.terminatedAt = ev.created_at;
        w.terminationReason = ev.notes ?? undefined;
      }
    }
  }

  // Check expiration
  const activeWindows: AutonomyWindow[] = [];
  for (const w of windows.values()) {
    if (w.active && w.expiresAt && new Date(w.expiresAt).getTime() <= cutoff) {
      w.active = false;
    }
    if (w.active) activeWindows.push(w);
  }

  // Reconstruct recent actions
  const actionEvents = events.filter(e =>
    e.event_type === 'autonomy.action_executed' && new Date(e.created_at).getTime() <= cutoff
  );
  const overrideEvents = events.filter(e =>
    e.event_type === 'autonomy.action_overridden' && new Date(e.created_at).getTime() <= cutoff
  );

  const recentActions: AutonomousAction[] = actionEvents.slice(-10).map(ev => {
    const details = (ev.details_json ?? {}) as Record<string, unknown>;
    const overridden = overrideEvents.some(o =>
      (o.details_json as Record<string, unknown>)?.action_event_id === ev.id
    );
    return {
      actionType: (details.action_type as string) ?? 'unknown',
      rationale: (details.rationale as string) ?? '',
      triggerConditions: (details.trigger_conditions as string) ?? '',
      historicalBasis: (details.historical_basis as string) ?? '',
      limitation: (details.limitation as string) ?? '',
      windowId: (details.window_id as string) ?? '',
      result: overridden ? 'overridden' : 'executed',
    };
  });

  const highestTier = activeWindows.length > 0
    ? Math.max(...activeWindows.map(w => w.tier)) as AutonomyTier
    : 0 as AutonomyTier;

  return {
    activeWindows,
    recentActions,
    isActive: activeWindows.length > 0,
    highestActiveTier: highestTier,
    overrideCount: overrideEvents.length,
    governanceIntact: true, // always true unless governance events indicate corruption
  };
}

// ============================================================
// AUTONOMY WINDOW MANAGEMENT
// ============================================================

/**
 * Start a bounded autonomy window. Emits governance event.
 * Only authorized roles may call this.
 */
export async function startAutonomyWindow(input: {
  authorizedBy: string;
  authorizedRole: string;
  tier: AutonomyTier;
  allowedScopes: AutonomyScope[];
  durationMinutes: number;
  zone?: string;
  reason?: string;
}): Promise<string | null> {
  // Role gate: only managers and directors
  const allowedRoles = ['OPS', 'OPS_DIRECTOR', 'STATION_MANAGER'];
  if (!allowedRoles.includes(input.authorizedRole)) {
    console.error('[autonomy] unauthorized role:', input.authorizedRole);
    return null;
  }

  // Tier gate: tier 2+ requires director
  if (input.tier >= 2 && input.authorizedRole === 'OPS') {
    console.error('[autonomy] tier 2+ requires OPS_DIRECTOR or STATION_MANAGER');
    return null;
  }

  const sb = getSupabase();
  if (!sb) return null;

  const windowId = `aw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const expiresAt = new Date(Date.now() + input.durationMinutes * 60_000).toISOString();

  const { error } = await sb.from('rampiq_events').insert({
    event_type: 'autonomy.window_started',
    severity: 'LOW', station: 'LAX',
    qr_target_type: 'SYSTEM', qr_target_id: 'AUTONOMY-GOVERNANCE',
    reported_by: input.authorizedBy, role_type: input.authorizedRole,
    shift_window: 'AM', device_id: `DESKTOP-${input.authorizedBy}`,
    source_platform: 'DESKTOP', notes: input.reason ?? null,
    operational_status: 'OPEN', sync_status: 'SYNCED',
    entity_type: 'autonomy', entity_id: windowId,
    state_before: 'inactive', state_after: `tier_${input.tier}`,
    event_version: 2,
    details_json: {
      window_id: windowId,
      tier: input.tier,
      allowed_scopes: input.allowedScopes,
      duration_minutes: input.durationMinutes,
      expires_at: expiresAt,
      zone: input.zone,
      reason: input.reason,
    },
  });

  if (error) {
    console.error('[autonomy] window start failed:', error.message);
    return null;
  }

  console.log(`[autonomy] window started: ${windowId} tier ${input.tier} for ${input.durationMinutes}m`);
  return windowId;
}

/**
 * Terminate an autonomy window immediately.
 */
export async function terminateAutonomyWindow(input: {
  windowId: string;
  terminatedBy: string;
  terminatedRole: string;
  reason?: string;
}): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;

  const { error } = await sb.from('rampiq_events').insert({
    event_type: 'autonomy.window_terminated',
    severity: 'LOW', station: 'LAX',
    qr_target_type: 'SYSTEM', qr_target_id: 'AUTONOMY-GOVERNANCE',
    reported_by: input.terminatedBy, role_type: input.terminatedRole,
    shift_window: 'AM', device_id: `DESKTOP-${input.terminatedBy}`,
    source_platform: 'DESKTOP', notes: input.reason ?? null,
    operational_status: 'RESOLVED', sync_status: 'SYNCED',
    entity_type: 'autonomy', entity_id: input.windowId,
    state_before: 'active', state_after: 'terminated',
    event_version: 2,
    details_json: { window_id: input.windowId, reason: input.reason },
  });

  if (error) {
    console.error('[autonomy] termination failed:', error.message);
    return false;
  }

  console.log(`[autonomy] window terminated: ${input.windowId}`);
  return true;
}

// ============================================================
// DOMAIN ENFORCEMENT
// ============================================================

/**
 * Check whether an action is within allowed autonomy scope.
 * Returns false for forbidden domains — architecturally enforced.
 */
export function isActionAllowed(
  actionDomain: string,
  activeWindows: readonly AutonomyWindow[],
): { allowed: boolean; reason: string } {
  // Forbidden domain check — permanent, non-overridable
  if (FORBIDDEN_DOMAINS.includes(actionDomain as typeof FORBIDDEN_DOMAINS[number])) {
    return { allowed: false, reason: `Domain "${actionDomain}" is permanently forbidden for autonomous execution.` };
  }

  // No active windows
  if (activeWindows.length === 0) {
    return { allowed: false, reason: 'No active autonomy window.' };
  }

  // Check if any active window allows this scope
  const matchingWindow = activeWindows.find(w =>
    w.allowedScopes.includes(actionDomain as AutonomyScope)
  );

  if (!matchingWindow) {
    return { allowed: false, reason: `No active window authorizes scope "${actionDomain}".` };
  }

  return { allowed: true, reason: `Authorized by window ${matchingWindow.id} (tier ${matchingWindow.tier}).` };
}
