/**
 * SOI Agentic — Authorization Gate
 *
 * Verifies role permissions before execution.
 * Maps viewer roles to allowed action types.
 * Unauthorized actions are blocked with explanation.
 */

import type { StepActionType, PlannedStep } from './execution-planner';

// ============================================================
// TYPES
// ============================================================

export type ViewerRole = 'coordinator' | 'manager' | 'ops_director';

export interface AuthorizationResult {
  authorized: boolean;
  authorizedSteps: PlannedStep[];
  deniedSteps: PlannedStep[];
  deniedReasons: string[];
  escalationPath?: string;
}

// ============================================================
// PERMISSION MAP
// ============================================================

const ROLE_PERMISSIONS: Record<ViewerRole, Set<StepActionType>> = {
  coordinator: new Set(['dispatch', 'acknowledge', 'unblock', 'recover', 'stabilize']),
  manager: new Set(['dispatch', 'acknowledge', 'unblock', 'recover', 'stabilize', 'reassign', 'escalate', 'hold']),
  ops_director: new Set(['dispatch', 'acknowledge', 'unblock', 'recover', 'stabilize', 'reassign', 'escalate', 'hold']),
};

// ============================================================
// GATE
// ============================================================

export function authorizeExecution(
  steps: readonly PlannedStep[],
  role: ViewerRole,
): AuthorizationResult {
  const allowed = ROLE_PERMISSIONS[role] ?? new Set();
  const authorizedSteps: PlannedStep[] = [];
  const deniedSteps: PlannedStep[] = [];
  const deniedReasons: string[] = [];

  for (const step of steps) {
    if (allowed.has(step.actionType)) {
      authorizedSteps.push(step);
    } else {
      deniedSteps.push(step);
      deniedReasons.push(`${step.title}: ${role} role cannot perform ${step.actionType} actions`);
    }
  }

  let escalationPath: string | undefined;
  if (deniedSteps.length > 0) {
    if (role === 'coordinator') {
      escalationPath = 'Request manager approval for escalation and hold actions';
    }
  }

  return {
    authorized: deniedSteps.length === 0,
    authorizedSteps,
    deniedSteps,
    deniedReasons,
    escalationPath,
  };
}
