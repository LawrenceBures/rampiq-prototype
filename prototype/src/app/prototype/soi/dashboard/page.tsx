'use client';

import { useState, useRef, useEffect } from 'react';
import { useLiveEvents, useRealtimeIncidents, useRecoveryActions, updateEventStatus, resetEvents, fetchZones } from '@/lib/store';
import { durationLabel } from '@/lib/soi-types';
import type { SoiEvent, Severity, OperationalStatus } from '@/lib/soi-types';
import type { Zone } from '@/lib/soi-types';
import { SeverityIndicator, ElapsedTime, EventCard, IncidentCard, KpiStrip, CommandBar, ZoneTile, IncidentDetailPanel } from '@/components/soi';
import {
  deriveDashboardState,
  filterEvents,
  activeFilterCount as countActiveFilters,
  isOpen,
  groupByAging,
  sortBySeverityThenAge,
} from '@/lib/derived-operational-state';
import type { EventFilters } from '@/lib/derived-operational-state';
import {
  createIncident,
  transitionIncident,
  createRecoveryAction,
  transitionRecoveryAction,
  emitEscalationAction,
} from '@/lib/lifecycle-commands';
import { clearDemoData, seedDemoScenario } from '@/lib/demo-seed';
import { clearStressData, runStressSimulation } from '@/lib/stress-simulation';
import type { Incident } from '@/lib/lifecycle-types';
import type { IncidentStatus, RecoveryActionStatus } from '@/lib/operational-states';
import { reconstructIncidents, reconstructRecoveryActions } from '@/lib/replay-lifecycle';
import { deriveWorkforceCoordination } from '@/lib/workforce-coordination';
import { emitReplayAudit } from '@/lib/governance-audit';
import { deriveRecommendations, emitRecommendationOverride } from '@/lib/recommendation-engine';
import type { Recommendation } from '@/lib/recommendation-engine';
import { deriveOperationalOutcomes } from '@/lib/outcome-measurement';
import { deriveInstitutionalMemory } from '@/lib/institutional-memory';
import { deriveAnticipatoryState } from '@/lib/anticipatory-cognition';
import { generateOperationalNarratives } from '@/lib/operational-narrative';
import { deriveShiftContext, FIXTURE_OPERATORS } from '@/lib/auth-identity';
import type { AuthenticatedOperator } from '@/lib/auth-identity';
import type { EscalationSignal } from '@/lib/workforce-coordination';
import { analyzeOperationalPatterns } from '@/lib/operational-patterns';
import type { PatternInsight, InsightCategory, PressureState } from '@/lib/operational-patterns';
import {
  generateRecommendations,
  rankRecommendations,
  parseCommand,
  resolveZonePattern,
  explainInstability,
  assessOperation,
  answerOperationalQuestion,
  createEmptyContext,
  contextSummary,
  type SoiRecommendation,
  type CommandIntent,
  type CopilotAnswer,
  type ConversationContext,
} from '@/lib/soi-intelligence';
import {
  parseAgenticIntent,
  buildObjective,
  buildExecutionPlan,
  buildAlternativePlan,
  authorizeExecution,
  createCommandMemory,
  stagePlan,
  updateExecution,
  completePlan,
  clearCommandMemory,
  hasActivePlan,
  type CommandMemory,
  type ExecutionPlan,
} from '@/lib/soi-agentic';
import {
  createLiveExecution,
  approveLiveExecution,
  cancelLiveExecution,
  dispatchNextStep as liveDispatchNext,
  tickExecution,
  isExecutionActive,
  executionProgressSummary,
  evaluateChainHealth,
  generateAdaptiveRecommendations,
  formatTimelineTime,
  type LiveExecutionState,
  type AdaptiveRecommendation,
} from '@/lib/soi-execution';

// ============================================================
// TYPES
// ============================================================

type View = 'feed' | 'unresolved' | 'patterns' | 'incidents' | 'intelligence';
type FilterKey = keyof EventFilters;

const EMPTY_FILTERS: EventFilters = {
  severity: 'ALL', status: 'ALL', gate: 'ALL', equipment: 'ALL', shift: 'ALL',
};

// ============================================================
// HELPERS (presentation-only, kept local to page)
// ============================================================


// ============================================================
// MAIN COMPONENT
// ============================================================

// Operator identity — uses auth-identity module
const OPERATORS = FIXTURE_OPERATORS;

