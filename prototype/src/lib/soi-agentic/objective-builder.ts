/**
 * SOI Agentic — Objective Builder
 *
 * Converts parsed agentic intents into structured operational objectives
 * with constraints, priorities, and risk tolerance.
 */

import type { ParsedAgenticIntent } from './intent-parser';
import type { OperationalAssessment, ZoneAssessment } from '@/lib/soi-intelligence/operational-reasoning';

// ============================================================
// TYPES
// ============================================================

export interface OperationalObjective {
  objectiveId: string;
  type: string;
  targetZone?: string;
  targetZoneLabel?: string;
  targetGate?: string;
  targetResource?: string;
  constraints: string[];
  priorities: string[];
  riskTolerance: 'low' | 'medium' | 'high';
  operationalGoal: string;
}

// ============================================================
// BUILDER
// ============================================================

export function buildObjective(
  intent: ParsedAgenticIntent,
  assessment: OperationalAssessment,
  zones?: readonly { id: string; label: string; gate_ids: string[] }[],
): OperationalObjective {
  const targetZone = intent.targetZone ?? inferTargetZone(intent, assessment);
  const zoneLabel = zones?.find(z => z.id === targetZone)?.label;
  const za = targetZone ? assessment.zoneAssessments.find(z => z.zoneId === targetZone) : null;

  const base: OperationalObjective = {
    objectiveId: `obj-${intent.intent ?? 'generic'}-${Date.now()}`,
    type: intent.intent ?? 'stabilize_zone',
    targetZone,
    targetZoneLabel: zoneLabel,
    targetGate: intent.targetGate,
    targetResource: intent.targetResource,
    constraints: [],
    priorities: [],
    riskTolerance: 'medium',
    operationalGoal: '',
  };

  switch (intent.intent) {
    case 'stabilize_zone':
      base.operationalGoal = `Reduce pressure and stabilize ${zoneLabel ?? targetZone ?? 'highest-pressure zone'}`;
      base.priorities = ['reduce unresolved incidents', 'unblock stalled recoveries', 'prevent cascade to adjacent zones'];
      base.constraints = buildConstraints(intent, za);
      base.riskTolerance = intent.constraint === 'fastest' ? 'high' : intent.constraint === 'safest' ? 'low' : 'medium';
      break;

    case 'prevent_escalation':
      base.operationalGoal = `Prevent ${zoneLabel ?? targetZone ?? 'at-risk zone'} from reaching critical state`;
      base.priorities = ['address highest-severity incidents first', 'deploy preventive resources', 'monitor escalation indicators'];
      base.constraints = ['avoid actions that increase adjacent zone pressure', ...buildConstraints(intent, za)];
      base.riskTolerance = 'low';
      break;

    case 'reduce_pressure':
      base.operationalGoal = `Reduce operational pressure in ${zoneLabel ?? targetZone ?? 'highest-pressure zone'}`;
      base.priorities = ['clear incident backlog', 'resolve aged incidents', 'rebalance resource load'];
      base.constraints = buildConstraints(intent, za);
      break;

    case 'minimize_disruption':
      base.operationalGoal = 'Recover with minimum operational disruption';
      base.priorities = ['use existing recovery chains', 'avoid large-scale reassignments', 'preserve current staffing'];
      base.constraints = ['minimize staffing cascade', 'avoid cross-zone resource pulls', 'prefer incremental actions'];
      base.riskTolerance = 'low';
      break;

    case 'dispatch_recovery':
      base.operationalGoal = `Dispatch recovery resources to ${zoneLabel ?? targetZone ?? 'target area'}`;
      base.priorities = ['dispatch available agents', 'assign equipment', 'establish recovery chain'];
      base.constraints = buildConstraints(intent, za);
      break;

    case 'optimize_staffing':
      base.operationalGoal = 'Optimize staffing allocation across zones';
      base.priorities = ['balance load across zones', 'reduce over-assignment', 'fill coverage gaps'];
      base.constraints = ['respect shift boundaries', 'maintain minimum zone coverage'];
      break;

    case 'protect_outbound_push':
      base.operationalGoal = 'Stabilize operations before outbound departure push';
      base.priorities = ['clear gate-blocking incidents', 'ensure equipment availability', 'protect departure timeline'];
      base.constraints = ['outbound push is timeline-critical', 'prefer actions that clear gates fastest'];
      base.riskTolerance = 'high';
      break;

    case 'resolve_criticals':
      base.operationalGoal = 'Resolve all critical and high-severity incidents';
      base.priorities = ['critical incidents first', 'high severity second', 'aged incidents prioritized'];
      base.constraints = buildConstraints(intent, za);
      base.riskTolerance = 'high';
      break;

    case 'contain_cascade':
      base.operationalGoal = 'Contain pressure cascade and prevent zone-to-zone spread';
      base.priorities = ['isolate pressure source', 'reinforce adjacent zones', 'block cascade paths'];
      base.constraints = ['maintain boundary between affected and stable zones'];
      base.riskTolerance = 'medium';
      break;

    default:
      base.operationalGoal = `Address operational pressure in ${zoneLabel ?? 'affected zones'}`;
      base.priorities = ['reduce pressure', 'stabilize operations'];
      base.constraints = buildConstraints(intent, za);
  }

  return base;
}

function inferTargetZone(intent: ParsedAgenticIntent, assessment: OperationalAssessment): string | undefined {
  if (assessment.zoneAssessments.length === 0) return undefined;
  const worst = [...assessment.zoneAssessments].sort((a, b) => b.pressure - a.pressure)[0];
  return worst.stability !== 'stable' ? worst.zoneId : undefined;
}

function buildConstraints(intent: ParsedAgenticIntent, za: ZoneAssessment | null | undefined): string[] {
  const c: string[] = [];
  if (intent.constraint === 'minimize_disruption') c.push('minimize staffing disruption');
  if (intent.constraint === 'protect_outbound') c.push('protect outbound departure schedule');
  if (intent.constraint === 'fastest') c.push('prioritize speed over caution');
  if (intent.constraint === 'safest') c.push('prioritize safety over speed');
  if (za && za.activeRecoveryCount > 0) c.push(`${za.activeRecoveryCount} recovery actions already in progress — avoid duplication`);
  return c;
}
