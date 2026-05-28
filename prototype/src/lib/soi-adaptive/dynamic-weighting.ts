/**
 * SOI Adaptive — Dynamic Intervention Weighting
 *
 * Adjusts scenario modifiers based on operational context.
 * Equipment-driven pressure → equipment interventions more effective.
 * Staffing-driven → staffing redistribution more effective. Etc.
 */

import type { InterventionType } from '@/lib/soi-simulation/scenario-engine';
import type { OperationalProfile } from './operational-context-analyzer';

// ============================================================
// TYPES
// ============================================================

export interface AdaptiveModifiers {
  targetPressureDelta: number;
  adjacentPressureDelta: number;
  stabilizationDelta: number;
  cascadeDelta: number;
  confidenceDelta: number;
}

// ============================================================
// BASE MODIFIERS (from scenario engine)
// ============================================================

const BASE: Record<InterventionType, AdaptiveModifiers> = {
  no_action:          { targetPressureDelta: 8, adjacentPressureDelta: 3, stabilizationDelta: 10, cascadeDelta: 10, confidenceDelta: -15 },
  dispatch_recovery:  { targetPressureDelta: -25, adjacentPressureDelta: 2, stabilizationDelta: -8, cascadeDelta: -20, confidenceDelta: 15 },
  delay_recovery:     { targetPressureDelta: 12, adjacentPressureDelta: 5, stabilizationDelta: 15, cascadeDelta: 15, confidenceDelta: -20 },
  reroute_staffing:   { targetPressureDelta: -18, adjacentPressureDelta: 6, stabilizationDelta: -5, cascadeDelta: -12, confidenceDelta: 10 },
  reassign_equipment: { targetPressureDelta: -20, adjacentPressureDelta: 0, stabilizationDelta: -6, cascadeDelta: -15, confidenceDelta: 12 },
  split_resources:    { targetPressureDelta: -12, adjacentPressureDelta: -5, stabilizationDelta: 3, cascadeDelta: -8, confidenceDelta: 5 },
  escalate_support:   { targetPressureDelta: -15, adjacentPressureDelta: -2, stabilizationDelta: -4, cascadeDelta: -10, confidenceDelta: 8 },
};

// ============================================================
// ADAPTIVE WEIGHTING
// ============================================================

/**
 * Compute context-adapted modifiers for an intervention.
 */
export function computeAdaptiveModifiers(
  intervention: InterventionType,
  profile: OperationalProfile,
): AdaptiveModifiers {
  const base = { ...BASE[intervention] };

  // Equipment-driven pressure → equipment interventions stronger
  if (profile.composition === 'equipment_driven' || profile.equipmentFactor > 0.5) {
    if (intervention === 'reassign_equipment') {
      base.targetPressureDelta *= 1.4; // 40% more effective
      base.confidenceDelta += 5;
    }
    if (intervention === 'dispatch_recovery') {
      base.targetPressureDelta *= 0.7; // less effective if equipment is the root cause
      base.confidenceDelta -= 5;
    }
    if (intervention === 'reroute_staffing') {
      base.targetPressureDelta *= 0.6; // staffing doesn't fix equipment
      base.confidenceDelta -= 8;
    }
  }

  // Staffing-driven → staffing interventions stronger
  if (profile.composition === 'staffing_driven' || profile.staffingFactor > 0.5) {
    if (intervention === 'reroute_staffing') {
      base.targetPressureDelta *= 1.4;
      base.confidenceDelta += 5;
    }
    if (intervention === 'reassign_equipment') {
      base.targetPressureDelta *= 0.6;
      base.confidenceDelta -= 8;
    }
    if (intervention === 'escalate_support') {
      base.targetPressureDelta *= 1.2;
      base.confidenceDelta += 3;
    }
  }

  // Cascade propagation → split resources or escalation stronger
  if (profile.composition === 'cascade_propagation' || profile.cascadeFactor > 0.5) {
    if (intervention === 'split_resources') {
      base.targetPressureDelta *= 1.3;
      base.adjacentPressureDelta -= 3;
      base.cascadeDelta -= 8;
    }
    if (intervention === 'escalate_support') {
      base.targetPressureDelta *= 1.2;
      base.cascadeDelta -= 5;
    }
    if (intervention === 'dispatch_recovery') {
      base.adjacentPressureDelta += 3; // concentrated resources worsen cascade
    }
  }

  // High recovery congestion → escalation more important
  if (profile.recoveryCongestion > 0.5) {
    if (intervention === 'escalate_support') {
      base.targetPressureDelta *= 1.3;
      base.confidenceDelta += 5;
    }
    if (intervention === 'dispatch_recovery') {
      base.targetPressureDelta *= 0.8; // adding more recoveries when congested
      base.confidenceDelta -= 5;
    }
  }

  // High aging → immediate intervention more effective
  if (profile.agingFactor > 0.6) {
    if (intervention === 'delay_recovery') {
      base.targetPressureDelta *= 1.4; // delay is worse when aging
      base.confidenceDelta -= 8;
    }
    if (intervention === 'dispatch_recovery') {
      base.targetPressureDelta *= 1.15;
    }
  }

  // Mixed composition → all interventions less certain
  if (profile.composition === 'mixed') {
    base.confidenceDelta -= 5;
  }

  // Round all values
  base.targetPressureDelta = Math.round(base.targetPressureDelta);
  base.adjacentPressureDelta = Math.round(base.adjacentPressureDelta);
  base.stabilizationDelta = Math.round(base.stabilizationDelta);
  base.cascadeDelta = Math.round(base.cascadeDelta);
  base.confidenceDelta = Math.round(base.confidenceDelta);

  return base;
}

/**
 * Get a narrative explanation of why weighting changed.
 */
export function explainWeighting(
  intervention: InterventionType,
  profile: OperationalProfile,
): string | null {
  const base = BASE[intervention];
  const adapted = computeAdaptiveModifiers(intervention, profile);

  if (adapted.targetPressureDelta === base.targetPressureDelta && adapted.confidenceDelta === base.confidenceDelta) {
    return null; // no change
  }

  const moreEffective = adapted.targetPressureDelta < base.targetPressureDelta;
  const label = {
    no_action: 'No action',
    dispatch_recovery: 'Recovery dispatch',
    delay_recovery: 'Delayed intervention',
    reroute_staffing: 'Staffing redistribution',
    reassign_equipment: 'Equipment reassignment',
    split_resources: 'Split resources',
    escalate_support: 'Escalation',
  }[intervention];

  return moreEffective
    ? `${label} is ${Math.abs(Math.round((adapted.targetPressureDelta / base.targetPressureDelta - 1) * 100))}% more effective in ${profile.composition.replace('_', ' ')} conditions.`
    : `${label} effectiveness reduced due to ${profile.dominantDriver.toLowerCase()}.`;
}