export default function ManagerDashboard() {
  const { events, loading, lastUpdated, refresh } = useLiveEvents(3000);
  const [view, setView] = useState<View>('feed');
  const [operator, setOperator] = useState<AuthenticatedOperator>(OPERATORS[0]);
  const [filters, setFilters] = useState<EventFilters>(EMPTY_FILTERS);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const prevIdsRef = useRef<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

  // ── SOI Command Input ──
  const [commandInput, setCommandInput] = useState('');
  const [commandResponse, setCommandResponse] = useState<string[] | null>(null);
  const [copilotAnswer, setCopilotAnswer] = useState<CopilotAnswer | null>(null);
  const [conversationMemory, setConversationMemory] = useState<ConversationContext>(createEmptyContext());
  const [lastInferredFrom, setLastInferredFrom] = useState<string[]>([]);
  const [approvingRecId, setApprovingRecId] = useState<string | null>(null);
  const [cmdMemory, setCmdMemory] = useState<CommandMemory>(createCommandMemory());
  const [liveExec, setLiveExec] = useState<LiveExecutionState | null>(null);
  const [adaptiveRecs, setAdaptiveRecs] = useState<AdaptiveRecommendation[]>([]);
  const liveExecTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [approveResult, setApproveResult] = useState<Record<string, 'success' | 'error' | 'duplicate'>>({});
  const [expandedSimId, setExpandedSimId] = useState<string | null>(null);

  // ============================================================
  // REPLAY MODE
  // ============================================================

  const [replayMode, setReplayMode] = useState(false);
  const [replayTimestamp, setReplayTimestamp] = useState<Date | null>(null);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const replayIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [replayAuditFailed, setReplayAuditFailed] = useState(false);

  async function startReplay() {
    const eventTs = events.map(e => new Date(e.created_at).getTime()).filter(t => t > 0);
    const twoHoursAgo = Date.now() - 2 * 60 * 60_000;
    const lifecycleTs = events.filter(e => e.entity_type === 'incident' || e.entity_type === 'recovery_action')
      .map(e => new Date(e.created_at).getTime());
    const startTime = lifecycleTs.length > 0
      ? Math.max(Math.min(...lifecycleTs) - 10 * 60_000, twoHoursAgo)
      : eventTs.length > 0 ? Math.max(Math.min(...eventTs), twoHoursAgo) : twoHoursAgo;

    // Governance: fail-closed audit for accountability-capable roles
    const needsAudit = operator.viewerRole === 'ops_director' || (operator.viewerRole === 'manager' && selectedZoneId);
    if (needsAudit) {
      const auditOk = await emitReplayAudit({
        viewerId: operator.userId, viewerRole: operator.role,
        accessType: operator.viewerRole === 'ops_director' ? 'accountability_review' : 'cross_zone',
        zoneScope: selectedZoneId ?? undefined,
        replayTimestamp: new Date(startTime).toISOString(),
      });
      if (!auditOk) {
        setReplayAuditFailed(true);
        return; // fail-closed: do NOT render replay without audit
      }
    }

    setReplayAuditFailed(false);
    setReplayMode(true);
    setReplayTimestamp(new Date(startTime));
    setReplayPlaying(false);
  }

  function exitReplay() {
    setReplayMode(false);
    setReplayTimestamp(null);
    setReplayPlaying(false);
    if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);
    replayIntervalRef.current = null;
  }

  function stepReplay(minutes: number) {
    setReplayTimestamp(prev => {
      if (!prev) return prev;
      const next = new Date(prev.getTime() + minutes * 60_000);
      if (next.getTime() >= Date.now()) { exitReplay(); return null; }
      return next;
    });
  }

  function togglePlayback() {
    if (replayPlaying) {
      if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);
      replayIntervalRef.current = null;
      setReplayPlaying(false);
    } else {
      setReplayPlaying(true);
      replayIntervalRef.current = setInterval(() => {
        setReplayTimestamp(prev => {
          if (!prev) return prev;
          const next = new Date(prev.getTime() + 5 * 60_000); // 5 min per tick
          if (next.getTime() >= Date.now()) {
            if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);
            replayIntervalRef.current = null;
            setReplayPlaying(false);
            setReplayMode(false);
            return null;
          }
          return next;
        });
      }, 1500); // tick every 1.5 seconds
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (replayIntervalRef.current) clearInterval(replayIntervalRef.current); };
  }, []);

  // ============================================================
  // INCIDENT LIFECYCLE STATE (realtime-synced)
  // ============================================================

  const { incidents, loading: incidentsLoading, lastSync: incidentLastSync, refresh: refreshIncidents } = useRealtimeIncidents('LAX');
  const [showIncidentForm, setShowIncidentForm] = useState(false);
  const [incidentTransitioning, setIncidentTransitioning] = useState<string | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);

  // Incident form state
  const [incTitle, setIncTitle] = useState('');
  const [incSeverity, setIncSeverity] = useState<Severity>('HIGH');
  const [incZone, setIncZone] = useState('');
  const [incGate, setIncGate] = useState('');
  const [incDesc, setIncDesc] = useState('');
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [expandedInsight, setExpandedInsight] = useState<number | null>(null);
  const [incSubmitting, setIncSubmitting] = useState(false);

  useEffect(() => {
    fetchZones('LAX').then(setZones);
  }, []);

  // Auto-fill incident form zone when zone is selected
  useEffect(() => {
    if (selectedZoneId) setIncZone(selectedZoneId);
  }, [selectedZoneId]);

  async function handleCreateIncident() {
    if (!incTitle.trim()) return;
    setIncSubmitting(true);
    await createIncident({
      title: incTitle.trim(),
      severity: incSeverity,
      station: 'LAX',
      zone_id: incZone || undefined,
      gate_id: incGate || undefined,
      description: incDesc.trim() || undefined,
      created_by: operator.userId,
    });
    // Reset form
    setIncTitle('');
    setIncSeverity('HIGH');
    setIncZone('');
    setIncGate('');
    setIncDesc('');
    setShowIncidentForm(false);
    setIncSubmitting(false);
    // Eager refresh for the actor; other sessions get it via realtime
    refreshIncidents();
    refresh();
  }

  async function handleIncidentTransition(incidentId: string, newStatus: IncidentStatus) {
    setIncidentTransitioning(incidentId);
    await transitionIncident({
      incident_id: incidentId,
      new_status: newStatus,
      actor_id: operator.userId,
      actor_role: operator.role,
    });
    // Eager refresh for the actor; other sessions get it via realtime
    refreshIncidents();
    refresh();
    setIncidentTransitioning(null);
  }

  // ============================================================
  // RECOVERY ACTIONS (realtime-synced)
  // ============================================================

  const { actions: recoveryActions, refresh: refreshRecovery } = useRecoveryActions(selectedIncidentId);
  const [showRecoveryForm, setShowRecoveryForm] = useState(false);
  const [raSubmitting, setRaSubmitting] = useState(false);
  const [raTransitioning, setRaTransitioning] = useState<string | null>(null);

  async function handleCreateRecoveryAction(title: string, actionType: string, assignedTo: string, description: string) {
    if (!title || !selectedIncidentId) return;
    setRaSubmitting(true);
    await createRecoveryAction({
      incident_id: selectedIncidentId,
      title,
      action_type: actionType || undefined,
      proposed_by: operator.userId,
      assigned_to: assignedTo || undefined,
      description: description || undefined,
    });
    setShowRecoveryForm(false);
    setRaSubmitting(false);
    refreshRecovery();
    refresh();
  }

  async function handleRecoveryTransition(actionId: string, newStatus: RecoveryActionStatus) {
    setRaTransitioning(actionId);
    await transitionRecoveryAction({
      action_id: actionId,
      new_status: newStatus,
      actor_id: operator.userId,
      actor_role: operator.role,
    });
    refreshRecovery();
    refresh();
    setRaTransitioning(null);
  }

  // Gates for the selected zone
  const gatesForZone = incZone
    ? zones.find(z => z.id === incZone)?.gate_ids ?? []
    : zones.flatMap(z => z.gate_ids);

  // Track new event IDs for pulse animation
  useEffect(() => {
    const currentIds = new Set(events.map(e => e.id));
    const prev = prevIdsRef.current;
    if (prev.size > 0) {
      const fresh = new Set<string>();
      currentIds.forEach(id => {
        if (!prev.has(id)) fresh.add(id);
      });
      if (fresh.size > 0) {
        setNewIds(existing => {
          const merged = new Set(existing);
          fresh.forEach(id => merged.add(id));
          return merged;
        });
        // Clear after animation
        setTimeout(() => {
          setNewIds(existing => {
            const next = new Set(existing);
            fresh.forEach(id => next.delete(id));
            return next;
          });
        }, 2000);
      }
    }
    prevIdsRef.current = currentIds;
  }, [events]);

  // ============================================================
  // TEMPORAL FILTER + LIFECYCLE RECONSTRUCTION (replay mode)
  // ============================================================
  // When replay is active:
  //   1. Filter events to those before replay timestamp
  //   2. Reconstruct historical incident/recovery states from lifecycle events
  //   3. Pass reconstructed data through the same derivation pipeline
  // Live mode passes data through unchanged.

  const asOf = replayMode && replayTimestamp ? replayTimestamp : undefined;
  const replayCutoff = replayTimestamp?.getTime() ?? Infinity;

  const temporalEvents = replayMode
    ? events.filter(e => new Date(e.created_at).getTime() <= replayCutoff)
    : events;

  const temporalIncidents = replayMode && replayTimestamp
    ? reconstructIncidents(incidents, events, replayTimestamp)
    : incidents;

  const temporalRecoveryActions = replayMode && replayTimestamp
    ? reconstructRecoveryActions(recoveryActions, events, replayTimestamp)
    : recoveryActions;

  // ============================================================
  // DERIVED STATE (from derived-operational-state.ts)
  // ============================================================

  const ds = deriveDashboardState(temporalEvents, asOf);
  const { summary, filterOptions, patterns, attentionEvents, insights } = ds;
  const { resolutionLatency } = summary;

  // ============================================================
  // FILTERS
  // ============================================================

  function setFilter(key: FilterKey, val: string) {
    setFilters(f => ({ ...f, [key]: val }));
  }

  // ============================================================
  // ZONE-SCOPED DATA
  // ============================================================

  const selectedZone = selectedZoneId ? zones.find(z => z.id === selectedZoneId) ?? null : null;
  const selectedZoneGates = selectedZone?.gate_ids ?? [];

  const zoneScopedEvents = selectedZoneId
    ? temporalEvents.filter(e => e.gate_id && selectedZoneGates.includes(e.gate_id))
    : temporalEvents;

  const zoneScopedIncidents = selectedZoneId
    ? temporalIncidents.filter(i => i.zone_id === selectedZoneId || (i.gate_id && selectedZoneGates.includes(i.gate_id)))
    : temporalIncidents;

  const zoneDerivedState = selectedZoneId ? deriveDashboardState(zoneScopedEvents, asOf) : ds;
  const zoneSummary = selectedZoneId ? zoneDerivedState.summary : summary;
  const zoneAttentionEvents = selectedZoneId ? zoneDerivedState.attentionEvents : attentionEvents;
  const zonePatterns = selectedZoneId ? zoneDerivedState.patterns : patterns;
  const zoneFilterOptions = selectedZoneId ? zoneDerivedState.filterOptions : filterOptions;
  const zoneResolutionLatency = zoneSummary.resolutionLatency;

  // ── Pattern Engine ──
  const patternOutput = analyzeOperationalPatterns(zoneScopedEvents, zoneScopedIncidents, temporalRecoveryActions, asOf);
  const patternInsights = patternOutput.insights;
  const { trends } = patternOutput;

  // ── Workforce Coordination ──
  const workforce = deriveWorkforceCoordination(temporalIncidents, temporalRecoveryActions, temporalEvents, asOf);

  // ── Institutional Memory + Shift Context ──
  const institutionalMemory = deriveInstitutionalMemory(temporalIncidents, temporalRecoveryActions, temporalEvents, asOf);
  const shiftContext = deriveShiftContext(operator.userId, operator.shiftWindow, temporalIncidents, temporalEvents, asOf);

  // ── Anticipatory Cognition ──
  const anticipatory = deriveAnticipatoryState(temporalIncidents, temporalRecoveryActions, temporalEvents, asOf);

  // ── Operational Narratives ──
  const narratives = generateOperationalNarratives(temporalIncidents, temporalRecoveryActions, temporalEvents, anticipatory.stability, shiftContext, asOf);

  // ── Operational Outcomes + Recommendations ──
  const outcomes = deriveOperationalOutcomes(temporalIncidents, temporalRecoveryActions, temporalEvents, asOf);
  const recommendations = deriveRecommendations(
    zoneScopedIncidents, temporalIncidents, temporalRecoveryActions, temporalEvents, asOf
  );

  // ── SOI Intelligence Core ──
  let soiRecommendations: SoiRecommendation[] = [];
  let dispatchPlan = { actions: [] as import('@/lib/soi-intelligence').RankedAction[], summary: '', totalEstimatedMinutes: 0 };
  let operationalAssessment: import('@/lib/soi-intelligence').OperationalAssessment = {
    timestamp: new Date().toISOString(), zoneAssessments: [], globalPressure: 0,
    globalStability: 'stable', summary: '', topPressureSources: [],
  };
  try {
    soiRecommendations = generateRecommendations(
      temporalEvents, temporalIncidents, temporalRecoveryActions, zones, asOf
    );
    dispatchPlan = rankRecommendations(soiRecommendations, temporalIncidents, temporalRecoveryActions);
    operationalAssessment = assessOperation(temporalEvents, temporalIncidents, temporalRecoveryActions, zones, asOf);
  } catch (err) {
    console.error('[SOI Intelligence] derivation error:', err);
  }

  const filteredEvents = filterEvents(zoneScopedEvents, filters);
  const filteredOpen = filterEvents(zoneScopedEvents.filter(isOpen), filters);
  const currentFilterCount = countActiveFilters(filters);

  // ============================================================
  // ACTIONS
  // ============================================================

  async function handleStatus(eventId: string, status: OperationalStatus, ev: React.MouseEvent) {
    ev.stopPropagation();
    setUpdatingId(eventId);
    await updateEventStatus(eventId, status);
    refresh();
    setUpdatingId(null);
  }

  // ── SOI Command Handler ──
  function handleCommand(raw: string) {
    const intent = parseCommand(raw);
    switch (intent.type) {
      case 'summarize_operation': {
        setCopilotAnswer(null);
        setCommandResponse([
          operationalAssessment.summary,
          ...operationalAssessment.topPressureSources.slice(0, 3).map(ps => `· ${ps.description}`),
        ]);
        break;
      }
      case 'explain_instability': {
        setCopilotAnswer(null);
        const zoneId = resolveZonePattern(intent.target, zones);
        if (zoneId) {
          const lines = explainInstability(zoneId, zones, temporalEvents, temporalIncidents, temporalRecoveryActions, asOf);
          setCommandResponse(lines);
        } else {
          setCommandResponse([`Could not resolve "${intent.target}" to a known zone or gate.`]);
        }
        break;
      }
      case 'recommend_recovery': {
        setCopilotAnswer(null);
        if (soiRecommendations.length === 0) {
          setCommandResponse(['No recovery recommendations at this time. Operation is within normal parameters.']);
        } else {
          setView('intelligence');
          setCommandResponse(null);
        }
        break;
      }
      case 'show_zone': {
        setCopilotAnswer(null);
        const zoneId = resolveZonePattern(intent.zonePattern, zones);
        if (zoneId) {
          setSelectedZoneId(zoneId);
          setCommandResponse([`Focused on zone: ${zones.find(z => z.id === zoneId)?.label ?? zoneId}`]);
        } else {
          setCommandResponse([`Could not resolve "${intent.zonePattern}" to a known zone.`]);
        }
        break;
      }
      case 'show_recommendations': {
        setCopilotAnswer(null);
        setView('intelligence');
        setCommandResponse(null);
        break;
      }
      case 'show_cascades': {
        setCopilotAnswer(null);
        const cascades = operationalAssessment.zoneAssessments.filter(z => z.stability === 'critical' || z.stability === 'unstable');
        if (cascades.length === 0) {
          setCommandResponse(['No active cascades detected.']);
        } else {
          setCommandResponse([
            `${cascades.length} zone${cascades.length > 1 ? 's' : ''} under pressure:`,
            ...cascades.map(z => `· ${z.zoneLabel}: ${z.stability} (${z.unresolvedCount} incidents, pressure ${z.pressure}/100)`),
          ]);
        }
        break;
      }
      case 'what_if': {
        setCopilotAnswer(null);
        setCommandResponse([`What-if simulation: ${intent.action} → ${intent.target}. Use the intelligence panel to run detailed simulations.`]);
        setView('intelligence');
        break;
      }
      default: {
        // Try agentic intent first
        const agenticParsed = parseAgenticIntent(raw, zones);

        if (agenticParsed.intent === 'execute_plan' && cmdMemory.activePlan) {
          handleApprovePlan();
          break;
        }
        if (agenticParsed.intent === 'cancel_plan') {
          setCmdMemory(clearCommandMemory(cmdMemory));
          setCommandResponse(['Execution plan cancelled.']);
          setCopilotAnswer(null);
          break;
        }
        if (agenticParsed.intent === 'show_plan_status') {
          if (liveExec && isExecutionActive(liveExec)) {
            const prog = executionProgressSummary(liveExec);
            setCommandResponse([
              `Execution: ${prog.completed}/${prog.total} steps (${prog.percentage}%)`,
              `Phase: ${liveExec.phase}`,
              ...(prog.failed > 0 ? [`${prog.failed} steps failed`] : []),
              ...(prog.stalled > 0 ? [`${prog.stalled} steps stalled`] : []),
            ]);
          } else if (cmdMemory.activePlan) {
            setCommandResponse([`Plan staged: ${cmdMemory.activePlan.summary}`, 'Say "execute" or "approve" to begin.']);
          } else {
            setCommandResponse(['No active plan. Give an operational objective like "stabilize 52A-C".']);
          }
          setCopilotAnswer(null);
          break;
        }
        if (agenticParsed.intent === 'show_alternatives' && cmdMemory.activePlan) {
          const altPlan = buildAlternativePlan(
            cmdMemory.activePlan.objective, operationalAssessment,
            soiRecommendations, temporalIncidents, temporalRecoveryActions,
          );
          setCmdMemory(stagePlan(cmdMemory, altPlan, altPlan.objective, operationalAssessment));
          setCommandResponse(null);
          setCopilotAnswer(null);
          break;
        }
        if (agenticParsed.intent === 'continue_recovery' && liveExec && isExecutionActive(liveExec)) {
          setCommandResponse(['Recovery chain is progressing. Use the live execution panel to monitor.']);
          setCopilotAnswer(null);
          break;
        }

        if (agenticParsed.intent && agenticParsed.intent !== 'execute_plan') {
          // Build execution plan from agentic intent
          const objective = buildObjective(agenticParsed, operationalAssessment, zones);
          const plan = buildExecutionPlan(
            objective, operationalAssessment,
            soiRecommendations, temporalIncidents, temporalRecoveryActions,
          );
          const auth = authorizeExecution(plan.steps, operator.viewerRole as 'coordinator' | 'manager' | 'ops_director');

          setCmdMemory(stagePlan(cmdMemory, plan, objective, operationalAssessment));
          setCommandResponse(null);
          setCopilotAnswer(null);

          if (!auth.authorized && auth.deniedReasons.length > 0) {
            setCommandResponse([
              `Plan staged with ${auth.deniedSteps.length} restricted step${auth.deniedSteps.length > 1 ? 's' : ''}:`,
              ...auth.deniedReasons.map(r => `· ${r}`),
              ...(auth.escalationPath ? [`Escalation: ${auth.escalationPath}`] : []),
            ]);
          }
          break;
        }

        // Copilot fallback: route through context-aware operational reasoning
        setCommandResponse(null);
        const result = answerOperationalQuestion(raw, {
          assessment: operationalAssessment,
          recommendations: soiRecommendations,
          dispatchPlan,
          activeIncidentCount: temporalIncidents.filter(i => i.status !== 'RESOLVED' && i.status !== 'CLOSED').length,
          activeRecoveryCount: temporalRecoveryActions.filter(ra => ra.status === 'ACTIVE' || ra.status === 'ACKNOWLEDGED').length,
        }, zones, conversationMemory, true);
        setCopilotAnswer(result.answer);
        setConversationMemory(result.updatedMemory);
        setLastInferredFrom(result.inferredFrom);
      }
    }
    setCommandInput('');
  }

  // ── Approve SOI Recommendation → create recovery action ──
  async function handleApproveRecommendation(rec: SoiRecommendation) {
    const incidentId = rec.primaryIncidentId;
    if (!incidentId) {
      setApproveResult(prev => ({ ...prev, [rec.id]: 'error' }));
      return;
    }

    // Check for existing active/proposed recovery on this incident
    const existingRA = temporalRecoveryActions.find(ra =>
      ra.incident_id === incidentId &&
      (ra.status === 'PROPOSED' || ra.status === 'ACKNOWLEDGED' || ra.status === 'ACTIVE')
    );
    if (existingRA) {
      setApproveResult(prev => ({ ...prev, [rec.id]: 'duplicate' }));
      return;
    }

    setApprovingRecId(rec.id);
    const topAction = rec.recommendedActions[0];
    const result = await createRecoveryAction({
      incident_id: incidentId,
      title: rec.title,
      action_type: topAction?.type === 'dispatch_agent' ? 'DISPATCH'
        : topAction?.type === 'reassign_equipment' ? 'EQUIPMENT_SWAP'
        : topAction?.type === 'escalate_support' ? 'ESCALATION'
        : 'OTHER',
      severity: rec.severity === 'critical' ? 'CRITICAL' : rec.severity === 'high' ? 'HIGH' : 'MEDIUM',
      proposed_by: operator.userId,
      zone_id: rec.affectedZone,
      gate_id: rec.affectedGate ?? undefined,
      description: `SOI recommendation: ${rec.summary}`,
    });

    setApprovingRecId(null);
    setApproveResult(prev => ({ ...prev, [rec.id]: result ? 'success' : 'error' }));
    refreshRecovery();
    refresh();
  }

  // ── Live Execution Engine ──
  async function handleApprovePlan() {
    if (!cmdMemory.activePlan) return;
    let exec = createLiveExecution(cmdMemory.activePlan);
    exec = approveLiveExecution(exec);
    setLiveExec(exec);
    setAdaptiveRecs([]);

    // Dispatch all steps sequentially with live state updates
    const plan = cmdMemory.activePlan;
    for (let i = 0; i < plan.steps.length; i++) {
      exec = await liveDispatchNext(exec, plan, operator.userId, operator.role);
      setLiveExec({ ...exec });
    }

    // Start tick interval for step progression
    startExecutionTick(plan);
  }

  function startExecutionTick(plan: ExecutionPlan) {
    if (liveExecTickRef.current) clearInterval(liveExecTickRef.current);
    liveExecTickRef.current = setInterval(() => {
      setLiveExec(prev => {
        if (!prev || !isExecutionActive(prev)) {
          if (liveExecTickRef.current) clearInterval(liveExecTickRef.current);
          return prev;
        }
        const next = tickExecution(prev, plan);

        // Chain health monitoring
        if (cmdMemory.preExecutionAssessment) {
          const report = evaluateChainHealth(next, cmdMemory.preExecutionAssessment, operationalAssessment);
          const recs = generateAdaptiveRecommendations(report, next);
          if (recs.length > 0) setAdaptiveRecs(recs);
        }

        // Auto-complete: clear plan when execution terminal
        if (next.phase === 'completed' || next.phase === 'failed') {
          if (liveExecTickRef.current) clearInterval(liveExecTickRef.current);
          setCmdMemory(prev2 => completePlan(prev2));
          refreshRecovery();
          refresh();
        }
        return next;
      });
    }, 2000);
  }

  // Cleanup tick on unmount
  useEffect(() => {
    return () => { if (liveExecTickRef.current) clearInterval(liveExecTickRef.current); };
  }, []);

  // EventCard — extracted to components/soi/EventCard.tsx

  // ============================================================
  // FEED VIEW
  // ============================================================

  function renderFeed() {
    return (
      <>
        {renderFilterBar()}
        {filteredEvents.length === 0 && (
          <div className="rq-quiet" style={{ padding: '24px 16px' }}>
            {events.length === 0 ? 'No events yet — waiting for agent signals' : 'No events match filters'}
          </div>
        )}
        {filteredEvents.map(e => <EventCard key={e.id} event={e} showAging isExpanded={expandedId === e.id} isUpdating={updatingId === e.id} isNew={newIds.has(e.id)} onToggleExpand={() => setExpandedId(expandedId === e.id ? null : e.id)} onStatusChange={handleStatus} />)}
      </>
    );
  }

  // ============================================================
  // UNRESOLVED VIEW — grouped by aging band
  // ============================================================

  function renderUnresolved() {
    // Apply filters to the pre-computed aging groups
    const filteredOpenEvents = filterEvents(events.filter(isOpen), filters);
    const agingGroups = groupByAging(sortBySeverityThenAge(filteredOpenEvents));

    return (
      <>
        {renderFilterBar()}
        {filteredOpenEvents.length === 0 && (
          <div className="rq-quiet" style={{ padding: '24px 16px' }}>All clear — no unresolved events</div>
        )}

        {agingGroups.map(group => (
          <div key={group.cssClass}>
            <div className={`rq-age-group ${group.cssClass}`}>
              <div className="rq-age-dot" />
              <span>{group.label}</span>
            </div>
            {group.events.map(e => <EventCard key={e.id} event={e} showAging isExpanded={expandedId === e.id} isUpdating={updatingId === e.id} isNew={newIds.has(e.id)} onToggleExpand={() => setExpandedId(expandedId === e.id ? null : e.id)} onStatusChange={handleStatus} />)}
          </div>
        ))}
      </>
    );
  }

  // ============================================================
  // PATTERNS VIEW
  // ============================================================

  function renderPatterns() {
    if (zoneScopedEvents.length === 0) {
      return <div className="rq-quiet" style={{ padding: '24px 16px' }}>No data yet</div>;
    }

    const { byType, byGate, byEquipment, byShift } = zonePatterns;
    const { avg: avgRes, p50: p50Res, p90: p90Res } = zoneResolutionLatency;

    return (
      <>
        {/* Resolution latency stats */}
        <div className="rq-eyebrow">Resolution latency</div>
        <div className="rq-latency-bar">
          <div className="rq-latency-cell">
            <div className="rq-latency-val" style={{ color: avgRes != null && avgRes > 900 ? 'var(--rq-red)' : 'var(--rq-ink)' }}>
              {avgRes != null ? durationLabel(avgRes) : '--'}
            </div>
            <div className="rq-latency-lbl">Avg</div>
          </div>
          <div className="rq-latency-cell">
            <div className="rq-latency-val">{p50Res != null ? durationLabel(p50Res) : '--'}</div>
            <div className="rq-latency-lbl">P50</div>
          </div>
          <div className="rq-latency-cell">
            <div className="rq-latency-val" style={{ color: p90Res != null && p90Res > 1200 ? 'var(--rq-amber)' : 'var(--rq-ink)' }}>
              {p90Res != null ? durationLabel(p90Res) : '--'}
            </div>
            <div className="rq-latency-lbl">P90</div>
          </div>
        </div>

        {/* By event type */}
        {byType.length > 0 && (
          <>
            <div className="rq-eyebrow">By event type</div>
            {byType.map(d => (
              <div className="rq-pat-row" key={d.key}>
                <div className="rq-pat-label">{d.key.replace(/_/g, ' ')}</div>
                <div className="rq-pat-bar-track">
                  <div className="rq-pat-bar-fill" style={{
                    width: `${d.proportion * 100}%`,
                    background: 'var(--rq-accent)',
                  }} />
                </div>
                <div className="rq-pat-count">{d.count}</div>
                <div className="rq-pat-avg">
                  {d.avgResolution != null ? `avg ${durationLabel(d.avgResolution)}` : ''}
                </div>
              </div>
            ))}
          </>
        )}

        {/* By gate */}
        {byGate.length > 0 && (
          <>
            <div className="rq-eyebrow">By gate</div>
            {byGate.map(d => (
              <div className="rq-pat-row" key={d.key}>
                <div className="rq-pat-label">Gate {d.key}</div>
                <div className="rq-pat-bar-track">
                  <div className="rq-pat-bar-fill" style={{
                    width: `${d.proportion * 100}%`,
                    background: 'var(--rq-blue)',
                  }} />
                </div>
                <div className="rq-pat-count">{d.count}</div>
                <div className="rq-pat-avg" />
              </div>
            ))}
          </>
        )}

        {/* By equipment */}
        {byEquipment.length > 0 && (
          <>
            <div className="rq-eyebrow">By equipment</div>
            {byEquipment.map(d => (
              <div className="rq-pat-row" key={d.key}>
                <div className="rq-pat-label">{d.key}</div>
                <div className="rq-pat-bar-track">
                  <div className="rq-pat-bar-fill" style={{
                    width: `${d.proportion * 100}%`,
                    background: 'var(--rq-amber)',
                  }} />
                </div>
                <div className="rq-pat-count">{d.count}</div>
                <div className="rq-pat-avg" />
              </div>
            ))}
          </>
        )}

        {/* By shift */}
        {byShift.length > 0 && (
          <>
            <div className="rq-eyebrow">By shift</div>
            {byShift.map(d => (
              <div className="rq-pat-row" key={d.key}>
                <div className="rq-pat-label">{d.key}</div>
                <div className="rq-pat-bar-track">
                  <div className="rq-pat-bar-fill" style={{
                    width: `${d.proportion * 100}%`,
                    background: 'var(--rq-green)',
                  }} />
                </div>
                <div className="rq-pat-count">{d.count}</div>
                <div className="rq-pat-avg" />
              </div>
            ))}
          </>
        )}
      </>
    );
  }

  // ============================================================
  // INCIDENTS VIEW
  // ============================================================

  function renderIncidents() {
    const monoSm: React.CSSProperties = {
      fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
      letterSpacing: '.06em', textTransform: 'uppercase',
    };

    return (
      <>
        {/* Create incident toggle */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--rq-line)' }}>
          <button
            className="rq-btn-secondary"
            style={{ width: '100%' }}
            onClick={() => setShowIncidentForm(!showIncidentForm)}
          >
            {showIncidentForm ? 'Cancel' : '+ Report Incident'}
          </button>
        </div>

        {/* Inline creation form */}
        {showIncidentForm && (
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid var(--rq-line)',
            background: 'var(--rq-bg-1)',
          }}>
            <div style={{ marginBottom: 8 }}>
              <label style={{ ...monoSm, color: 'var(--rq-ink-4)', display: 'block', marginBottom: 4 }}>Title</label>
              <input
                type="text"
                value={incTitle}
                onChange={e => setIncTitle(e.target.value)}
                placeholder="e.g., Belt loader failure at 52A"
                style={{
                  width: '100%', padding: '8px 10px',
                  background: 'var(--rq-bg-2)', border: '1px solid var(--rq-line-2)',
                  color: 'var(--rq-ink)', fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 12, borderRadius: 3,
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div>
                <label style={{ ...monoSm, color: 'var(--rq-ink-4)', display: 'block', marginBottom: 4 }}>Severity</label>
                <select
                  value={incSeverity}
                  onChange={e => setIncSeverity(e.target.value as Severity)}
                  style={{
                    width: '100%', padding: '8px 10px',
                    background: 'var(--rq-bg-2)', border: '1px solid var(--rq-line-2)',
                    color: 'var(--rq-ink)', fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 12, borderRadius: 3,
                  }}
                >
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </div>
              <div>
                <label style={{ ...monoSm, color: 'var(--rq-ink-4)', display: 'block', marginBottom: 4 }}>Zone</label>
                <select
                  value={incZone}
                  onChange={e => { setIncZone(e.target.value); setIncGate(''); }}
                  style={{
                    width: '100%', padding: '8px 10px',
                    background: 'var(--rq-bg-2)', border: '1px solid var(--rq-line-2)',
                    color: 'var(--rq-ink)', fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 12, borderRadius: 3,
                  }}
                >
                  <option value="">—</option>
                  {zones.map(z => <option key={z.id} value={z.id}>{z.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ ...monoSm, color: 'var(--rq-ink-4)', display: 'block', marginBottom: 4 }}>Gate</label>
                <select
                  value={incGate}
                  onChange={e => setIncGate(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 10px',
                    background: 'var(--rq-bg-2)', border: '1px solid var(--rq-line-2)',
                    color: 'var(--rq-ink)', fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 12, borderRadius: 3,
                  }}
                >
                  <option value="">—</option>
                  {gatesForZone.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ ...monoSm, color: 'var(--rq-ink-4)', display: 'block', marginBottom: 4 }}>Description</label>
              <input
                type="text"
                value={incDesc}
                onChange={e => setIncDesc(e.target.value)}
                placeholder="Optional details"
                style={{
                  width: '100%', padding: '8px 10px',
                  background: 'var(--rq-bg-2)', border: '1px solid var(--rq-line-2)',
                  color: 'var(--rq-ink)', fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 12, borderRadius: 3,
                }}
              />
            </div>

            <button
              className="rq-qbtn qb-resolve"
              style={{ width: '100%', padding: '10px' }}
              disabled={!incTitle.trim() || incSubmitting}
              onClick={handleCreateIncident}
            >
              {incSubmitting ? 'Creating...' : 'Create Incident'}
            </button>
          </div>
        )}

        {/* Active incidents list (zone-scoped) */}
        {incidentsLoading && zoneScopedIncidents.length === 0 && (
          <div className="rq-quiet" style={{ padding: '24px 16px' }}>Loading incidents...</div>
        )}
        {!incidentsLoading && zoneScopedIncidents.length === 0 && (
          <div className="rq-quiet" style={{ padding: '24px 16px' }}>
            {selectedZoneId ? 'No active incidents in this zone' : 'No active incidents'}
          </div>
        )}

        {zoneScopedIncidents.map(inc => (
          <IncidentCard
            key={inc.id}
            incident={inc}
            isTransitioning={incidentTransitioning === inc.id}
            onTransition={handleIncidentTransition}
            onClick={() => setSelectedIncidentId(selectedIncidentId === inc.id ? null : inc.id)}
            isSelected={selectedIncidentId === inc.id}
          />
        ))}
      </>
    );
  }

  // ============================================================
  // FILTER BAR
  // ============================================================

  function renderFilterBar() {
    return (
      <>
        {/* Severity + Status row */}
        <div className="rq-filters">
          {(['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map(s => (
            <button key={s} className={`rq-chip${filters.severity === s ? ' active' : ''}`}
              onClick={() => setFilter('severity', s)}>
              {s}
            </button>
          ))}
          <span style={{ width: 1, background: 'var(--rq-line)', margin: '0 2px' }} />
          {(['ALL', 'OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'] as const).map(s => (
            <button key={s} className={`rq-chip${filters.status === s ? ' active' : ''}`}
              onClick={() => setFilter('status', s)}>
              {s === 'IN_PROGRESS' ? 'IN PROG' : s}
            </button>
          ))}
        </div>

        {/* Gate / Equipment / Shift row — only if there's data */}
        {(zoneFilterOptions.gates.length > 0 || zoneFilterOptions.equipment.length > 0 || zoneFilterOptions.shifts.length > 0) && (
          <div className="rq-filters">
            {zoneFilterOptions.gates.length > 0 && (
              <>
                {['ALL', ...zoneFilterOptions.gates].map(g => (
                  <button key={`g-${g}`} className={`rq-chip${filters.gate === g ? ' active' : ''}`}
                    onClick={() => setFilter('gate', g)}>
                    {g === 'ALL' ? 'All Gates' : g}
                  </button>
                ))}
                {(zoneFilterOptions.equipment.length > 0 || zoneFilterOptions.shifts.length > 0) && (
                  <span style={{ width: 1, background: 'var(--rq-line)', margin: '0 2px' }} />
                )}
              </>
            )}
            {zoneFilterOptions.equipment.length > 0 && (
              <>
                {['ALL', ...zoneFilterOptions.equipment].map(eq => (
                  <button key={`e-${eq}`} className={`rq-chip${filters.equipment === eq ? ' active' : ''}`}
                    onClick={() => setFilter('equipment', eq)}>
                    {eq === 'ALL' ? 'All Equip' : eq}
                  </button>
                ))}
                {zoneFilterOptions.shifts.length > 0 && (
                  <span style={{ width: 1, background: 'var(--rq-line)', margin: '0 2px' }} />
                )}
              </>
            )}
            {zoneFilterOptions.shifts.length > 0 && (
              <>
                {['ALL', ...zoneFilterOptions.shifts].map(sh => (
                  <button key={`s-${sh}`} className={`rq-chip${filters.shift === sh ? ' active' : ''}`}
                    onClick={() => setFilter('shift', sh)}>
                    {sh === 'ALL' ? 'All Shifts' : sh}
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        {/* Active filter count indicator */}
        {currentFilterCount > 0 && (
          <div style={{
            padding: '4px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'var(--rq-ink-4)' }}>
              {currentFilterCount} filter{currentFilterCount > 1 ? 's' : ''} active
            </span>
            <button
              onClick={() => setFilters(EMPTY_FILTERS)}
              style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                color: 'var(--rq-accent)', background: 'none', border: 'none',
                cursor: 'pointer', letterSpacing: '.08em', textTransform: 'uppercase' as const,
              }}
            >
              Clear
            </button>
          </div>
        )}
      </>
    );
  }

  // ============================================================
  // INTELLIGENCE VIEW
  // ============================================================

  function renderIntelligence() {
    const mono: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };

    return (
      <>
        {/* Assessment banner */}
        <div style={{
          margin: '8px 16px', padding: '10px 12px',
          background: operationalAssessment.globalStability === 'critical' ? 'rgba(255,92,92,.06)' :
            operationalAssessment.globalStability === 'unstable' ? 'rgba(245,177,61,.06)' : 'var(--rq-bg-1)',
          borderLeft: `3px solid ${operationalAssessment.globalStability === 'critical' ? 'var(--rq-red)' :
            operationalAssessment.globalStability === 'unstable' ? 'var(--rq-amber)' :
            operationalAssessment.globalStability === 'degrading' ? 'var(--rq-amber)' : 'var(--rq-green)'}`,
        }}>
          <div style={{ ...mono, fontSize: 8, color: 'var(--rq-ink-4)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 4 }}>
            SOI Assessment
          </div>
          <div style={{ fontSize: 12, color: 'var(--rq-ink)', lineHeight: 1.4 }}>
            {operationalAssessment.summary}
          </div>
        </div>

        {/* Dispatch plan summary */}
        {dispatchPlan.actions.length > 0 && (
          <div style={{ margin: '0 16px 4px', ...mono, fontSize: 8, color: 'var(--rq-ink-3)', letterSpacing: '.06em' }}>
            {dispatchPlan.summary} &middot; est. {dispatchPlan.totalEstimatedMinutes}m total stabilization
          </div>
        )}

        {/* Recommendations */}
        {dispatchPlan.actions.length === 0 && (
          <div className="rq-quiet" style={{ padding: '24px 16px', fontSize: 11 }}>
            No recovery recommendations at this time. Operation is within normal parameters.
          </div>
        )}

        {dispatchPlan.actions.map(({ recommendation: rec, rank, urgencyScore, reasoning: urgencyReason }) => {
          const sevColor = rec.severity === 'critical' ? 'var(--rq-red)' :
            rec.severity === 'high' ? 'var(--rq-amber)' : 'var(--rq-blue)';
          const isApproving = approvingRecId === rec.id;

          return (
            <div key={rec.id} style={{
              margin: '6px 16px', padding: '10px 12px',
              background: 'var(--rq-bg-1)', border: '1px solid var(--rq-line)',
              borderLeft: `3px solid ${sevColor}`,
            }}>
              {/* Header: rank + title + severity */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{
                  ...mono, fontSize: 9, fontWeight: 700, color: sevColor,
                  width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `1px solid ${sevColor}`, flexShrink: 0, opacity: 0.7,
                }}>
                  {rank}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--rq-ink)', flex: 1 }}>
                  {rec.title}
                </span>
                <span style={{
                  ...mono, fontSize: 8, letterSpacing: '.08em', textTransform: 'uppercase',
                  color: sevColor, padding: '2px 6px', border: `1px solid ${sevColor}`, opacity: 0.7,
                }}>
                  {rec.severity}
                </span>
              </div>

              {/* Summary */}
              <div style={{ fontSize: 11, color: 'var(--rq-ink-2)', lineHeight: 1.4, marginBottom: 6 }}>
                {rec.summary}
              </div>

              {/* Reasoning chain */}
              <div style={{ marginBottom: 6 }}>
                <div style={{ ...mono, fontSize: 8, color: 'var(--rq-ink-4)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 3 }}>
                  Reasoning
                </div>
                {rec.reasoning.map((r, i) => (
                  <div key={i} style={{ fontSize: 10, color: 'var(--rq-ink-3)', padding: '1px 0', lineHeight: 1.3 }}>
                    · {r}
                  </div>
                ))}
              </div>

              {/* Recommended actions */}
              <div style={{ marginBottom: 6 }}>
                <div style={{ ...mono, fontSize: 8, color: 'var(--rq-ink-4)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 3 }}>
                  Recovery Path
                </div>
                {rec.recommendedActions.map((a, i) => (
                  <div key={i} style={{
                    padding: '4px 8px', marginBottom: 2,
                    background: 'var(--rq-bg-2)', fontSize: 10, color: 'var(--rq-ink-2)', lineHeight: 1.3,
                  }}>
                    <div style={{ fontWeight: 600, color: 'var(--rq-ink)' }}>{a.label}</div>
                    <div style={{ fontSize: 9, color: 'var(--rq-ink-3)' }}>{a.expectedImpact}</div>
                  </div>
                ))}
              </div>

              {/* Metrics row: confidence + stabilization + preview */}
              <div style={{
                display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8,
                ...mono, fontSize: 9,
              }}>
                <div>
                  <span style={{ color: 'var(--rq-ink-4)' }}>confidence </span>
                  <span style={{ color: rec.confidence.score >= 70 ? 'var(--rq-green)' : rec.confidence.score >= 50 ? 'var(--rq-amber)' : 'var(--rq-ink-3)' }}>
                    {rec.confidence.score}%
                  </span>
                  <span style={{ color: 'var(--rq-ink-4)' }}> ({rec.confidence.label})</span>
                </div>
                <div>
                  <span style={{ color: 'var(--rq-ink-4)' }}>est. stabilization </span>
                  <span style={{ color: 'var(--rq-ink-2)' }}>{rec.estimatedStabilizationMinutes}m</span>
                </div>
              </div>

              {/* Preview: before/after pressure */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
                ...mono, fontSize: 9,
              }}>
                <span style={{ color: 'var(--rq-ink-4)' }}>pressure</span>
                <span style={{
                  color: rec.preview.beforePressure >= 60 ? 'var(--rq-red)' : 'var(--rq-amber)',
                }}>{rec.preview.beforePressure}</span>
                <span style={{ color: 'var(--rq-ink-4)' }}>→</span>
                <span style={{
                  color: rec.preview.afterPressure < 30 ? 'var(--rq-green)' : 'var(--rq-amber)',
                }}>{rec.preview.afterPressure}</span>
                <span style={{ color: 'var(--rq-ink-4)' }}>
                  (−{rec.preview.riskReducedBy}%)
                </span>
                {rec.preview.possibleTradeoffs.length > 0 && rec.preview.possibleTradeoffs[0] !== 'No significant tradeoffs identified' && (
                  <span style={{ color: 'var(--rq-ink-4)', fontSize: 8 }}>
                    ⚠ {rec.preview.possibleTradeoffs[0]}
                  </span>
                )}
              </div>

              {/* Confidence factors */}
              {rec.confidence.factors.length > 0 && (
                <div style={{ ...mono, fontSize: 8, color: 'var(--rq-ink-4)', marginBottom: 8 }}>
                  {rec.confidence.factors.join(' · ')}
                </div>
              )}

              {/* Simulation expansion */}
              {expandedSimId === rec.id && (
                <div style={{
                  padding: '8px 10px', marginBottom: 8,
                  background: 'var(--rq-bg-2)', border: '1px solid var(--rq-line)',
                }}>
                  <div style={{ ...mono, fontSize: 8, color: 'var(--rq-accent)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                    Simulation Result
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6, ...mono, fontSize: 10 }}>
                    <div>
                      <div style={{ fontSize: 8, color: 'var(--rq-ink-4)', marginBottom: 2 }}>Before Pressure</div>
                      <div style={{ color: rec.preview.beforePressure >= 60 ? 'var(--rq-red)' : 'var(--rq-amber)', fontWeight: 700, fontSize: 16 }}>
                        {rec.preview.beforePressure}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 8, color: 'var(--rq-ink-4)', marginBottom: 2 }}>Modeled After</div>
                      <div style={{ color: rec.preview.afterPressure < 30 ? 'var(--rq-green)' : rec.preview.afterPressure < 60 ? 'var(--rq-amber)' : 'var(--rq-red)', fontWeight: 700, fontSize: 16 }}>
                        {rec.preview.afterPressure}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 8, color: 'var(--rq-ink-4)', marginBottom: 2 }}>Risk Reduced</div>
                      <div style={{ color: 'var(--rq-green)', fontWeight: 700 }}>−{rec.preview.riskReducedBy}%</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 8, color: 'var(--rq-ink-4)', marginBottom: 2 }}>Est. Stabilization</div>
                      <div style={{ color: 'var(--rq-ink)', fontWeight: 700 }}>{rec.estimatedStabilizationMinutes}m</div>
                    </div>
                  </div>
                  {rec.preview.possibleTradeoffs.filter(t => t !== 'No significant tradeoffs identified').length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ ...mono, fontSize: 8, color: 'var(--rq-ink-4)', marginBottom: 2 }}>Tradeoffs</div>
                      {rec.preview.possibleTradeoffs.filter(t => t !== 'No significant tradeoffs identified').map((t, i) => (
                        <div key={i} style={{ fontSize: 9, color: 'var(--rq-amber)', lineHeight: 1.3 }}>· {t}</div>
                      ))}
                    </div>
                  )}
                  <div style={{ ...mono, fontSize: 7, color: 'var(--rq-ink-4)', textAlign: 'center' }}>
                    Deterministic modeled estimate — not live state change.
                  </div>
                </div>
              )}

              {/* Action buttons + result feedback */}
              {!replayMode && (
                <>
                  {approveResult[rec.id] === 'success' && (
                    <div style={{
                      ...mono, fontSize: 9, color: 'var(--rq-green)', padding: '4px 8px', marginBottom: 4,
                      background: 'rgba(62,213,152,.06)', border: '1px solid var(--rq-green-dim)',
                    }}>
                      Recovery approved and dispatched
                    </div>
                  )}
                  {approveResult[rec.id] === 'error' && (
                    <div style={{
                      ...mono, fontSize: 9, color: 'var(--rq-red)', padding: '4px 8px', marginBottom: 4,
                      background: 'rgba(255,92,92,.06)', border: '1px solid var(--rq-red-dim)',
                    }}>
                      {rec.primaryIncidentId ? 'Failed to create recovery action' : 'No valid incident to attach recovery action to'}
                    </div>
                  )}
                  {approveResult[rec.id] === 'duplicate' && (
                    <div style={{
                      ...mono, fontSize: 9, color: 'var(--rq-amber)', padding: '4px 8px', marginBottom: 4,
                      background: 'rgba(245,177,61,.06)', border: '1px solid var(--rq-amber-dim)',
                    }}>
                      Recovery already active for this incident — progress existing action instead
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button type="button"
                      disabled={isApproving || !rec.primaryIncidentId || approveResult[rec.id] === 'success'}
                      onClick={() => handleApproveRecommendation(rec)} style={{
                      flex: 2, padding: '5px 8px', ...mono, fontSize: 9, letterSpacing: '.06em',
                      background: approveResult[rec.id] === 'success' ? 'rgba(62,213,152,.06)' : isApproving ? 'var(--rq-bg-2)' : 'none',
                      border: `1px solid ${approveResult[rec.id] === 'success' ? 'var(--rq-green-dim)' : sevColor}`,
                      color: approveResult[rec.id] === 'success' ? 'var(--rq-green)' : sevColor,
                      cursor: isApproving || !rec.primaryIncidentId || approveResult[rec.id] === 'success' ? 'default' : 'pointer',
                      opacity: isApproving || !rec.primaryIncidentId ? 0.5 : 1,
                      textTransform: 'uppercase',
                    }}>
                      {isApproving ? 'Creating...' : approveResult[rec.id] === 'success' ? 'Dispatched' : 'Approve Recovery'}
                    </button>
                    <button type="button" onClick={() => {
                      setExpandedSimId(expandedSimId === rec.id ? null : rec.id);
                    }} style={{
                      flex: 1, padding: '5px 8px', ...mono, fontSize: 9, letterSpacing: '.06em',
                      background: expandedSimId === rec.id ? 'var(--rq-bg-2)' : 'none',
                      border: `1px solid ${expandedSimId === rec.id ? 'var(--rq-accent)' : 'var(--rq-line)'}`,
                      color: expandedSimId === rec.id ? 'var(--rq-accent)' : 'var(--rq-ink-3)',
                      cursor: 'pointer', textTransform: 'uppercase',
                    }}>
                      {expandedSimId === rec.id ? 'Close' : 'Simulate'}
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}

        <div style={{ ...mono, fontSize: 7, color: 'var(--rq-ink-4)', padding: '8px 16px', textAlign: 'center', letterSpacing: '.06em' }}>
          deterministic modeled estimates · not probabilistic predictions
        </div>
      </>
    );
  }

  // ============================================================
  // RENDER
  // ============================================================

  const selectedIncident = selectedIncidentId ? incidents.find(i => i.id === selectedIncidentId) ?? null : null;
  // Timeline: incident lifecycle events + recovery action events (shared correlation_id)
  const incidentCorrelationId = selectedIncident?.correlation_id ?? null;
  const incidentEvents = selectedIncidentId
    ? events.filter(e =>
        e.entity_id === selectedIncidentId ||
        (incidentCorrelationId && e.correlation_id === incidentCorrelationId)
      ).slice(0, 30)
    : [];

  // Triage-sorted incidents: zone-scoped, severity (CRITICAL first), then oldest first
  const triageIncidents = [...zoneScopedIncidents].sort((a, b) => {
    const sevRank: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    const sa = sevRank[a.severity] ?? 9;
    const sb = sevRank[b.severity] ?? 9;
    if (sa !== sb) return sa - sb;
    return new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime();
  });

  // Filtered event memory: zone-scoped lifecycle transitions + high-severity, newest first
  const eventMemory = zoneScopedEvents
    .filter(e => e.entity_type === 'incident' || e.entity_type === 'recovery_action' || e.severity === 'CRITICAL' || e.severity === 'HIGH' || isOpen(e))
    .slice(0, 20);

  return (
    <>
      {/* Command bar — full width */}
      <CommandBar
        station={selectedZone ? `LAX · ${selectedZone.label}` : 'LAX'}
        role={`${operator.displayName} · ${operator.role.replace(/_/g, ' ')}`}
        lastEventSync={lastUpdated}
        lastIncidentSync={incidentLastSync}
        activeIncidentCount={zoneScopedIncidents.length}
        openEventCount={zoneSummary.openCount}
      />

      {/* Stability + shift context + institutional memory */}
      {(anticipatory.stability.direction !== 'stable' || shiftContext.inheritedIncidentCount > 0 || institutionalMemory.recurringConditions.length > 0) && (
        <div style={{
          padding: '2px 16px', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
          borderBottom: '1px solid var(--rq-line)',
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {/* Stability direction — calm, not alarmist */}
          {anticipatory.stability.direction !== 'stable' && (
            <span style={{
              fontSize: 8, padding: '1px 6px', borderRadius: 2, letterSpacing: '.06em', textTransform: 'uppercase',
              color: anticipatory.stability.direction === 'acute' ? 'var(--rq-red)' :
                anticipatory.stability.direction === 'destabilizing' ? 'var(--rq-amber)' : 'var(--rq-green)',
              background: anticipatory.stability.direction === 'acute' ? 'rgba(255,92,92,.06)' :
                anticipatory.stability.direction === 'destabilizing' ? 'rgba(232,161,58,.06)' : 'rgba(62,213,152,.06)',
              border: `1px solid ${anticipatory.stability.direction === 'acute' ? 'rgba(255,92,92,.15)' :
                anticipatory.stability.direction === 'destabilizing' ? 'rgba(232,161,58,.15)' : 'rgba(62,213,152,.15)'}`,
            }}>
              {anticipatory.stability.direction}
            </span>
          )}
          {shiftContext.inheritedIncidentCount > 0 && (
            <span style={{ fontSize: 8, color: 'var(--rq-amber)' }}>
              {shiftContext.inheritedIncidentCount} inherited from prior shift
            </span>
          )}
          {institutionalMemory.recurringConditions.filter(c => c.significance === 'systemic').slice(0, 2).map((c, i) => (
            <span key={i} style={{
              fontSize: 8, padding: '1px 5px', borderRadius: 2,
              color: 'var(--rq-amber)', background: 'rgba(232,161,58,.06)',
              border: '1px solid rgba(232,161,58,.12)',
            }}>
              {c.condition}
            </span>
          ))}
          {institutionalMemory.shiftHandoff && institutionalMemory.shiftHandoff.handoffNotes.length > 0 && (
            <span style={{ fontSize: 8, color: 'var(--rq-ink-4)' }}>
              handoff: {institutionalMemory.shiftHandoff.handoffNotes[0]}
            </span>
          )}
        </div>
      )}

      {/* Workforce coordination strip (role-aware) */}
      {(workforce.escalations.length > 0 || workforce.summary.needsSupportCount > 0 || workforce.ownershipGaps.length > 0) && (
        <div style={{
          padding: '3px 16px', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
          borderBottom: '1px solid var(--rq-line)',
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {/* Escalation signals with action buttons */}
          {workforce.escalations.filter(e => e.severity === 'critical').slice(0, 2).map((esc, i) => (
            <span key={i} style={{
              fontSize: 8, padding: '2px 6px', borderRadius: 2,
              color: 'var(--rq-red)', background: 'rgba(255,92,92,.08)',
              border: '1px solid rgba(255,92,92,.2)',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              ⚠ {esc.title}
              {!replayMode && esc.incidentIds[0] && (
                <>
                  <button type="button" onClick={async () => {
                    await emitEscalationAction({ incident_id: esc.incidentIds[0], action: 'escalate_to_manager', actor_id: operator.userId, actor_role: operator.role, reason: esc.title });
                    refresh();
                  }} style={{ background: 'none', border: '1px solid rgba(255,92,92,.3)', color: 'var(--rq-red)', cursor: 'pointer', padding: '0 4px', fontSize: 7, fontFamily: 'inherit' }}>
                    escalate
                  </button>
                  <button type="button" onClick={async () => {
                    await emitEscalationAction({ incident_id: esc.incidentIds[0], action: 'acknowledge_continue', actor_id: operator.userId, actor_role: operator.role });
                    refresh();
                  }} style={{ background: 'none', border: '1px solid var(--rq-line)', color: 'var(--rq-ink-3)', cursor: 'pointer', padding: '0 4px', fontSize: 7, fontFamily: 'inherit' }}>
                    ack
                  </button>
                </>
              )}
            </span>
          ))}
          {workforce.escalations.filter(e => e.severity === 'alert').slice(0, 2).map((esc, i) => (
            <span key={`a${i}`} style={{
              fontSize: 8, padding: '2px 6px', borderRadius: 2,
              color: 'var(--rq-amber)', background: 'rgba(232,161,58,.08)',
              border: '1px solid rgba(232,161,58,.2)',
            }}>
              {esc.title}
            </span>
          ))}
          {/* Role-aware operator load summary */}
          {(operator.viewerRole === 'manager' || operator.viewerRole === 'ops_director') && workforce.summary.needsSupportCount > 0 && (
            <span style={{ fontSize: 8, color: 'var(--rq-red)' }}>
              {workforce.summary.needsSupportCount} coord. need support
            </span>
          )}
          {operator.viewerRole === 'coordinator' && workforce.operatorLoads.find(o => o.operatorId === operator.userId)?.saturation === 'needs_support' && (
            <span style={{ fontSize: 8, color: 'var(--rq-amber)' }}>
              workload elevated — request support
            </span>
          )}
          {(operator.viewerRole === 'manager' || operator.viewerRole === 'ops_director') && workforce.summary.saturatedCount > 0 && (
            <span style={{ fontSize: 8, color: 'var(--rq-amber)' }}>
              {workforce.summary.saturatedCount} elevated
            </span>
          )}
          {workforce.ownershipGaps.length > 0 && (
            <span style={{ fontSize: 8, color: 'var(--rq-ink-4)' }}>
              {workforce.ownershipGaps.length} gap{workforce.ownershipGaps.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* Replay controls */}
      {replayMode && replayTimestamp && (
        <div style={{
          padding: '4px 16px', display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(90,169,255,.06)', borderBottom: '1px solid rgba(90,169,255,.2)',
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          <span style={{ fontSize: 8, color: 'var(--rq-blue)', letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 700 }}>
            replay
          </span>
          <button type="button" onClick={() => stepReplay(-15)}
            style={{ background: 'none', border: '1px solid var(--rq-line)', color: 'var(--rq-ink-3)', cursor: 'pointer', padding: '2px 6px', fontSize: 9, fontFamily: 'inherit' }}>
            &laquo; 15m
          </button>
          <button type="button" onClick={() => stepReplay(-5)}
            style={{ background: 'none', border: '1px solid var(--rq-line)', color: 'var(--rq-ink-3)', cursor: 'pointer', padding: '2px 6px', fontSize: 9, fontFamily: 'inherit' }}>
            &lsaquo; 5m
          </button>
          <button type="button" onClick={togglePlayback}
            style={{ background: replayPlaying ? 'rgba(90,169,255,.15)' : 'none', border: '1px solid var(--rq-blue)', color: 'var(--rq-blue)', cursor: 'pointer', padding: '2px 8px', fontSize: 9, fontFamily: 'inherit' }}>
            {replayPlaying ? '⏸ pause' : '▶ play'}
          </button>
          <button type="button" onClick={() => stepReplay(5)}
            style={{ background: 'none', border: '1px solid var(--rq-line)', color: 'var(--rq-ink-3)', cursor: 'pointer', padding: '2px 6px', fontSize: 9, fontFamily: 'inherit' }}>
            5m &rsaquo;
          </button>
          <button type="button" onClick={() => stepReplay(15)}
            style={{ background: 'none', border: '1px solid var(--rq-line)', color: 'var(--rq-ink-3)', cursor: 'pointer', padding: '2px 6px', fontSize: 9, fontFamily: 'inherit' }}>
            15m &raquo;
          </button>
          <span style={{ fontSize: 11, color: 'var(--rq-blue)', fontWeight: 600, marginLeft: 4 }}>
            {replayTimestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
          </span>
          <span style={{ fontSize: 9, color: 'var(--rq-ink-4)' }}>
            {temporalEvents.length} ev · {temporalIncidents.length} inc
          </span>
          {/* Scrub bar */}
          {(() => {
            const twoH = Date.now() - 2 * 60 * 60_000;
            const scrubStart = Math.max(twoH, replayTimestamp.getTime() - 2 * 60 * 60_000);
            const scrubRange = Date.now() - scrubStart;
            const pctDone = scrubRange > 0 ? ((replayTimestamp.getTime() - scrubStart) / scrubRange) * 100 : 0;
            return (
              <div style={{ flex: 1, maxWidth: 200, height: 6, background: 'var(--rq-bg-3)', borderRadius: 3, cursor: 'pointer', position: 'relative' }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickPct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  setReplayTimestamp(new Date(scrubStart + clickPct * scrubRange));
                }}
              >
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3,
                  width: `${Math.max(0, Math.min(100, pctDone))}%`,
                  background: 'var(--rq-blue)', transition: 'width .15s',
                }} />
              </div>
            );
          })()}
          <button type="button" onClick={exitReplay}
            style={{ background: 'none', border: '1px solid var(--rq-line)', color: 'var(--rq-ink-3)', cursor: 'pointer', padding: '2px 8px', fontSize: 9, fontFamily: 'inherit' }}>
            exit replay
          </button>
        </div>
      )}

      {/* Three-panel grid */}
      <div className="rq-console-grid">

        {/* ── LEFT RAIL: Zone overview (interactive territory selector) ── */}
        <div className="rq-console-rail-left">
          <div className="rq-rail-header">
            <span>Zones</span>
            {selectedZoneId && (
              <button type="button" onClick={() => setSelectedZoneId(null)}
                style={{ background: 'none', border: 'none', color: 'var(--rq-accent)',
                  cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", fontSize: 9 }}>
                all
              </button>
            )}
          </div>
          {zones.length === 0 && (
            <div className="rq-quiet" style={{ padding: '12px', fontSize: 11 }}>No zones loaded</div>
          )}
          {zones.map(z => {
            // Derive zone pressure: open events (weighted by severity) + incidents
            const zoneEvents = events.filter(e => e.gate_id && z.gate_ids.includes(e.gate_id) && isOpen(e));
            const sevWeight: Record<string, number> = { CRITICAL: 20, HIGH: 15, MEDIUM: 8, LOW: 4 };
            const eventPressure = zoneEvents.reduce((sum, e) => sum + (sevWeight[e.severity] ?? 5), 0);
            const zoneIncs = incidents.filter(i => i.zone_id === z.id);
            const incPressure = zoneIncs.length * 25;
            const pressure = Math.min(100, eventPressure + incPressure);
            const isActive = selectedZoneId === z.id;
            return (
              <ZoneTile
                key={z.id}
                name={z.label}
                gateCount={z.gate_ids.length}
                pressure={pressure}
                incidentCount={zoneIncs.length}
                isActive={isActive}
                onClick={() => setSelectedZoneId(isActive ? null : z.id)}
              />
            );
          })}
        </div>

        {/* ── CENTER: Main operational surface ── */}
        <div className="rq-console-center">
          <div className="rq-ops-board">

            <KpiStrip summary={zoneSummary} />

            {/* Outcome metrics */}
            {(outcomes.aggregate.avgTotalResolution !== null || recommendations.some(r => r.type === 'zone_pressure_balance')) && (
              <div style={{
                margin: '0 16px 2px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {outcomes.aggregate.avgTotalResolution !== null && (
                  <span style={{ fontSize: 8, color: 'var(--rq-ink-4)' }}>avg resolution {outcomes.aggregate.avgTotalResolution}m</span>
                )}
                {outcomes.aggregate.recoverySuccessRate !== null && (
                  <span style={{ fontSize: 8, color: outcomes.aggregate.recoverySuccessRate >= 0.6 ? 'var(--rq-green)' : 'var(--rq-amber)' }}>
                    recovery {Math.round(outcomes.aggregate.recoverySuccessRate * 100)}%
                  </span>
                )}
                {recommendations.filter(r => r.type === 'zone_pressure_balance').map(rec => (
                  <span key={rec.id} style={{ fontSize: 8, padding: '1px 6px', borderRadius: 2,
                    color: 'var(--rq-blue)', background: 'rgba(90,169,255,.06)', border: '1px solid rgba(90,169,255,.15)' }}>
                    {rec.title}
                  </span>
                ))}
              </div>
            )}

            {/* Operational trend strip + pattern insights */}
            {(patternInsights.length > 0 || trends.incidentVolume.some(t => t.count > 0)) && (
              <div style={{ margin: '0 16px 4px' }}>
                {/* Trend sparkline + pressure state */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  {/* Sparkline: 15-min buckets, reversed so oldest is left */}
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 16 }}>
                    {[...trends.incidentVolume].reverse().map((t, i) => {
                      const maxScore = trends.peakBucketScore || 1;
                      const h = Math.max(2, (t.weightedScore / maxScore) * 16);
                      const barColor = t.weightedScore >= 6 ? 'var(--rq-red)' : t.weightedScore >= 3 ? 'var(--rq-amber)' : 'var(--rq-green)';
                      return <div key={i} style={{ width: 4, height: h, background: barColor, borderRadius: 1, opacity: t.weightedScore > 0 ? 0.8 : 0.15 }} />;
                    })}
                  </div>
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 7,
                    color: 'var(--rq-ink-4)', letterSpacing: '.06em',
                  }}>
                    2h
                  </span>

                  {/* Pressure state label */}
                  {trends.pressureLabel && (() => {
                    const stateColors: Record<PressureState, string> = {
                      rising: 'var(--rq-red)', deteriorating: 'var(--rq-red)', sustained_high: 'var(--rq-red)',
                      volatile: 'var(--rq-amber)', stabilizing: 'var(--rq-amber)',
                      falling: 'var(--rq-green)', stable: 'var(--rq-ink-3)',
                    };
                    const stateIcons: Record<PressureState, string> = {
                      rising: '▲', deteriorating: '▲▲', sustained_high: '━',
                      volatile: '~', stabilizing: '▽', falling: '▼', stable: '',
                    };
                    const color = stateColors[trends.pressureState];
                    return (
                      <span style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 8,
                        padding: '2px 6px', borderRadius: 2, letterSpacing: '.06em', textTransform: 'uppercase',
                        color, background: `color-mix(in srgb, ${color} 8%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${color} 20%, transparent)`,
                      }}>
                        {stateIcons[trends.pressureState]} {trends.pressureLabel}
                      </span>
                    );
                  })()}

                  {/* Recovery rate */}
                  {trends.recoveryCompletionRate !== null && (
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 8,
                      color: trends.recoveryCompletionRate >= 0.7 ? 'var(--rq-green)' : trends.recoveryCompletionRate >= 0.4 ? 'var(--rq-amber)' : 'var(--rq-red)',
                    }}>
                      recovery {Math.round(trends.recoveryCompletionRate * 100)}%
                    </span>
                  )}
                </div>

                {/* Pattern insight pills */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                  {patternInsights.slice(0, 5).map((ins, i) => {
                    const color = ins.severity === 'alert' ? 'var(--rq-red)' : ins.severity === 'watch' ? 'var(--rq-amber)' : 'var(--rq-ink-3)';
                    const isExpanded = expandedInsight === i;
                    const categoryLabel: Record<InsightCategory, string> = {
                      gate_pattern: 'GATE', equipment_risk: 'EQUIP', recovery_friction: 'RECOVERY', zone_instability: 'ZONE',
                    };
                    return (
                      <div key={i}
                        onClick={() => setExpandedInsight(isExpanded ? null : i)}
                        style={{
                          fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                          padding: '2px 8px', borderRadius: 2, cursor: 'pointer',
                          color, background: `color-mix(in srgb, ${color} 8%, transparent)`,
                          border: `1px solid color-mix(in srgb, ${color} 20%, transparent)`,
                        }}>
                        <span style={{ fontSize: 7, opacity: 0.7, marginRight: 4 }}>{categoryLabel[ins.category]}</span>
                        {ins.title}
                      </div>
                    );
                  })}
                </div>
                {/* Expanded insight explanation */}
                {expandedInsight !== null && patternInsights[expandedInsight] && (
                  <div style={{
                    marginTop: 4, padding: '6px 10px',
                    background: 'var(--rq-bg-1)', border: '1px solid var(--rq-line)',
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                    color: 'var(--rq-ink-2)', lineHeight: 1.4,
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: 3, color: 'var(--rq-ink)' }}>
                      {patternInsights[expandedInsight].title}
                    </div>
                    <div>{patternInsights[expandedInsight].explanation}</div>
                    <div style={{ fontSize: 8, color: 'var(--rq-ink-4)', marginTop: 4 }}>
                      Score: {patternInsights[expandedInsight].score}
                      {patternInsights[expandedInsight].contributingIncidentIds.length > 0 && (
                        <> · {patternInsights[expandedInsight].contributingIncidentIds.length} incident{patternInsights[expandedInsight].contributingIncidentIds.length !== 1 ? 's' : ''}</>
                      )}
                      {patternInsights[expandedInsight].contributingEventIds.length > 0 && (
                        <> · {patternInsights[expandedInsight].contributingEventIds.length} event{patternInsights[expandedInsight].contributingEventIds.length !== 1 ? 's' : ''}</>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Compact attention strip — desktop: inline details, mobile: summary */}
            {zoneAttentionEvents.length > 0 && (
              <div style={{
                margin: '0 16px', padding: '5px 10px',
                border: '1px solid var(--rq-red)', borderLeft: '3px solid var(--rq-red)',
                background: 'rgba(255,92,92,.04)',
                display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
              }}>
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700,
                  color: 'var(--rq-red)', letterSpacing: '.08em', textTransform: 'uppercase',
                }}>
                  {zoneAttentionEvents.length} attention
                </span>

                {/* Mobile: compact summary */}
                <span className="rq-attention-summary" style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--rq-ink-2)',
                }}>
                  {zoneAttentionEvents.filter(e => e.severity === 'CRITICAL').length > 0
                    ? `${zoneAttentionEvents.filter(e => e.severity === 'CRITICAL').length} critical · `
                    : ''
                  }
                  {zoneAttentionEvents.filter(e => e.severity === 'HIGH').length} high requiring action
                </span>

                {/* Desktop: inline event details with actions */}
                {zoneAttentionEvents.map(e => (
                  <span key={e.id} className="rq-attention-detail" style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                    color: 'var(--rq-ink-2)',
                  }}>
                    <SeverityIndicator severity={e.severity as Severity} variant="dot" />
                    <span>{e.event_type.replace(/_/g, ' ')}</span>
                    {e.gate_id && <span style={{ color: 'var(--rq-ink-4)' }}>{e.gate_id}</span>}
                    <ElapsedTime since={e.created_at} format="relative" />
                    {e.operational_status === 'OPEN' && (
                      <button className="rq-qbtn qb-ack" style={{ padding: '1px 6px', fontSize: 8, marginTop: 0 }}
                        disabled={updatingId === e.id}
                        onClick={(ev) => { ev.stopPropagation(); handleStatus(e.id, 'ACKNOWLEDGED', ev); }}>
                        Ack
                      </button>
                    )}
                    <button className="rq-qbtn qb-resolve" style={{ padding: '1px 6px', fontSize: 8, marginTop: 0 }}
                      disabled={updatingId === e.id}
                      onClick={(ev) => { ev.stopPropagation(); handleStatus(e.id, 'RESOLVED', ev); }}>
                      {updatingId === e.id ? '...' : 'Res'}
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Tabs */}
            <div style={{
              display: 'flex', borderBottom: '1px solid var(--rq-line)',
              margin: '14px 0 0',
            }}>
              {([
                { key: 'feed' as const, label: 'Live Feed', count: zoneSummary.total },
                { key: 'unresolved' as const, label: 'Unresolved', count: zoneSummary.openCount },
                { key: 'incidents' as const, label: 'Incidents', count: zoneScopedIncidents.length },
                { key: 'patterns' as const, label: 'Patterns', count: null },
                { key: 'intelligence' as const, label: 'Intelligence', count: soiRecommendations.length > 0 ? soiRecommendations.length : null },
              ]).map(tab => (
                <button
                  type="button"
                  key={tab.key}
                  onClick={() => setView(tab.key)}
                  style={{
                    flex: 1, padding: '10px', cursor: 'pointer',
                    background: 'transparent', border: 'none',
                    borderBottom: view === tab.key ? '2px solid var(--rq-accent)' : '2px solid transparent',
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                    letterSpacing: '.1em', textTransform: 'uppercase' as const,
                    color: view === tab.key ? 'var(--rq-accent)' : 'var(--rq-ink-3)',
                    fontWeight: view === tab.key ? 700 : 400,
                  }}
                >
                  {tab.label}
                  {tab.count != null && tab.count > 0 && (tab.key === 'unresolved' || tab.key === 'incidents') && (
                    <span style={{
                      marginLeft: 5, padding: '1px 5px',
                      background: 'rgba(255,92,92,.12)', color: 'var(--rq-red)',
                      fontSize: 9,
                    }}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* View content */}
            {loading && events.length === 0 && (
              <div className="rq-quiet" style={{ padding: '32px 16px' }}>Loading operational state...</div>
            )}

            {view === 'feed' && renderFeed()}
            {view === 'unresolved' && renderUnresolved()}
            {view === 'incidents' && renderIncidents()}
            {view === 'patterns' && renderPatterns()}
            {view === 'intelligence' && renderIntelligence()}

            {/* SOI Command Input */}
            <div style={{
              margin: '4px 16px 0', display: 'flex', gap: 4,
            }}>
              <input
                type="text"
                value={commandInput}
                onChange={e => setCommandInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && commandInput.trim()) handleCommand(commandInput); }}
                placeholder="Ask SOI... show zone, explain instability, recommend recovery"
                style={{
                  flex: 1, padding: '6px 10px',
                  background: 'var(--rq-bg-1)', border: '1px solid var(--rq-line)',
                  color: 'var(--rq-ink)', fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={() => { if (commandInput.trim()) handleCommand(commandInput); }}
                disabled={!commandInput.trim()}
                style={{
                  padding: '6px 10px',
                  background: 'none', border: '1px solid var(--rq-line)',
                  color: commandInput.trim() ? 'var(--rq-accent)' : 'var(--rq-ink-4)',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: '.06em',
                  cursor: commandInput.trim() ? 'pointer' : 'default',
                  textTransform: 'uppercase',
                }}
              >
                Run
              </button>
            </div>

            {/* Command response */}
            {commandResponse && (
              <div style={{
                margin: '4px 16px 0', padding: '8px 10px',
                background: 'var(--rq-bg-1)', borderLeft: '2px solid var(--rq-accent)',
                fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              }}>
                {commandResponse.map((line, i) => (
                  <div key={i} style={{ color: i === 0 ? 'var(--rq-ink)' : 'var(--rq-ink-3)', padding: '1px 0', lineHeight: 1.4 }}>
                    {line}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setCommandResponse(null)}
                  style={{
                    marginTop: 4, padding: '2px 6px',
                    background: 'none', border: '1px solid var(--rq-line)', color: 'var(--rq-ink-4)',
                    fontFamily: 'inherit', fontSize: 8, cursor: 'pointer',
                  }}
                >
                  dismiss
                </button>
              </div>
            )}

            {/* SOI Live Execution Panel */}
            {(cmdMemory.activePlan || liveExec) && (() => {
              const plan = cmdMemory.activePlan;
              const exec = liveExec;
              const isLive = exec && isExecutionActive(exec);
              const progress = exec ? executionProgressSummary(exec) : null;
              const phaseColor = exec?.phase === 'completed' ? 'var(--rq-green)'
                : exec?.phase === 'failed' ? 'var(--rq-red)'
                : exec?.phase === 'blocked' ? 'var(--rq-amber)'
                : isLive ? 'var(--rq-accent)' : 'var(--rq-accent)';

              return (
                <div style={{
                  margin: '6px 16px 0', padding: '12px',
                  background: 'var(--rq-bg-1)', border: '1px solid var(--rq-line)',
                  borderLeft: `3px solid ${phaseColor}`,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 8, color: phaseColor, letterSpacing: '.14em', textTransform: 'uppercase' }}>
                      {isLive ? 'Recovery Chain Active' : exec?.phase === 'completed' ? 'Recovery Complete' : exec?.phase === 'failed' ? 'Recovery Failed' : 'SOI Objective'}
                    </span>
                    {isLive && <span className="rq-pulse" />}
                    {progress && isLive && (
                      <span style={{ marginLeft: 'auto', fontSize: 8, color: 'var(--rq-ink-3)' }}>
                        {progress.completed}/{progress.total} steps
                      </span>
                    )}
                  </div>

                  {plan && (
                    <>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--rq-ink)', marginBottom: 4 }}>
                        {plan.objective.operationalGoal}
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--rq-ink-3)', marginBottom: 8 }}>
                        {plan.summary}
                      </div>
                    </>
                  )}

                  {/* Live steps */}
                  <div style={{ fontSize: 8, color: 'var(--rq-ink-4)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 4 }}>
                    {isLive ? 'Live Recovery Chain' : 'Modeled Recovery Plan'}
                  </div>
                  {(plan?.steps ?? []).map((step, i) => {
                    const ls = exec?.steps[i];
                    const stepColor = ls?.phase === 'completed' ? 'var(--rq-green)'
                      : ls?.phase === 'failed' ? 'var(--rq-red)'
                      : ls?.phase === 'stalled' ? 'var(--rq-amber)'
                      : ls?.phase === 'active' || ls?.phase === 'dispatched' || ls?.phase === 'acknowledged' ? 'var(--rq-blue)'
                      : 'var(--rq-ink-4)';
                    const stepLabel = ls?.phase === 'completed' ? '✓'
                      : ls?.phase === 'failed' ? '✗'
                      : ls?.phase === 'stalled' ? '!'
                      : ls?.phase === 'active' || ls?.phase === 'dispatched' || ls?.phase === 'acknowledged' ? '▸'
                      : `${step.sequence}`;
                    const isActiveStep = ls?.phase === 'active' || ls?.phase === 'dispatched' || ls?.phase === 'acknowledged';

                    return (
                      <div key={step.stepId} style={{
                        padding: '5px 8px', marginBottom: 2,
                        background: isActiveStep ? 'var(--rq-bg-3)' : 'var(--rq-bg-2)',
                        borderLeft: `2px solid ${stepColor}`,
                        display: 'flex', alignItems: 'center', gap: 8,
                        transition: 'background .3s',
                      }}>
                        <span style={{ fontSize: 11, color: stepColor, fontWeight: 700, width: 16, flexShrink: 0, textAlign: 'center' }}>
                          {stepLabel}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 10, color: isActiveStep ? 'var(--rq-ink)' : ls?.phase === 'completed' ? 'var(--rq-ink-2)' : 'var(--rq-ink)' }}>
                            {step.title}
                          </div>
                          <div style={{ fontSize: 8, color: 'var(--rq-ink-4)' }}>
                            {ls?.phase && ls.phase !== 'queued' ? ls.phase.toUpperCase() : step.estimatedImpact}
                          </div>
                        </div>
                        <span style={{ fontSize: 8, color: 'var(--rq-ink-4)' }}>{step.estimatedDurationMinutes}m</span>
                      </div>
                    );
                  })}

                  {/* Metrics */}
                  {plan && (
                    <div style={{ display: 'flex', gap: 16, margin: '8px 0', fontSize: 9 }}>
                      <div>
                        <span style={{ color: 'var(--rq-ink-4)' }}>est. </span>
                        <span style={{ color: 'var(--rq-ink-2)' }}>{plan.totalEstimatedMinutes}m</span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--rq-ink-4)' }}>confidence </span>
                        <span style={{ color: plan.confidence >= 70 ? 'var(--rq-green)' : 'var(--rq-amber)' }}>
                          {plan.confidence}%
                        </span>
                      </div>
                      {progress && (
                        <div>
                          <span style={{ color: 'var(--rq-ink-4)' }}>progress </span>
                          <span style={{ color: progress.percentage === 100 ? 'var(--rq-green)' : 'var(--rq-ink-2)' }}>
                            {progress.percentage}%
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Adaptive recommendations */}
                  {adaptiveRecs.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 8, color: 'var(--rq-amber)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 3 }}>
                        Adaptive Warning
                      </div>
                      {adaptiveRecs.map(ar => (
                        <div key={ar.id} style={{
                          padding: '4px 8px', marginBottom: 2,
                          background: ar.urgency === 'immediate' ? 'rgba(255,92,92,.04)' : 'rgba(245,177,61,.04)',
                          borderLeft: `2px solid ${ar.urgency === 'immediate' ? 'var(--rq-red)' : 'var(--rq-amber)'}`,
                          fontSize: 9, color: 'var(--rq-ink-2)', lineHeight: 1.3,
                        }}>
                          <div style={{ fontWeight: 600 }}>{ar.title}</div>
                          <div style={{ fontSize: 8, color: 'var(--rq-ink-3)' }}>{ar.reason}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Tradeoffs */}
                  {plan && plan.tradeoffs.length > 0 && !isLive && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 8, color: 'var(--rq-ink-4)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 2 }}>Tradeoffs</div>
                      {plan.tradeoffs.map((t, i) => (
                        <div key={i} style={{ fontSize: 8, color: 'var(--rq-amber)', lineHeight: 1.3 }}>· {t}</div>
                      ))}
                    </div>
                  )}

                  {/* Timeline (last 6 entries) */}
                  {exec && exec.timeline.entries.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 8, color: 'var(--rq-ink-4)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 3 }}>
                        Execution Timeline
                      </div>
                      {exec.timeline.entries.slice(-6).map(entry => (
                        <div key={entry.id} style={{
                          display: 'flex', gap: 8, padding: '2px 0',
                          fontSize: 8, color: entry.severity === 'critical' ? 'var(--rq-red)' : entry.severity === 'warning' ? 'var(--rq-amber)' : entry.severity === 'success' ? 'var(--rq-green)' : 'var(--rq-ink-3)',
                        }}>
                          <span style={{ color: 'var(--rq-ink-4)', width: 36, flexShrink: 0 }}>
                            {formatTimelineTime(entry.timestamp, exec.timeline.startedAt)}
                          </span>
                          <span>{entry.title}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Action buttons */}
                  {!replayMode && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      {!exec && plan && (
                        <button type="button"
                          onClick={handleApprovePlan}
                          style={{
                            flex: 2, padding: '6px 10px', fontSize: 9, letterSpacing: '.06em',
                            textTransform: 'uppercase', fontFamily: 'inherit',
                            background: 'none', border: '1px solid var(--rq-accent)', color: 'var(--rq-accent)',
                            cursor: 'pointer',
                          }}>
                          Approve Execution
                        </button>
                      )}
                      <button type="button"
                        onClick={() => {
                          if (liveExecTickRef.current) clearInterval(liveExecTickRef.current);
                          setLiveExec(null);
                          setAdaptiveRecs([]);
                          setCmdMemory(clearCommandMemory(cmdMemory));
                        }}
                        style={{
                          flex: 1, padding: '6px 10px', fontSize: 9, letterSpacing: '.06em',
                          textTransform: 'uppercase', fontFamily: 'inherit',
                          background: 'none', border: '1px solid var(--rq-line)', color: 'var(--rq-ink-4)',
                          cursor: 'pointer',
                        }}>
                        {isLive ? 'Abort' : exec ? 'Dismiss' : 'Cancel'}
                      </button>
                    </div>
                  )}

                  <div style={{ fontSize: 7, color: 'var(--rq-ink-4)', textAlign: 'center', marginTop: 6, letterSpacing: '.06em' }}>
                    Deterministic operational model — not guaranteed outcome.
                  </div>
                </div>
              );
            })()}

            {/* Context indicator */}
            {(() => {
              const ctxLabel = contextSummary(conversationMemory);
              return ctxLabel ? (
                <div style={{
                  margin: '4px 16px 0', padding: '3px 10px',
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 8,
                  color: 'var(--rq-ink-4)', letterSpacing: '.06em',
                  background: 'var(--rq-bg-1)', border: '1px solid var(--rq-line)',
                }}>
                  <span style={{ textTransform: 'uppercase', letterSpacing: '.1em' }}>Following</span>
                  <span style={{ color: 'var(--rq-ink-3)' }}>{ctxLabel}</span>
                  {lastInferredFrom.length > 0 && (
                    <span style={{ color: 'var(--rq-blue)', fontSize: 7 }}>
                      (inferred: {lastInferredFrom.join(', ')})
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => { setConversationMemory(createEmptyContext()); setLastInferredFrom([]); }}
                    style={{
                      marginLeft: 'auto', padding: '1px 4px',
                      background: 'none', border: '1px solid var(--rq-line)', color: 'var(--rq-ink-4)',
                      fontFamily: 'inherit', fontSize: 7, cursor: 'pointer',
                    }}
                  >
                    reset
                  </button>
                </div>
              ) : null;
            })()}

            {/* Copilot answer panel */}
            {copilotAnswer && (
              <div style={{
                margin: '4px 16px 0', padding: '10px 12px',
                background: 'var(--rq-bg-1)', borderLeft: '2px solid var(--rq-blue)',
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 8, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--rq-blue)' }}>
                    SOI Copilot
                  </span>
                  <span style={{
                    fontSize: 7, padding: '1px 5px',
                    border: `1px solid ${copilotAnswer.confidence === 'high' ? 'var(--rq-green-dim)' : copilotAnswer.confidence === 'moderate' ? 'var(--rq-amber-dim)' : 'var(--rq-line)'}`,
                    color: copilotAnswer.confidence === 'high' ? 'var(--rq-green)' : copilotAnswer.confidence === 'moderate' ? 'var(--rq-amber)' : 'var(--rq-ink-4)',
                    letterSpacing: '.08em', textTransform: 'uppercase',
                  }}>
                    {copilotAnswer.confidence}
                  </span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--rq-ink)', marginBottom: 4 }}>
                  {copilotAnswer.title}
                </div>
                <div style={{ fontSize: 10, color: 'var(--rq-ink-2)', lineHeight: 1.5, marginBottom: 6 }}>
                  {copilotAnswer.answer}
                </div>
                {copilotAnswer.bullets.length > 0 && (
                  <div style={{ marginBottom: 6 }}>
                    {copilotAnswer.bullets.map((b, i) => (
                      <div key={i} style={{ fontSize: 9, color: 'var(--rq-ink-3)', padding: '1px 0', lineHeight: 1.4 }}>
                        · {b}
                      </div>
                    ))}
                  </div>
                )}
                {copilotAnswer.assumptions.length > 0 && (
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 8, color: 'var(--rq-ink-4)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 2 }}>
                      Assumptions
                    </div>
                    {copilotAnswer.assumptions.map((a, i) => (
                      <div key={i} style={{ fontSize: 8, color: 'var(--rq-ink-4)', padding: '1px 0', lineHeight: 1.3, fontStyle: 'italic' }}>
                        {a}
                      </div>
                    ))}
                  </div>
                )}
                {copilotAnswer.recommendedNextAction && (
                  <div style={{ fontSize: 9, color: 'var(--rq-blue)', marginBottom: 4 }}>
                    Recommended: {copilotAnswer.recommendedNextAction}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 7, color: 'var(--rq-ink-4)' }}>
                    {copilotAnswer.source.replace(/_/g, ' ')}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCopilotAnswer(null)}
                    style={{
                      marginLeft: 'auto', padding: '2px 6px',
                      background: 'none', border: '1px solid var(--rq-line)', color: 'var(--rq-ink-4)',
                      fontFamily: 'inherit', fontSize: 8, cursor: 'pointer',
                    }}
                  >
                    dismiss
                  </button>
                </div>
              </div>
            )}

            {/* Operator selector + dev controls */}
            <div style={{ padding: '10px 16px', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={operator.userId} onChange={e => {
                const op = OPERATORS.find(o => o.userId === e.target.value);
                if (op) setOperator(op);
              }} style={{
                padding: '4px 8px', background: 'var(--rq-bg-2)', border: '1px solid var(--rq-line)',
                color: 'var(--rq-ink)', fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
              }}>
                {OPERATORS.map(op => (
                  <option key={op.userId} value={op.userId}>{op.displayName} ({op.role})</option>
                ))}
              </select>
              <button className="rq-btn-secondary" onClick={refresh} style={{ flex: 1 }}>
                Refresh
              </button>
              {!replayMode && (
                <button className="rq-btn-secondary" onClick={startReplay}
                  style={{ flex: 1, color: 'var(--rq-blue)', borderColor: 'rgba(90,169,255,.3)' }}>
                  Replay
                </button>
              )}
              <button className="rq-btn-secondary" onClick={async () => {
                await seedDemoScenario();
                refreshIncidents();
                refresh();
              }} style={{ flex: 1, color: 'var(--rq-accent)', borderColor: 'rgba(201,255,58,.3)' }}>
                Seed Demo
              </button>
              <button className="rq-btn-secondary" onClick={async () => {
                await clearStressData();
                await runStressSimulation();
                refreshIncidents();
                refresh();
              }} style={{ flex: 1, color: 'var(--rq-blue)', borderColor: 'rgba(90,169,255,.3)' }}>
                Stress Test
              </button>
              <button className="rq-btn-secondary" onClick={async () => {
                await clearDemoData();
                refreshIncidents();
                refresh();
              }} style={{ flex: 1, color: 'var(--rq-red)', borderColor: 'var(--rq-red-dim)' }}>
                Clear All
              </button>
            </div>
          </div>
        </div>

        {/* ── RIGHT RAIL: Incident triage / detail / event memory ── */}
        <div className="rq-console-rail-right">
          {selectedIncident ? (
            <>
            <IncidentDetailPanel
              incident={selectedIncident}
              incidentEvents={incidentEvents}
              recoveryActions={recoveryActions}
              isTransitioning={incidentTransitioning === selectedIncident.id}
              onTransition={handleIncidentTransition}
              onBack={() => setSelectedIncidentId(null)}
              onCreateRecoveryAction={handleCreateRecoveryAction}
              onRecoveryTransition={handleRecoveryTransition}
              raTransitioning={raTransitioning}
              raSubmitting={raSubmitting}
              showRecoveryForm={showRecoveryForm}
              onToggleRecoveryForm={() => setShowRecoveryForm(!showRecoveryForm)}
            />

            {/* Recommendations for selected incident */}
            {recommendations.filter(r => r.incidentId === selectedIncident.id).map(rec => (
              <div key={rec.id} style={{
                margin: '4px 12px', padding: '6px 8px',
                background: 'rgba(90,169,255,.04)', border: '1px solid rgba(90,169,255,.15)',
                borderLeft: '2px solid var(--rq-blue)',
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                <div style={{ fontSize: 8, color: 'var(--rq-blue)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 3 }}>
                  operational memory suggests
                </div>
                <div style={{ fontSize: 10, color: 'var(--rq-ink)', fontWeight: 600, marginBottom: 2 }}>
                  {rec.title}
                </div>
                <div style={{ fontSize: 9, color: 'var(--rq-ink-3)', lineHeight: 1.3, marginBottom: 4 }}>
                  {rec.explanation}
                </div>
                {rec.suggestedActions.length > 0 && (
                  <div style={{ fontSize: 9, color: 'var(--rq-ink-2)', marginBottom: 4 }}>
                    {rec.suggestedActions.map((a, i) => (
                      <div key={i} style={{ padding: '1px 0' }}>· {a}</div>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 8, color: 'var(--rq-ink-4)', marginBottom: 4 }}>
                  {rec.confidenceNarrative}
                </div>
                {!replayMode && (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button type="button" onClick={async () => {
                      await emitRecommendationOverride({ recommendationId: rec.id, action: 'accepted', actorId: operator.userId, actorRole: operator.role });
                      refresh();
                    }} style={{
                      flex: 1, padding: '3px', fontSize: 8, fontFamily: 'inherit',
                      background: 'none', border: '1px solid rgba(90,169,255,.3)', color: 'var(--rq-blue)', cursor: 'pointer',
                    }}>
                      accept
                    </button>
                    <button type="button" onClick={async () => {
                      await emitRecommendationOverride({ recommendationId: rec.id, action: 'rejected', actorId: operator.userId, actorRole: operator.role });
                      refresh();
                    }} style={{
                      flex: 1, padding: '3px', fontSize: 8, fontFamily: 'inherit',
                      background: 'none', border: '1px solid var(--rq-line)', color: 'var(--rq-ink-4)', cursor: 'pointer',
                    }}>
                      dismiss
                    </button>
                  </div>
                )}
              </div>
            ))}

          </>
          ) : triageIncidents.length > 0 ? (
            /* ── Active incidents triage list ── */
            <>
              {/* Operator load indicators (role-aware per AUTHORITY_NOT_SURVEILLANCE) */}
              {(() => {
                // Coordinator: see own load only
                // Manager: see aggregate coordination health
                // Ops Director: see all operators
                const myLoad = workforce.operatorLoads.find(o => o.operatorId === operator.userId);
                const showIndividuals = operator.viewerRole === 'ops_director';
                const showAggregates = operator.viewerRole === 'manager' || operator.viewerRole === 'ops_director';
                const elevated = workforce.operatorLoads.filter(o => o.saturation !== 'nominal');

                return (elevated.length > 0 || (myLoad && myLoad.saturation !== 'nominal')) ? (
                  <div style={{ padding: '4px 12px', borderBottom: '1px solid var(--rq-line)' }}>
                    <div className="rq-rail-header" style={{ padding: '2px 0' }}>
                      {showAggregates ? 'Coordination Health' : 'My Workload'}
                    </div>
                    {/* Coordinator sees own load first */}
                    {myLoad && myLoad.saturation !== 'nominal' && (
                      <div style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                        display: 'flex', justifyContent: 'space-between', padding: '2px 0',
                        color: 'var(--rq-ink-3)',
                      }}>
                        <span style={{ color: 'var(--rq-ink-2)' }}>{operator.displayName}</span>
                        <span style={{ display: 'flex', gap: 6 }}>
                          <span>{myLoad.ownedIncidents}inc {myLoad.activeRecoveryActions}ra</span>
                          <span style={{ color: myLoad.saturation === 'needs_support' ? 'var(--rq-red)' : 'var(--rq-amber)', fontWeight: 600 }}>
                            {myLoad.saturation === 'needs_support' ? 'need support' : myLoad.saturation}
                          </span>
                        </span>
                      </div>
                    )}
                    {/* Manager/Director see aggregates or individuals */}
                    {showIndividuals && elevated.filter(o => o.operatorId !== operator.userId).slice(0, 4).map(op => {
                      const color = op.saturation === 'needs_support' ? 'var(--rq-red)' : op.saturation === 'saturated' ? 'var(--rq-amber)' : 'var(--rq-ink-3)';
                      return (
                        <div key={op.operatorId} style={{
                          fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                          display: 'flex', justifyContent: 'space-between', padding: '2px 0',
                          color: 'var(--rq-ink-3)',
                        }}>
                          <span>{op.operatorId}</span>
                          <span style={{ display: 'flex', gap: 6 }}>
                            <span>{op.ownedIncidents}inc {op.activeRecoveryActions}ra</span>
                            <span style={{ color, fontWeight: 600 }}>{op.saturation}</span>
                          </span>
                        </div>
                      );
                    })}
                    {showAggregates && !showIndividuals && elevated.length > 1 && (
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'var(--rq-ink-4)', padding: '2px 0' }}>
                        {elevated.length} coordinators with elevated load
                      </div>
                    )}
                  </div>
                ) : null;
              })()}

              <div className="rq-rail-header">
                <span>Active Incidents</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'var(--rq-ink-4)' }}>
                  {triageIncidents.length}
                </span>
              </div>
              {triageIncidents.map(inc => {
                const sevColor = inc.severity === 'CRITICAL' || inc.severity === 'HIGH'
                  ? 'var(--rq-red)' : inc.severity === 'MEDIUM' ? 'var(--rq-amber)' : 'var(--rq-ink-3)';
                // Count active recovery actions for this incident
                const incRecoveryActive = events.filter(e =>
                  e.entity_type === 'recovery_action' && e.correlation_id === inc.correlation_id
                  && e.state_after && !['COMPLETE', 'WITHDRAWN', 'ESCALATED'].includes(e.state_after)
                ).length;
                // Aging classification
                const ageMin = Math.round((Date.now() - new Date(inc.opened_at).getTime()) / 60_000);
                const agingClass = ageMin >= 60 ? 'chronic' : ageMin >= 30 ? 'aging' : 'fresh';
                const agingColor = agingClass === 'chronic' ? 'var(--rq-red)' : agingClass === 'aging' ? 'var(--rq-amber)' : 'var(--rq-green)';
                return (
                  <div
                    key={inc.id}
                    onClick={() => setSelectedIncidentId(inc.id)}
                    style={{
                      padding: '6px 12px', cursor: 'pointer',
                      borderBottom: '1px solid var(--rq-line)',
                      borderLeft: `2px solid ${sevColor}`,
                      transition: 'background .1s',
                      background: agingClass === 'chronic' ? 'rgba(255,92,92,.02)' : 'transparent',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--rq-bg-2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = agingClass === 'chronic' ? 'rgba(255,92,92,.02)' : 'transparent')}
                  >
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600,
                      color: 'var(--rq-ink)', display: 'flex', justifyContent: 'space-between',
                    }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
                        {inc.title}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {/* Aging dot */}
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: agingColor, flexShrink: 0 }} />
                        <ElapsedTime since={inc.opened_at} format="relative" />
                      </span>
                    </div>
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                      color: 'var(--rq-ink-4)', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center',
                    }}>
                      <span style={{ color: sevColor, fontWeight: 600 }}>{inc.severity}</span>
                      <span>{inc.status}</span>
                      {inc.zone_id && <span>{inc.zone_id}</span>}
                      {inc.gate_id && <span>{inc.gate_id}</span>}
                      {incRecoveryActive > 0 && (
                        <span style={{
                          marginLeft: 'auto', padding: '0 4px',
                          background: 'rgba(62,213,152,.1)', color: 'var(--rq-green)',
                          fontSize: 8, fontWeight: 600,
                        }}>
                          {incRecoveryActive} action{incRecoveryActive !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Event memory */}
              <div className="rq-rail-header" style={{ marginTop: 4 }}>Event Memory</div>
              {eventMemory.slice(0, 8).map(ev => (
                <div key={ev.id} style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                  color: 'var(--rq-ink-4)', padding: '3px 12px',
                  borderBottom: '1px solid var(--rq-line)',
                  display: 'flex', justifyContent: 'space-between',
                }}>
                  <span style={{ color: ev.entity_type === 'incident' || ev.entity_type === 'recovery_action' ? 'var(--rq-ink-2)' : 'var(--rq-ink-3)' }}>
                    {ev.event_type.replace(/_/g, ' ')}
                  </span>
                  <ElapsedTime since={ev.created_at} format="relative" />
                </div>
              ))}
            </>

          ) : (
            /* ── No incidents — show narratives + event memory ── */
            <>
              {/* Operational narrative summary */}
              {narratives.length > 0 && (
                <div style={{ padding: '4px 12px', borderBottom: '1px solid var(--rq-line)' }}>
                  <div className="rq-rail-header" style={{ padding: '2px 0' }}>Operational Summary</div>
                  {narratives.slice(0, 3).map((nar, i) => (
                    <div key={i} style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                      color: 'var(--rq-ink-3)', padding: '3px 0', lineHeight: 1.3,
                      borderBottom: '1px solid var(--rq-line)',
                    }}>
                      {nar.text}
                    </div>
                  ))}
                </div>
              )}
              <div className="rq-rail-header">Event Memory</div>
              {eventMemory.length === 0 && (
                <div className="rq-quiet" style={{ padding: '12px', fontSize: 11 }}>No events yet</div>
              )}
              {eventMemory.slice(0, 15).map(ev => (
                <div key={ev.id} style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                  color: 'var(--rq-ink-3)', padding: '4px 12px',
                  borderBottom: '1px solid var(--rq-line)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: ev.entity_type === 'incident' || ev.entity_type === 'recovery_action' ? 'var(--rq-ink-2)' : 'var(--rq-ink-3)' }}>
                      {ev.event_type.replace(/_/g, ' ')}
                    </span>
                    <ElapsedTime since={ev.created_at} format="relative" />
                  </div>
                  {ev.gate_id && <span style={{ fontSize: 9, color: 'var(--rq-ink-4)' }}>{ev.gate_id}</span>}
                </div>
              ))}
            </>
          )}
        </div>

      </div>

      <div className="rq-quiet" style={{ padding: '6px 16px' }}>SOI · Operational Memory</div>
    </>
  );
}

// ============================================================
// HELPERS
// ============================================================

// statusBorderColor, sevFg, sevBg removed — replaced by
// SeverityIndicator and OperationalStatus primitives from
// @/components/soi which derive colors from operational-states.ts.

