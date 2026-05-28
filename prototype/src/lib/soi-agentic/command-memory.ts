/**
 * SOI Agentic — Command Memory
 *
 * Tracks pending/approved/active execution plans,
 * recovery chains, and execution history.
 * In-browser state only.
 */

import type { ExecutionPlan } from './execution-planner';
import type { ExecutionState } from './execution-orchestrator';
import type { OperationalObjective } from './objective-builder';
import type { OperationalAssessment } from '@/lib/soi-intelligence/operational-reasoning';

// ============================================================
// TYPES
// ============================================================

export interface CommandMemory {
  activePlan: ExecutionPlan | null;
  activeExecution: ExecutionState | null;
  activeObjective: OperationalObjective | null;
  preExecutionAssessment: OperationalAssessment | null;
  history: ExecutionRecord[];
  lastUpdatedAt: number;
}

export interface ExecutionRecord {
  planId: string;
  objective: string;
  status: string;
  stepsCompleted: number;
  stepsTotal: number;
  timestamp: number;
}

// ============================================================
// FACTORY
// ============================================================

export function createCommandMemory(): CommandMemory {
  return {
    activePlan: null,
    activeExecution: null,
    activeObjective: null,
    preExecutionAssessment: null,
    history: [],
    lastUpdatedAt: 0,
  };
}

// ============================================================
// OPERATIONS
// ============================================================

export function stagePlan(
  mem: CommandMemory,
  plan: ExecutionPlan,
  objective: OperationalObjective,
  assessment: OperationalAssessment,
): CommandMemory {
  return {
    ...mem,
    activePlan: plan,
    activeObjective: objective,
    activeExecution: null,
    preExecutionAssessment: assessment,
    lastUpdatedAt: Date.now(),
  };
}

export function updateExecution(
  mem: CommandMemory,
  execution: ExecutionState,
): CommandMemory {
  return { ...mem, activeExecution: execution, lastUpdatedAt: Date.now() };
}

export function completePlan(mem: CommandMemory): CommandMemory {
  const record: ExecutionRecord | null = mem.activePlan && mem.activeExecution ? {
    planId: mem.activePlan.planId,
    objective: mem.activePlan.objective.operationalGoal,
    status: mem.activeExecution.status,
    stepsCompleted: mem.activeExecution.steps.filter(s => s.status === 'completed').length,
    stepsTotal: mem.activeExecution.steps.length,
    timestamp: Date.now(),
  } : null;

  return {
    ...mem,
    activePlan: null,
    activeExecution: null,
    activeObjective: null,
    preExecutionAssessment: null,
    history: record ? [...mem.history.slice(-9), record] : mem.history,
    lastUpdatedAt: Date.now(),
  };
}

export function clearCommandMemory(mem: CommandMemory): CommandMemory {
  return createCommandMemory();
}

export function hasActivePlan(mem: CommandMemory): boolean {
  return mem.activePlan !== null;
}

export function hasActiveExecution(mem: CommandMemory): boolean {
  return mem.activeExecution !== null &&
    (mem.activeExecution.status === 'approved' || mem.activeExecution.status === 'executing');
}
