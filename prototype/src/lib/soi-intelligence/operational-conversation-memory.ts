/**
 * SOI Intelligence Core — Operational Conversation Memory
 *
 * Lightweight rolling conversational context for the operational copilot.
 * Tracks active zone, gate, incident, resource, topic, and last intent.
 * In-browser state only. Expires after configurable timeout.
 *
 * No persistence. No external storage. No LLM.
 */

// ============================================================
// TYPES
// ============================================================

export type OperationalTopic =
  | 'stability'
  | 'recovery'
  | 'cascade'
  | 'staffing'
  | 'equipment'
  | 'risk'
  | 'resource';

export interface ConversationContext {
  activeZone?: string;
  activeZoneLabel?: string;
  activeGate?: string;
  activeIncidentId?: string;
  activeResourceId?: string;
  activeRecoveryChainId?: string;
  activeTopic?: OperationalTopic;
  lastIntent?: string;
  lastAnswerTitle?: string;
  lastUpdatedAt: number;
}

// ============================================================
// DEFAULTS
// ============================================================

const CONTEXT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export function createEmptyContext(): ConversationContext {
  return { lastUpdatedAt: 0 };
}

// ============================================================
// CONTEXT OPERATIONS
// ============================================================

/**
 * Check whether the context is still valid (not expired).
 */
export function isContextActive(ctx: ConversationContext): boolean {
  if (ctx.lastUpdatedAt === 0) return false;
  return (Date.now() - ctx.lastUpdatedAt) < CONTEXT_TIMEOUT_MS;
}

/**
 * Update context after a successful copilot answer.
 * Merges new fields into existing context. Only overwrites fields
 * that are explicitly provided (not undefined).
 */
export function updateContext(
  current: ConversationContext,
  update: Partial<Omit<ConversationContext, 'lastUpdatedAt'>>,
): ConversationContext {
  const next = { ...current, lastUpdatedAt: Date.now() };

  if (update.activeZone !== undefined) next.activeZone = update.activeZone;
  if (update.activeZoneLabel !== undefined) next.activeZoneLabel = update.activeZoneLabel;
  if (update.activeGate !== undefined) next.activeGate = update.activeGate;
  if (update.activeIncidentId !== undefined) next.activeIncidentId = update.activeIncidentId;
  if (update.activeResourceId !== undefined) next.activeResourceId = update.activeResourceId;
  if (update.activeRecoveryChainId !== undefined) next.activeRecoveryChainId = update.activeRecoveryChainId;
  if (update.activeTopic !== undefined) next.activeTopic = update.activeTopic;
  if (update.lastIntent !== undefined) next.lastIntent = update.lastIntent;
  if (update.lastAnswerTitle !== undefined) next.lastAnswerTitle = update.lastAnswerTitle;

  return next;
}

/**
 * Derive the topic from an intent string.
 */
export function intentToTopic(intent: string): OperationalTopic | undefined {
  switch (intent) {
    case 'stability_timing': return 'stability';
    case 'cause_explanation': return 'cascade';
    case 'risk_assessment': return 'risk';
    case 'recovery_plan': return 'recovery';
    case 'resource_question': return 'resource';
    default: return undefined;
  }
}

/**
 * Get a human-readable summary of active context.
 */
export function contextSummary(ctx: ConversationContext): string | null {
  if (!isContextActive(ctx)) return null;

  const parts: string[] = [];
  if (ctx.activeZoneLabel) parts.push(ctx.activeZoneLabel);
  else if (ctx.activeZone) parts.push(ctx.activeZone);
  if (ctx.activeGate && !ctx.activeZoneLabel?.includes(ctx.activeGate)) parts.push(ctx.activeGate);
  if (ctx.activeTopic) parts.push(ctx.activeTopic);
  if (ctx.activeResourceId) parts.push(ctx.activeResourceId);

  return parts.length > 0 ? parts.join(' · ') : null;
}
