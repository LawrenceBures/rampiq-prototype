/**
 * SOI Intelligence Core — What-If Simulator
 *
 * Deterministic modeled estimates of recovery action impact.
 * Simulates pressure reduction, unresolved count changes,
 * and resource tradeoffs.
 *
 * All estimates are labeled as deterministic modeled estimates.
 * No probabilistic claims. No fake prediction.
 */

import type { Incident } from '@/lib/lifecycle-types';
import type { RecoveryAction } from '@/lib/lifecycle-types';
import type { ZoneAssessment } from './operational-reasoning';

// ============================================================
// TYPES
// ============================================================

export interface WhatIfResult {
  beforePressure: number;
  afterPressure: number;
  riskReducedBy: number;
  possibleTradeoffs: string[];
  estimationType: 'deterministic_modeled_estimate';
}

export interface WhatIfScenario {
  actionType: 'dispatch_agent' | 'reassign_equipment' | 'escalate_support' | 'hold_push' | 'monitor';
  targetZone: string;
  targetGate?: string;
}

// ============================================================
// SIMULATOR
// ============================================================

interface RecommendedActionLike {
  type: string;
  target: string;
}

export function simulateRecovery(
  zoneAssessment: ZoneAssessment,
  actions: readonly RecommendedActionLike[],
  zoneIncidents: readonly Incident[],
  activeRecoveryActions: readonly RecoveryAction[],
): WhatIfResult {
  const before = zoneAssessment.pressure;
  let reduction = 0;
  const tradeoffs: string[] = [];

  for (const action of actions) {
    switch (action.type) {
      case 'dispatch_agent':
        // Dispatching support reduces pressure by addressing unresolved backlog
        reduction += Math.min(25, zoneAssessment.unresolvedCount * 8);
        tradeoffs.push('Agent redeployed from current assignment — may create gap elsewhere');
        break;

      case 'reassign_equipment':
        // Equipment swap directly addresses a pressure source
        reduction += 20;
        tradeoffs.push('Equipment transition period (~5–10 min) before new unit operational');
        break;

      case 'escalate_support':
        // Escalation brings attention but doesn't directly resolve
        reduction += 10;
        tradeoffs.push('Escalation consumes leadership attention — use judiciously');
        break;

      case 'hold_push':
        // Holding a push prevents cascade but delays schedule
        reduction += 15;
        tradeoffs.push('Flight schedule impact — downstream delay possible');
        break;

      case 'monitor':
        // Monitoring alone has minimal direct impact
        reduction += 5;
        break;
    }
  }

  // Active recovery actions already contribute to stabilization
  const existingRecoveryBonus = activeRecoveryActions.filter(
    ra => ra.status === 'ACTIVE'
  ).length * 5;
  reduction += existingRecoveryBonus;

  // Can't reduce below 0
  const afterPressure = Math.max(0, before - reduction);
  const riskReduced = before > 0 ? Math.round(((before - afterPressure) / before) * 100) : 0;

  if (tradeoffs.length === 0) {
    tradeoffs.push('No significant tradeoffs identified');
  }

  return {
    beforePressure: before,
    afterPressure,
    riskReducedBy: riskReduced,
    possibleTradeoffs: tradeoffs,
    estimationType: 'deterministic_modeled_estimate',
  };
}

export function simulateScenario(
  scenario: WhatIfScenario,
  zoneAssessment: ZoneAssessment,
  incidents: readonly Incident[],
  recoveryActions: readonly RecoveryAction[],
): WhatIfResult {
  return simulateRecovery(
    zoneAssessment,
    [{ type: scenario.actionType, target: scenario.targetGate ?? scenario.targetZone }],
    incidents,
    recoveryActions,
  );
}
