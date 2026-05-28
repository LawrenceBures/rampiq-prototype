/**
 * SOI Agentic — Authorized Command Execution Layer
 *
 * Transforms SOI from operational advisor into authorized
 * operational command layer. Humans remain final authority.
 *
 * Flow: intent → objective → plan → authorize → execute → monitor
 */

export { parseAgenticIntent, type ParsedAgenticIntent, type AgenticIntent } from './intent-parser';
export { buildObjective, type OperationalObjective } from './objective-builder';
export { buildExecutionPlan, buildAlternativePlan, type ExecutionPlan, type PlannedStep, type StepActionType } from './execution-planner';
export { authorizeExecution, type AuthorizationResult } from './authorization-gate';
export {
  createExecutionState, approveExecution, cancelExecution, executeNextStep, executionProgress,
  type ExecutionState, type StepState, type StepStatus,
} from './execution-orchestrator';
export { monitorPostExecution, type MonitoringReport } from './post-execution-monitor';
export {
  createCommandMemory, stagePlan, updateExecution, completePlan, clearCommandMemory,
  hasActivePlan, hasActiveExecution,
  type CommandMemory, type ExecutionRecord,
} from './command-memory';
