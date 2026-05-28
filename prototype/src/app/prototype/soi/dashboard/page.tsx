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
import {
  createNarrativeFeed,
  narrateStep,
  narrateChainHealth,
  narrateAdaptive,
  narrateBriefing,
  getVisibleNarratives,
  type NarrativeFeed,
} from '@/lib/soi-narrative';
import { voiceRewrite, isVoiceAvailable, type GroundedData } from '@/lib/soi-llm';
import { validateAccessCode, getStoredIdentity, storeIdentity, clearIdentity, generateGreeting, getRoleLabel } from '@/lib/soi-identity/access-code-identity';
import { isWeatherQuestion, fetchLiveWeather, generateWeatherAnswer } from '@/lib/soi-context/weather-context';
import { computeFlightWorld, getAtRiskFlights, findFlight } from '@/lib/soi-context/flight-context';
import { forecastPressure, forecastCascades, assessRecoveryConfidence, type OperationalForecast, type CascadeRisk } from '@/lib/soi-predictive';
import { compareScenarios, simulateScenario, type Scenario } from '@/lib/soi-simulation';
import { analyzeOperationalContext, analyzeHistoricalEffectiveness } from '@/lib/soi-adaptive';
import { computeWorkforceState, recommendTeamForGate, type WorkforceState } from '@/lib/soi-context/workforce-model';
import { SpatialField } from '@/components/soi/SpatialField';
import { ReplayTimeline } from '@/components/soi/ReplayTimeline';
import { ModuleFrame } from '@/components/soi-surface/ModuleFrame';
import { type LayoutState, type RoleId, type SlotId, type LayoutName, LEFT_SLOTS, RIGHT_SLOTS, UTILITY_SLOTS, MODULE_REGISTRY, getModuleDef, loadLayout, saveLayout, getLastUsedLayoutName, setLastUsedLayoutName } from '@/lib/soi-surface';
import { getRolePreset, createDefaultLayout, ROLE_LABELS } from '@/lib/soi-surface';
import dynamic from 'next/dynamic';
import './surface.css';

// Lazy load 3D component (Three.js is heavy)
const SpatialField3D = dynamic(() => import('@/components/soi/SpatialField3D').then(m => ({ default: m.SpatialField3D })), { ssr: false });
import {
  isVoiceInputAvailable, startListening, stopListening, onVoiceResult, onVoiceStateChange,
  routeVoiceCommand,
  isTTSAvailable, speak, speakDirect, speakCritical, stopSpeaking, toggleTTS, isTTSEnabled,
  enableTTS, disableTTS, onTTSStateChange, getDiagnostic,
  toggleAmbient, isAmbientEnabled, playAmbientCue,
  shouldSpeak, getSpokenPriority, condenseForSpeech,
  generateSpokenBriefing, prepareForSpeech,
  checkOpenAITTS, getTTSMode, speakWithOpenAI, stopOpenAI, onOpenAISpeakingChange,
  type VoiceInputState, type TTSState, type TTSMode,
} from '@/lib/soi-voice';

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
  const [operator, setOperator] = useState<AuthenticatedOperator>(() => getStoredIdentity() ?? OPERATORS[0]);
  const [showAccessPrompt, setShowAccessPrompt] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [accessError, setAccessError] = useState('');
  const [greeting, setGreeting] = useState<string | null>(null);
  const [liveTime, setLiveTime] = useState('');

  // Live clock
  useEffect(() => {
    const tick = () => setLiveTime(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  // Check identity on mount
  useEffect(() => {
    const stored = getStoredIdentity();
    if (stored) {
      setOperator(stored);
    } else {
      setShowAccessPrompt(true);
    }
  }, []);
  const [filters, setFilters] = useState<EventFilters>(EMPTY_FILTERS);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const prevIdsRef = useRef<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [selectedGateId, setSelectedGateId] = useState<string | null>(null);
  const [spatialMode, setSpatialMode] = useState<'2d' | '3d'>('2d');
  const [pendingAssignment, setPendingAssignment] = useState<{ gate: string; members: string[]; reasoning: string } | null>(null);

  // ── Surface layout state (persisted) ──
  const [activeRole, setActiveRole] = useState<RoleId>(() => {
    if (typeof window === 'undefined') return 'crew_chief';
    const stored = getStoredIdentity();
    if (stored?.viewerRole === 'manager') return 'ramp_manager';
    if (stored?.viewerRole === 'ops_director') return 'executive';
    if (stored?.role === 'CREW_CHIEF') return 'crew_chief';
    return 'crew_chief';
  });
  const [activeLayoutName, setActiveLayoutName] = useState<LayoutName>('Default');
  const [layoutSlots, setLayoutSlots] = useState(() => {
    if (typeof window === 'undefined') return getRolePreset('crew_chief');
    try {
      const stored = getStoredIdentity();
      const role: RoleId = stored?.viewerRole === 'manager' ? 'ramp_manager' : stored?.viewerRole === 'ops_director' ? 'executive' : 'crew_chief';
      const saved = loadLayout(stored?.userId ?? 'anon', role, 'LAX', 'Default');
      return saved?.slots ?? getRolePreset(role);
    } catch { return getRolePreset('crew_chief'); }
  });
  const [editMode, setEditMode] = useState(false);
  const [crisisMode, setCrisisMode] = useState(false);
  const [crisisSuggested, setCrisisSuggested] = useState(false);
  const [showModuleGallery, setShowModuleGallery] = useState(false);
  const [galleryTarget, setGalleryTarget] = useState<SlotId | null>(null);

  function switchRole(role: RoleId) {
    setActiveRole(role);
    const saved = loadLayout(operator.userId, role, 'LAX', 'Default');
    setLayoutSlots(saved?.slots ?? getRolePreset(role));
    setActiveLayoutName('Default');
    setEditMode(false);
  }

  function saveCurrentLayout() {
    saveLayout({
      userId: operator.userId,
      role: activeRole,
      stationId: 'LAX',
      layoutName: activeLayoutName,
      slots: layoutSlots,
      lastModified: Date.now(),
    });
    setLastUsedLayoutName(operator.userId, activeRole, 'LAX', activeLayoutName);
    setEditMode(false);
  }

  function moveModuleInRail(slotId: SlotId, direction: 'up' | 'down') {
    const rail = slotId.startsWith('L') ? LEFT_SLOTS : slotId.startsWith('R') ? RIGHT_SLOTS : UTILITY_SLOTS;
    const idx = rail.indexOf(slotId);
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= rail.length) return;
    const targetSlot = rail[targetIdx];
    setLayoutSlots(prev => {
      const next = { ...prev };
      const temp = next[slotId];
      next[slotId] = next[targetSlot];
      next[targetSlot] = temp;
      return next;
    });
  }

  function removeModule(slotId: SlotId) {
    setLayoutSlots(prev => { const next = { ...prev }; delete next[slotId]; return next; });
  }

  function addModuleToSlot(slotId: SlotId, moduleId: string) {
    const def = getModuleDef(moduleId);
    if (!def) return;
    setLayoutSlots(prev => ({ ...prev, [slotId]: { moduleId, size: def.defaultSize, emphasized: false } }));
    setShowModuleGallery(false);
    setGalleryTarget(null);
  }

  function toggleCrisis() {
    setCrisisMode(prev => !prev);
    setCrisisSuggested(false);
  }

  // Crisis auto-suggest moved after operationalAssessment declaration below

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
  const [narrativeFeed, setNarrativeFeed] = useState<NarrativeFeed>(createNarrativeFeed());
  const liveExecTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevStepPhasesRef = useRef<string[]>([]);
  const [voiceState, setVoiceState] = useState<VoiceInputState>('idle');
  const [ttsState, setTtsState] = useState<TTSState>('idle');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [ttsOn, setTtsOn] = useState(false);
  const [ttsMode, setTtsMode] = useState<TTSMode>('browser');
  const [ambientOn, setAmbientOn] = useState(false);
  const lastInputWasVoiceRef = useRef(false);
  const prevCopilotAnswerRef = useRef<string | null>(null);
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

  // ── Flight Intelligence ──
  const flightWorldMap = computeFlightWorld(temporalIncidents, temporalRecoveryActions, temporalEvents);

  // ── Predictive Operations ──
  const gatePressureMap = new Map<string, number>();
  // Build gate pressures from spatial field computation
  const ALL_GATES = ['52A', '52B', '52C', '52D', '52E', '52F', '52G', '52H', '52I'];
  for (const gateId of ALL_GATES) {
    const gi = temporalIncidents.filter(i => i.gate_id === gateId && i.status !== 'RESOLVED' && i.status !== 'CLOSED');
    const zoneId = zones.find(z => z.gate_ids.includes(gateId))?.id;
    const za = zoneId ? operationalAssessment.zoneAssessments.find(z => z.zoneId === zoneId) : null;
    const p = Math.min(100, Math.round(gi.reduce((s, i) => s + ({ CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }[i.severity] ?? 1) * 12, 0) + (za ? za.pressure * 0.2 : 0)));
    gatePressureMap.set(gateId, p);
  }
  let forecast: OperationalForecast | null = null;
  let cascadeRisks: CascadeRisk[] = [];
  try {
    forecast = forecastPressure(operationalAssessment, temporalIncidents, temporalRecoveryActions, gatePressureMap);
    cascadeRisks = forecastCascades(operationalAssessment, forecast.zones);
  } catch { /* keep null */ }
  const recoveryConf = assessRecoveryConfidence(temporalIncidents, temporalRecoveryActions, selectedZoneId ?? undefined);

  // ── Workforce Model ──
  const workforceState = computeWorkforceState(temporalIncidents, temporalRecoveryActions, temporalEvents);

  // ── Crisis auto-suggest ──
  useEffect(() => {
    if (!crisisMode && !crisisSuggested && operationalAssessment.globalPressure >= 80) {
      setCrisisSuggested(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operationalAssessment.globalPressure]);

  // ── Adaptive Reasoning ──
  const opProfile = analyzeOperationalContext(temporalIncidents, temporalRecoveryActions, temporalEvents, operationalAssessment, selectedZoneId ?? undefined);
  const historicalEff = analyzeHistoricalEffectiveness(temporalIncidents, temporalRecoveryActions);

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
    // A0. Confirm pending team assignment
    if (pendingAssignment && /\b(?:confirm|yes|go|approved?|dispatch|do\s+it)\b/i.test(raw)) {
      const pa = pendingAssignment;
      setPendingAssignment(null);
      // Create recovery action for the assignment
      const gateInc = temporalIncidents.find(i => i.gate_id === pa.gate && i.status !== 'RESOLVED' && i.status !== 'CLOSED');
      if (gateInc) {
        createRecoveryAction({
          incident_id: gateInc.id,
          title: `Team assignment: ${pa.members.join(', ')} to ${pa.gate}`,
          action_type: 'DISPATCH',
          severity: 'HIGH',
          proposed_by: operator.userId,
          assigned_to: pa.members[0],
          gate_id: pa.gate,
          description: `SOI assignment: ${pa.reasoning}`,
        }).then(() => { refreshRecovery(); refresh(); });
      }
      setCopilotAnswer({
        title: 'Assignment Confirmed',
        answer: `Team dispatched to ${pa.gate}. ${pa.members.join(', ')} assigned. Recovery action created.`,
        confidence: 'high', bullets: [], assumptions: [],
        source: 'deterministic_operational_model',
      });
      setCommandResponse(null);
      if (ttsOn && lastInputWasVoiceRef.current) soiSpeak(`Assignment confirmed. Team dispatched to gate ${pa.gate}.`);
      setCommandInput('');
      return;
    }

    // A. Approval / confirmation / cancel (highest priority)
    const agenticParsed = parseAgenticIntent(raw, zones);
    if (agenticParsed.intent === 'execute_plan' && cmdMemory.activePlan) {
      handleApprovePlan();
      if (ttsOn && lastInputWasVoiceRef.current) soiSpeak('Recovery chain approved and execution initiated.');
      setCommandInput('');
      return;
    }
    if (agenticParsed.intent === 'cancel_plan') {
      if (liveExecTickRef.current) clearInterval(liveExecTickRef.current);
      setLiveExec(null);
      setAdaptiveRecs([]);
      setCmdMemory(clearCommandMemory(cmdMemory));
      setCommandResponse(['Execution plan cancelled.']);
      setCopilotAnswer(null);
      if (ttsOn && lastInputWasVoiceRef.current) soiSpeak('Execution cancelled.');
      setCommandInput('');
      return;
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
      setCommandInput('');
      return;
    }
    if (agenticParsed.intent === 'show_alternatives' && cmdMemory.activePlan) {
      const altPlan = buildAlternativePlan(
        cmdMemory.activePlan.objective, operationalAssessment,
        soiRecommendations, temporalIncidents, temporalRecoveryActions,
      );
      setCmdMemory(stagePlan(cmdMemory, altPlan, altPlan.objective, operationalAssessment));
      setCommandResponse(null);
      setCopilotAnswer(null);
      setCommandInput('');
      return;
    }
    if (agenticParsed.intent === 'continue_recovery' && liveExec && isExecutionActive(liveExec)) {
      setCommandResponse(['Recovery chain is progressing. Use the live execution panel to monitor.']);
      setCopilotAnswer(null);
      setCommandInput('');
      return;
    }

    // B. Agentic execution intents (stabilize, prevent, reduce, dispatch, etc.)
    if (agenticParsed.intent && !['execute_plan', 'cancel_plan', 'show_plan_status', 'show_alternatives', 'continue_recovery'].includes(agenticParsed.intent)) {
      // Resolve gate to zone if only gate was provided
      if (!agenticParsed.targetZone && agenticParsed.targetGate && zones.length > 0) {
        const resolved = resolveZonePattern(agenticParsed.targetGate, zones);
        if (resolved) agenticParsed.targetZone = resolved;
      }

      const objective = buildObjective(agenticParsed, operationalAssessment, zones);
      const plan = buildExecutionPlan(
        objective, operationalAssessment,
        soiRecommendations, temporalIncidents, temporalRecoveryActions,
      );

      if (plan.steps.length === 0) {
        // Explain why no plan could be built
        const zoneLabel = objective.targetZoneLabel ?? objective.targetZone ?? 'the target area';
        const za = objective.targetZone ? operationalAssessment.zoneAssessments.find(z => z.zoneId === objective.targetZone) : null;
        const reason = za
          ? za.unresolvedCount === 0
            ? `No active incidents at ${zoneLabel}. Zone is currently stable.`
            : `Recovery actions already cover incidents at ${zoneLabel}. No additional steps needed.`
          : `Unable to assess ${zoneLabel}. Zone data not available.`;
        setCommandResponse([reason]);
        setCopilotAnswer(null);
      } else {
        const auth = authorizeExecution(plan.steps, operator.viewerRole as 'coordinator' | 'manager' | 'ops_director');
        setCmdMemory(stagePlan(cmdMemory, plan, objective, operationalAssessment));
        setCommandResponse(null);
        setCopilotAnswer(null);
        if (ttsOn && lastInputWasVoiceRef.current) {
          soiSpeak(`Recovery plan staged for ${objective.targetZoneLabel ?? objective.targetZone ?? 'target zone'}. ${plan.steps.length} steps. Say approve to execute.`);
        }
        if (!auth.authorized && auth.deniedReasons.length > 0) {
          setCommandResponse([
            `Plan staged with ${auth.deniedSteps.length} restricted step${auth.deniedSteps.length > 1 ? 's' : ''}:`,
            ...auth.deniedReasons.map(r => `· ${r}`),
            ...(auth.escalationPath ? [`Escalation: ${auth.escalationPath}`] : []),
          ]);
        }
      }
      setCommandInput('');
      return;
    }

    // C. Exact legacy commands
    const intent = parseCommand(raw);
    switch (intent.type) {
      case 'summarize_operation': {
        setCopilotAnswer(null);
        const { briefing } = narrateBriefing(
          narrativeFeed, operationalAssessment, soiRecommendations, dispatchPlan, liveExec,
          temporalIncidents.filter(i => i.status !== 'RESOLVED' && i.status !== 'CLOSED').length,
          temporalRecoveryActions.filter(ra => ra.status === 'ACTIVE' || ra.status === 'ACKNOWLEDGED').length,
        );
        setCommandResponse([
          briefing.title,
          ...briefing.sections.map(s => `${s.heading}: ${s.content}`),
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
        // Check if it's a single gate reference
        const gateMatch = intent.zonePattern.match(/^(52[A-I])$/i);
        if (gateMatch) {
          const gate = gateMatch[1].toUpperCase();
          setSelectedGateId(gate);
          const zoneId = zones.find(z => z.gate_ids.includes(gate))?.id ?? null;
          if (zoneId) setSelectedZoneId(zoneId);
          // Per-gate summary
          const gateInc = temporalIncidents.filter(i => i.gate_id === gate && i.status !== 'RESOLVED' && i.status !== 'CLOSED');
          if (gateInc.length > 0) {
            setCommandResponse([
              `Gate ${gate}: ${gateInc.length} active incident${gateInc.length > 1 ? 's' : ''}`,
              ...gateInc.slice(0, 3).map(i => `· ${i.severity} — ${i.title.slice(0, 50)}`),
            ]);
          } else {
            setCommandResponse([`Gate ${gate}: No active incidents. Gate operational.`]);
          }
          break;
        }
        const zoneId = resolveZonePattern(intent.zonePattern, zones);
        if (zoneId) {
          setSelectedZoneId(zoneId);
          setSelectedGateId(null);
          setCommandResponse([`Focused on zone: ${zones.find(z => z.id === zoneId)?.label ?? zoneId}`]);
        } else {
          setCommandResponse([`Could not resolve "${intent.zonePattern}" to a known zone or gate.`]);
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
        // D. Flight query check
        const flightMatch = raw.match(/\b([A-Z]{2}\d{3,4})\b/i);
        if (flightMatch) {
          const fw = findFlight(flightWorldMap, flightMatch[1]);
          if (fw) {
            setSelectedGateId(fw.gateId);
            const zoneId = zones.find(z => z.gate_ids.includes(fw.gateId))?.id ?? null;
            if (zoneId) setSelectedZoneId(zoneId);
            const riskColor = fw.departureRisk === 'CRITICAL' || fw.departureRisk === 'HIGH' ? fw.departureRisk : '';
            setCommandResponse([
              `${fw.flightNumber} · ${fw.aircraft} · ${fw.route}`,
              `Gate ${fw.gateId} · ${fw.turnPhase.replace('_', ' ')} · ${fw.minutesToDeparture}m to departure`,
              `Departure risk: ${fw.departureRisk}${fw.riskFactors.length > 0 ? ` — ${fw.riskFactors[0]}` : ''}`,
              ...(fw.riskFactors.slice(1, 3).map(r => `· ${r}`)),
            ]);
            setCopilotAnswer(null);
            setCommandInput('');
            return;
          }
        }

        // Flight risk query
        if (/\b(?:flight|departure|outbound).*(?:risk|unstable|at risk|attention|compressing)\b/i.test(raw) ||
            /\b(?:which|what).*(?:flight|departure|turn).*(?:risk|danger|unstable|delay)\b/i.test(raw)) {
          const atRisk = getAtRiskFlights(flightWorldMap);
          if (atRisk.length === 0) {
            setCommandResponse(['All departures within normal parameters. No elevated flight risk detected.']);
          } else {
            setCommandResponse([
              `${atRisk.length} flight${atRisk.length > 1 ? 's' : ''} at elevated departure risk:`,
              ...atRisk.slice(0, 5).map(f => `· ${f.flightNumber} at ${f.gateId}: ${f.departureRisk} — ${f.riskFactors[0] ?? 'elevated pressure'}`),
            ]);
          }
          setCopilotAnswer(null);
          setCommandInput('');
          return;
        }

        // E. Predictive queries
        if (/\b(?:what.*(?:worse|next|happen.*nothing)|where.*pressure.*mov|how\s+likely.*stab|do\s+nothing|forecast|predict)/i.test(raw)) {
          if (forecast) {
            const cascadeNote = cascadeRisks.length > 0 ? ` Cascade risk: ${cascadeRisks[0].direction} (${cascadeRisks[0].transferLikelihood}% likely, ~${cascadeRisks[0].estimatedMinutes}m).` : '';
            setCopilotAnswer({
              title: 'Operational Forecast',
              answer: `${forecast.summary}${cascadeNote} Recovery confidence: ${recoveryConf.score}% (${recoveryConf.overallConfidence}). Estimated stabilization: ${recoveryConf.estimatedStabilizationMin}m.`,
              confidence: forecast.globalConfidence,
              bullets: [
                ...forecast.zones.filter(z => z.trend !== 'stable').map(z => `${z.zoneLabel}: ${z.currentPressure} → ${z.pressure15m} (+15m) [${z.trend}]`),
                ...cascadeRisks.slice(0, 2).map(cr => `Cascade: ${cr.direction} — ${cr.transferLikelihood}% likely`),
                ...recoveryConf.weaknesses.slice(0, 2),
              ],
              assumptions: ['Assumes no new critical incidents', 'Based on current recovery trajectory'],
              recommendedNextAction: forecast.globalTrend === 'rising' ? 'Intervene before pressure escalates further' : undefined,
              source: 'deterministic_operational_model',
            });
            setCommandResponse(null);
            setCommandInput('');
            return;
          }
        }

        // F. Scenario simulation queries
        if (/\b(?:compare.*(?:option|recovery|scenario|intervention)|simulate.*(?:stab|recovery|intervention)|what\s+if.*(?:intervene|dispatch|reroute|reassign|delay|nothing)|(?:best|safest|fastest).*(?:recovery|option|move)|which.*(?:recovery|option|intervention).*(?:best|work))/i.test(raw)) {
          if (forecast) {
            const scenarios = compareScenarios(selectedZoneId ?? undefined, operationalAssessment, forecast, cascadeRisks, recoveryConf, opProfile);
            const bullets = scenarios.map(s => {
              const tgt = s.outcomes.find(o => o.zoneId === (selectedZoneId ?? operationalAssessment.zoneAssessments[0]?.zoneId));
              return `${s.label}: pressure ${tgt?.currentPressure ?? '?'} → ${tgt?.projectedPressure ?? '?'}, stabilize ~${s.overallStabilizationMin}m (${s.overallConfidence})`;
            });
            const best = scenarios.reduce((a, b) => {
              const aP = a.outcomes[0]?.projectedPressure ?? 100;
              const bP = b.outcomes[0]?.projectedPressure ?? 100;
              return aP <= bP ? a : b;
            });
            setCopilotAnswer({
              title: 'Scenario Comparison',
              answer: `Comparing ${scenarios.length} intervention scenarios. ${best.label} projects the best outcome: ${best.narrative}`,
              confidence: best.overallConfidence,
              bullets,
              assumptions: ['Deterministic modeled estimates', 'Assumes current operational trajectory continues'],
              recommendedNextAction: best.intervention !== 'no_action' ? `Approve: ${best.label}` : 'Monitor — no intervention recommended',
              source: 'deterministic_operational_model',
            });
            setCommandResponse(null);
            setCommandInput('');
            return;
          }
        }

        // G. Weather check (before copilot)
        if (isWeatherQuestion(raw)) {
          setCommandResponse(null);
          setCopilotAnswer({ title: 'Weather', answer: 'Fetching weather...', confidence: 'moderate', bullets: [], assumptions: [], source: 'deterministic_operational_model' });
          fetchLiveWeather(operator.station).then(weather => {
            const wa = generateWeatherAnswer(weather, raw);
            setCopilotAnswer({
              title: wa.title,
              answer: wa.answer,
              confidence: 'high',
              bullets: wa.bullets,
              assumptions: weather.isDemo ? ['Live weather unavailable — using demo weather'] : [],
              source: 'deterministic_operational_model',
            });
          });
          setCommandInput('');
          return;
        }

        // E. LLM intent interpreter is PRIMARY for unmatched input
        setCommandResponse(null);
        setCopilotAnswer({ title: 'Processing', answer: 'Interpreting...', confidence: 'moderate', bullets: [], assumptions: [], source: 'deterministic_operational_model' });

        fetch('/api/soi/llm-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: raw }),
        }).then(r => r.json()).then(data => {
          if (data.intent && data.intent.intent !== 'unknown') {
            routeLLMIntent(data.intent, raw);
          } else {
            // LLM couldn't interpret — fall back to deterministic copilot
            const opCtx = {
              assessment: operationalAssessment,
              recommendations: soiRecommendations,
              dispatchPlan,
              activeIncidentCount: temporalIncidents.filter(i => i.status !== 'RESOLVED' && i.status !== 'CLOSED').length,
              activeRecoveryCount: temporalRecoveryActions.filter(ra => ra.status === 'ACTIVE' || ra.status === 'ACKNOWLEDGED').length,
            };
            const result = answerOperationalQuestion(raw, opCtx, zones, conversationMemory, true);
            setCopilotAnswer(result.answer);
            setConversationMemory(result.updatedMemory);
            setLastInferredFrom(result.inferredFrom);
          }
        }).catch(() => {
          // API unavailable — fall back to deterministic copilot
          const opCtx = {
            assessment: operationalAssessment,
            recommendations: soiRecommendations,
            dispatchPlan,
            activeIncidentCount: temporalIncidents.filter(i => i.status !== 'RESOLVED' && i.status !== 'CLOSED').length,
            activeRecoveryCount: temporalRecoveryActions.filter(ra => ra.status === 'ACTIVE' || ra.status === 'ACKNOWLEDGED').length,
          };
          const result = answerOperationalQuestion(raw, opCtx, zones, conversationMemory, true);
          setCopilotAnswer(result.answer);
          setConversationMemory(result.updatedMemory);
          setLastInferredFrom(result.inferredFrom);
        });

        // Voice rewrite handled by the copilot answer useEffect
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
    setNarrativeFeed(createNarrativeFeed());
    prevStepPhasesRef.current = exec.steps.map(s => s.phase);

    // Dispatch all steps sequentially with live state updates
    const plan = cmdMemory.activePlan;
    for (let i = 0; i < plan.steps.length; i++) {
      exec = await liveDispatchNext(exec, plan, operator.userId, operator.role);
      setLiveExec({ ...exec });
    }

    // Generate initial dispatch narratives
    const zoneLabel = plan.objective.targetZoneLabel ?? plan.objective.targetZone ?? 'target zone';
    setNarrativeFeed(prev => {
      let f = prev;
      for (let i = 0; i < exec.steps.length; i++) {
        if (exec.steps[i].phase !== 'queued') {
          f = narrateStep(f, plan.steps[i], exec.steps[i], null, zoneLabel);
        }
      }
      return f;
    });
    prevStepPhasesRef.current = exec.steps.map(s => s.phase);

    // Start tick interval for step progression
    startExecutionTick(plan);
  }

  function startExecutionTick(plan: ExecutionPlan) {
    if (liveExecTickRef.current) clearInterval(liveExecTickRef.current);
    const zoneLabel = plan.objective.targetZoneLabel ?? plan.objective.targetZone ?? 'target zone';

    liveExecTickRef.current = setInterval(() => {
      setLiveExec(prev => {
        if (!prev || !isExecutionActive(prev)) {
          if (liveExecTickRef.current) clearInterval(liveExecTickRef.current);
          return prev;
        }
        const next = tickExecution(prev, plan);

        // Chain health monitoring
        let report: import('@/lib/soi-execution').ChainMonitorReport | null = null;
        if (cmdMemory.preExecutionAssessment) {
          report = evaluateChainHealth(next, cmdMemory.preExecutionAssessment, operationalAssessment);
          const recs = generateAdaptiveRecommendations(report, next);
          if (recs.length > 0) {
            setAdaptiveRecs(recs);
            setNarrativeFeed(prevFeed => narrateAdaptive(prevFeed, recs, zoneLabel));
          }
        }

        // Generate narratives for step transitions
        const prevPhases = prevStepPhasesRef.current;
        for (let i = 0; i < next.steps.length; i++) {
          if (next.steps[i].phase !== prevPhases[i]) {
            setNarrativeFeed(prevFeed => narrateStep(prevFeed, plan.steps[i], next.steps[i], report, zoneLabel));
          }
        }
        prevStepPhasesRef.current = next.steps.map(s => s.phase);

        // Chain health narratives
        if (report) {
          setNarrativeFeed(prevFeed => narrateChainHealth(prevFeed, report!, next, zoneLabel));
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

  // ── Voice input setup ──
  // Check OpenAI TTS availability
  useEffect(() => {
    checkOpenAITTS().then(available => {
      setTtsMode(available ? 'openai' : (isTTSAvailable() ? 'browser' : 'unavailable'));
    });
    onOpenAISpeakingChange(speaking => {
      setTtsState(speaking ? 'speaking' : 'idle');
    });
  }, []);

  /** Speak using best available TTS (OpenAI preferred, browser fallback). */
  async function soiSpeak(text: string) {
    if (!ttsOn) return;
    if (ttsMode === 'openai') {
      const used = await speakWithOpenAI(text);
      if (used) return;
    }
    soiSpeak(text);
  }

  useEffect(() => {
    onVoiceStateChange(setVoiceState);
    onTTSStateChange(setTtsState);
    onVoiceResult(result => {
      if (!result.isFinal) {
        setInterimTranscript(result.transcript);
        return;
      }
      setInterimTranscript('');
      lastInputWasVoiceRef.current = true;
      const cmd = routeVoiceCommand(result.transcript);
      handleCommand(cmd.text);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Speak copilot answers when voice input was used ──
  useEffect(() => {
    if (!ttsOn || !lastInputWasVoiceRef.current) return;
    let spoken = false;
    if (copilotAnswer && copilotAnswer.answer !== prevCopilotAnswerRef.current) {
      prevCopilotAnswerRef.current = copilotAnswer.answer;
      soiSpeak(condenseForSpeech(copilotAnswer.answer));
      spoken = true;
    }
    if (!spoken && commandResponse && commandResponse.length > 0) {
      const text = commandResponse.slice(0, 3).join('. ');
      soiSpeak(condenseForSpeech(text));
    }
    lastInputWasVoiceRef.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copilotAnswer, commandResponse]);

  // ── Speak narratives that qualify ──
  useEffect(() => {
    if (!ttsOn) return;
    const visible = getVisibleNarratives(narrativeFeed, 1);
    if (visible.length === 0) return;
    const latest = visible[0];
    if (shouldSpeak(latest.category)) {
      const text = condenseForSpeech(latest.narrative);
      const priority = getSpokenPriority(latest.category);
      if (priority === 'critical') {
        speakCritical(text, latest.category);
      } else {
        speak(text, priority, latest.category);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narrativeFeed.entries.length]);

  // ── Ambient cues on execution state changes ──
  useEffect(() => {
    if (!ambientOn || !liveExec) return;
    if (liveExec.phase === 'completed') playAmbientCue('chain_complete');
    else if (liveExec.phase === 'failed') playAmbientCue('chain_failed');
    else if (liveExec.phase === 'blocked') playAmbientCue('stalled');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveExec?.phase, ambientOn]);

  // ── Route LLM-interpreted intents into SOI engines ──
  function routeLLMIntent(li: { intent: string; gate?: string; zone?: string; resource?: string; confidence: number; reasoning: string }, _raw: string) {
    // Resolve gate → zone
    let targetZone = li.zone ? resolveZonePattern(li.zone, zones) ?? undefined : undefined;
    const targetGate = li.gate?.toUpperCase();
    if (!targetZone && targetGate) {
      targetZone = resolveZonePattern(targetGate, zones) ?? undefined;
    }

    switch (li.intent) {
      case 'focus_gate': {
        if (targetGate) {
          setSelectedGateId(targetGate);
          if (targetZone) setSelectedZoneId(targetZone);
          const gateInc = temporalIncidents.filter(i => i.gate_id === targetGate && i.status !== 'RESOLVED' && i.status !== 'CLOSED');
          if (gateInc.length > 0) {
            setCommandResponse([
              `Gate ${targetGate}: ${gateInc.length} active incident${gateInc.length > 1 ? 's' : ''}`,
              ...gateInc.slice(0, 3).map(i => `· ${i.severity} — ${i.title.slice(0, 50)}`),
            ]);
          } else {
            setCommandResponse([`Gate ${targetGate}: No active incidents. Gate operational.`]);
          }
          setCopilotAnswer(null);
        }
        break;
      }
      case 'focus_zone': {
        if (targetZone) {
          setSelectedZoneId(targetZone);
          setCommandResponse([`Focused on zone: ${zones.find(z => z.id === targetZone)?.label ?? targetZone}`]);
          setCopilotAnswer(null);
        }
        break;
      }
      case 'explain_gate':
      case 'explain_zone': {
        const zoneId = targetZone ?? (targetGate ? resolveZonePattern(targetGate, zones) ?? undefined : undefined);
        if (zoneId) {
          const lines = explainInstability(zoneId, zones, temporalEvents, temporalIncidents, temporalRecoveryActions, asOf);
          setCommandResponse(lines);
          setCopilotAnswer(null);
        }
        break;
      }
      case 'stabilize_zone':
      case 'stabilize_worst': {
        // Re-route through agentic handler
        const syntheticCommand = targetGate ? `stabilize ${targetGate}` : targetZone ? `stabilize zone` : 'stabilize worst zone';
        handleCommand(syntheticCommand);
        break;
      }
      case 'recovery_plan': {
        handleCommand('what should we do');
        break;
      }
      case 'risk_assessment': {
        handleCommand('what is our biggest risk');
        break;
      }
      case 'approval_dispatch': {
        handleCommand('approve');
        break;
      }
      case 'cancel_action': {
        handleCommand('cancel');
        break;
      }
      case 'briefing': {
        handleCommand('summarize');
        break;
      }
      case 'plan_status': {
        handleCommand('show plan status');
        break;
      }
      case 'weather_query': {
        setCopilotAnswer({ title: 'Weather', answer: 'Fetching weather...', confidence: 'moderate', bullets: [], assumptions: [], source: 'deterministic_operational_model' });
        setCommandResponse(null);
        fetchLiveWeather(operator.station).then(weather => {
          const wa = generateWeatherAnswer(weather, _raw);
          setCopilotAnswer({
            title: wa.title,
            answer: wa.answer,
            confidence: 'high',
            bullets: wa.bullets,
            assumptions: weather.isDemo ? ['Live weather unavailable — using demo weather'] : [],
            source: 'deterministic_operational_model',
          });
        });
        break;
      }
      case 'workforce_query': {
        const ws = workforceState;
        setCopilotAnswer({
          title: 'Workforce Status',
          answer: `${ws.totalOnShift} personnel on shift. ${ws.rampAgentsOnShift} ramp agents. ${ws.available.length} available, ${ws.assigned.length} assigned, ${ws.recovering.length} in recovery.`,
          confidence: 'high',
          bullets: [
            `Available: ${ws.available.map(m => m.name).join(', ') || 'None'}`,
            `Assigned: ${ws.assigned.map(m => m.name).join(', ') || 'None'}`,
            `Recovering: ${ws.recovering.map(m => m.name).join(', ') || 'None'}`,
            ws.isDemo ? 'Demo workforce model' : '',
          ].filter(Boolean),
          assumptions: ws.isDemo ? ['Workforce data is demo-derived, not live roster'] : [],
          source: 'deterministic_operational_model',
        });
        setCommandResponse(null);
        break;
      }
      case 'workforce_status': {
        const ws = workforceState;
        // Check if asking about specific person
        if (li.resource) {
          const member = ws.roster.find(m => m.id === li.resource?.toUpperCase());
          if (member) {
            setCopilotAnswer({
              title: `${member.name}`,
              answer: `${member.name} (${member.role}) is ${member.status}${member.currentGate ? ` at gate ${member.currentGate}` : member.currentZone ? ` in ${member.currentZone}` : ''}. Workload: ${member.workload}/3.`,
              confidence: 'high', bullets: [], assumptions: ws.isDemo ? ['Demo workforce model'] : [],
              source: 'deterministic_operational_model',
            });
          } else {
            setCopilotAnswer({ title: 'Not Found', answer: `Could not find crew member ${li.resource}.`, confidence: 'low', bullets: [], assumptions: [], source: 'deterministic_operational_model' });
          }
        } else {
          // General workload overview
          const overloaded = ws.roster.filter(m => m.workload >= 2 && m.status !== 'off_shift');
          setCopilotAnswer({
            title: 'Workload Overview',
            answer: overloaded.length > 0 ? `${overloaded.length} crew member${overloaded.length > 1 ? 's' : ''} at elevated workload: ${overloaded.map(m => m.name).join(', ')}.` : 'No crew members at elevated workload.',
            confidence: 'high', bullets: overloaded.map(m => `${m.name}: workload ${m.workload}/3, ${m.status}`),
            assumptions: ws.isDemo ? ['Demo workforce model'] : [],
            source: 'deterministic_operational_model',
          });
        }
        setCommandResponse(null);
        break;
      }
      case 'assign_team': {
        const gate = (li.gate ?? targetGate ?? '').toUpperCase();
        if (!gate) {
          setCopilotAnswer({ title: 'Assignment', answer: 'Which gate should I assign a team to? Specify a gate like 52D.', confidence: 'low', bullets: [], assumptions: [], source: 'deterministic_operational_model' });
          setCommandResponse(null);
          break;
        }
        const rec = recommendTeamForGate(workforceState, gate);
        if (rec.members.length === 0) {
          setCopilotAnswer({ title: 'No Available Crew', answer: `No agents currently available for assignment to ${gate}. ${rec.reasoning}`, confidence: 'moderate', bullets: [], assumptions: ['Demo workforce model'], source: 'deterministic_operational_model' });
        } else {
          setPendingAssignment({ gate, members: rec.members.map(m => m.id), reasoning: rec.reasoning });
          const gateInc = temporalIncidents.filter(i => i.gate_id === gate && i.status !== 'RESOLVED' && i.status !== 'CLOSED');
          setCopilotAnswer({
            title: `Assign Team to ${gate}`,
            answer: `Recommended: ${rec.members.map(m => m.name).join(' and ')}. ${rec.reasoning}`,
            confidence: 'high',
            bullets: [
              ...rec.members.map(m => `${m.name} (${m.role}) — ${m.status}, workload ${m.workload}/3`),
              gateInc.length > 0 ? `${gate} has ${gateInc.length} active incident${gateInc.length > 1 ? 's' : ''}` : `${gate} operational`,
              'Projected impact: pressure reduction within 12–18 minutes',
            ],
            assumptions: ['Demo workforce model'],
            recommendedNextAction: 'Say "confirm" to dispatch',
            source: 'deterministic_operational_model',
          });
        }
        setCommandResponse(null);
        break;
      }
      default: {
        // LLM couldn't resolve — show reasoning
        setCommandResponse([`SOI: ${li.reasoning ?? 'I can help with gates, zones, staffing, recovery, weather, or status. Try being more specific.'}`]);
        setCopilotAnswer(null);
        break;
      }
    }
  }

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

  // Access code handler
  function handleAccessCode() {
    const op = validateAccessCode(accessCode);
    if (op) {
      storeIdentity(op);
      setOperator(op);
      setShowAccessPrompt(false);
      setAccessError('');
      const g = generateGreeting(op);
      setGreeting(g);
      if (ttsOn) soiSpeak(g);
      setTimeout(() => setGreeting(null), 12000);
    } else {
      setAccessError('Invalid access code. Try: CHIEF52, MGRLAX, OPSDIR, or AGENT14');
    }
  }

  // Derived data for spatial field
  const recoveryProgress = (() => {
    const active = temporalRecoveryActions.filter(ra => ra.status !== 'COMPLETE' && ra.status !== 'WITHDRAWN' && ra.status !== 'ESCALATED');
    const completed = temporalRecoveryActions.filter(ra => ra.status === 'COMPLETE');
    const total = active.length + completed.length;
    return { active: active.length, completed: completed.length, total, pct: total > 0 ? Math.round((completed.length / total) * 100) : 0 };
  })();

  // ── Module content renderer ──
  function renderModuleContent(moduleId: string): React.ReactNode {
    const mono: React.CSSProperties = { fontFamily: 'var(--sf-mono)', fontSize: 11, color: 'var(--sf-ink-2)' };
    const label: React.CSSProperties = { fontFamily: 'var(--sf-mono)', fontSize: 8, letterSpacing: '.16em', textTransform: 'uppercase' as const, color: 'var(--sf-ink-4)', marginBottom: 4 };
    const val: React.CSSProperties = { fontFamily: 'var(--sf-mono)', fontSize: 16, fontWeight: 700 };

    switch (moduleId) {
      case 'op-snapshot': {
        const ai = temporalIncidents.filter(i => i.status !== 'RESOLVED' && i.status !== 'CLOSED').length;
        return (<div style={mono}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <div><div style={label}>Pressure</div><div style={{ ...val, color: operationalAssessment.globalPressure >= 70 ? 'var(--sf-red)' : operationalAssessment.globalPressure >= 40 ? 'var(--sf-amber)' : 'var(--sf-green)' }}>{operationalAssessment.globalPressure}</div></div>
            <div><div style={label}>Incidents</div><div style={val}>{ai}</div></div>
            <div><div style={label}>Recovery</div><div style={val}>{recoveryProgress.active}</div></div>
          </div>
          <div style={{ fontSize: 9, color: 'var(--sf-ink-3)' }}>{operationalAssessment.globalStability.toUpperCase()}</div>
        </div>);
      }
      case 'zone-health':
        return (<div>{operationalAssessment.zoneAssessments.map(za => (
          <div key={za.zoneId} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--sf-line)', ...mono }}>
            <span style={{ color: 'var(--sf-ink)' }}>{za.zoneLabel}</span>
            <span style={{ color: za.pressure >= 70 ? 'var(--sf-red)' : za.pressure >= 40 ? 'var(--sf-amber)' : 'var(--sf-green)', fontWeight: 700 }}>{za.pressure}</span>
          </div>
        ))}</div>);
      case 'staffing':
        return (<div style={mono}>{workforceState.rampAgentsOnShift} agents · {workforceState.available.length} available{workforceState.isDemo ? ' · demo' : ''}</div>);
      case 'recovery-status':
        return (<div style={mono}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 6 }}><span>{recoveryProgress.completed}/{recoveryProgress.total} complete</span><span style={{ color: 'var(--sf-cyan)' }}>{recoveryProgress.pct}%</span></div>
          <div style={{ height: 3, background: 'var(--sf-line)', borderRadius: 1 }}><div style={{ height: '100%', width: `${recoveryProgress.pct}%`, background: 'var(--sf-cyan)', borderRadius: 1 }} /></div>
        </div>);
      case 'op-intelligence':
        return (<div style={mono}>{soiRecommendations.length > 0 ? soiRecommendations.slice(0, 2).map(r => (
          <div key={r.id} style={{ marginBottom: 6, paddingBottom: 6, borderBottom: '1px solid var(--sf-line)' }}>
            <div style={{ color: 'var(--sf-ink)', fontWeight: 600, marginBottom: 2 }}>{r.title}</div>
            <div style={{ fontSize: 9, color: 'var(--sf-ink-3)' }}>{r.summary.slice(0, 80)}...</div>
          </div>
        )) : <span style={{ color: 'var(--sf-ink-3)' }}>No active recommendations</span>}</div>);
      case 'recovery-confidence':
        return (<div style={mono}>
          <div style={{ ...val, color: recoveryConf.score >= 70 ? 'var(--sf-green)' : recoveryConf.score >= 40 ? 'var(--sf-amber)' : 'var(--sf-red)' }}>{recoveryConf.score}%</div>
          <div style={{ fontSize: 9, color: 'var(--sf-ink-3)', marginTop: 2 }}>Est. stabilization: {recoveryConf.estimatedStabilizationMin}m</div>
        </div>);
      case 'recommended-next':
        return (<div style={mono}>{soiRecommendations[0]?.title ?? 'No recommendation'}</div>);
      case 'equipment-roster':
        return (<div style={mono}>{temporalEvents.filter(e => e.equipment_id && e.operational_status !== 'RESOLVED').length > 0 ? 'Equipment issues active' : 'All equipment operational'}</div>);
      case 'crew-assignments':
        return (<div style={mono}>{workforceState.assigned.length} assigned · {workforceState.recovering.length} recovering</div>);
      case 'all-zones':
        return (<div>{operationalAssessment.zoneAssessments.map(za => (
          <div key={za.zoneId} style={{ padding: '6px 0', borderBottom: '1px solid var(--sf-line)', ...mono }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--sf-ink)' }}>{za.zoneLabel}</span>
              <span style={{ color: za.stability === 'critical' ? 'var(--sf-red)' : za.stability === 'stable' ? 'var(--sf-green)' : 'var(--sf-amber)' }}>{za.stability}</span>
            </div>
            <div style={{ fontSize: 9, color: 'var(--sf-ink-3)' }}>{za.unresolvedCount} incidents · {za.activeRecoveryCount} recovery</div>
          </div>
        ))}</div>);
      case 'workforce-dist':
        return (<div style={mono}>{workforceState.roster.filter(m => m.status !== 'off_shift').map(m => (
          <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 10 }}>
            <span>{m.name}</span><span style={{ color: m.status === 'available' ? 'var(--sf-green)' : m.status === 'recovering' ? 'var(--sf-amber)' : 'var(--sf-ink-3)' }}>{m.status}</span>
          </div>
        ))}</div>);
      case 'assignment-queue':
      case 'pending-dispatches':
        return (<div style={mono}>{temporalRecoveryActions.filter(ra => ra.status === 'PROPOSED').length} pending dispatch{temporalRecoveryActions.filter(ra => ra.status === 'PROPOSED').length !== 1 ? 'es' : ''}</div>);
      case 'flight-schedule':
        return (<div style={mono}>{[...flightWorldMap.values()].filter(f => f.departureRisk !== 'LOW').length} flights at elevated risk</div>);
      case 'incident-timeline':
      case 'audit-trail':
        return (<div style={mono}>{temporalEvents.slice(0, 3).map(e => (
          <div key={e.id} style={{ fontSize: 9, padding: '2px 0', color: 'var(--sf-ink-3)' }}>{e.event_type.replace(/_/g, ' ')} · {e.gate_id ?? ''}</div>
        ))}</div>);
      case 'quick-kpi-ribbon':
        return (<div style={{ display: 'flex', gap: 16, ...mono }}>
          <span>P:{operationalAssessment.globalPressure}</span>
          <span>I:{temporalIncidents.filter(i => i.status !== 'RESOLVED' && i.status !== 'CLOSED').length}</span>
          <span>R:{recoveryProgress.active}</span>
        </div>);
      default:
        return (<div style={{ ...mono, color: 'var(--sf-ink-4)' }}>{moduleId}</div>);
    }
  }

  function renderSlot(slotId: SlotId) {
    const inst = layoutSlots[slotId];
    if (!inst) {
      return editMode ? (
        <div key={slotId} style={{ padding: 10, border: '1px dashed var(--sf-amber,#f3b13c)', borderRadius: 8, opacity: .4, fontSize: 9, color: 'var(--sf-ink-4)', textAlign: 'center' as const, cursor: 'pointer' }}
          onClick={() => { setGalleryTarget(slotId); setShowModuleGallery(true); }}>
          + {slotId}
        </div>
      ) : null;
    }
    const def = getModuleDef(inst.moduleId);
    return (
      <div key={slotId}>
        <ModuleFrame moduleId={inst.moduleId} name={def?.name ?? inst.moduleId} size={inst.size} emphasized={inst.emphasized} editMode={editMode}>
          {renderModuleContent(inst.moduleId)}
        </ModuleFrame>
        {editMode && (
          <div style={{ display: 'flex', gap: 3, justifyContent: 'center', padding: '3px 0', opacity: .5 }}>
            <button onClick={() => moveModuleInRail(slotId, 'up')} style={{ background: 'none', border: '1px solid var(--sf-line)', borderRadius: 4, padding: '1px 6px', fontSize: 8, color: 'var(--sf-ink-4)', cursor: 'pointer', fontFamily: 'var(--sf-mono)' }}>↑</button>
            <button onClick={() => moveModuleInRail(slotId, 'down')} style={{ background: 'none', border: '1px solid var(--sf-line)', borderRadius: 4, padding: '1px 6px', fontSize: 8, color: 'var(--sf-ink-4)', cursor: 'pointer', fontFamily: 'var(--sf-mono)' }}>↓</button>
            <button onClick={() => removeModule(slotId)} style={{ background: 'none', border: '1px solid var(--sf-line)', borderRadius: 4, padding: '1px 6px', fontSize: 8, color: 'var(--sf-red,#ff5564)', cursor: 'pointer', fontFamily: 'var(--sf-mono)' }}>×</button>
          </div>
        )}
      </div>
    );
  }


  return (
    <>
      {/* Access code prompt */}
      {showAccessPrompt && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 380, padding: '40px 32px', background: 'var(--sf-bg,#080b10)', border: '1px solid var(--sf-line)', fontFamily: 'var(--sf-sans)' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--sf-cyan,#52d6e6)', letterSpacing: '.06em', marginBottom: 4 }}>SOI</div>
            <div style={{ fontSize: 7, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--sf-ink-3)', marginBottom: 24 }}>Operational Intelligence Mission Control</div>
            <input type="text" value={accessCode} onChange={e => setAccessCode(e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === 'Enter') handleAccessCode(); }} placeholder="ACCESS CODE" autoFocus
              style={{ width: '100%', padding: '10px 14px', marginBottom: 10, background: 'var(--sf-void,#05070a)', border: '1px solid var(--sf-line)', color: 'var(--sf-ink)', fontFamily: 'inherit', fontSize: 15, letterSpacing: '.12em', textAlign: 'center' }} />
            {accessError && <div style={{ fontSize: 9, color: 'var(--sf-red)', marginBottom: 8, textAlign: 'center' }}>{accessError}</div>}
            <button onClick={handleAccessCode} style={{ width: '100%', padding: '8px', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', fontFamily: 'inherit', background: 'none', border: '1px solid var(--sf-cyan)', color: 'var(--sf-cyan)', cursor: 'pointer', borderRadius: 6 }}>Authenticate</button>
            <div style={{ fontSize: 8, color: 'var(--sf-ink-4)', textAlign: 'center', marginTop: 12 }}>Demo codes: CHIEF52 · MGRLAX · OPSDIR · AGENT14</div>
          </div>
        </div>
      )}

      {/* ═══ SURFACE SHELL ═══ */}
      <div className={`sf-shell${crisisMode ? ' crisis' : ''}`}>

        {/* ── A1: HEADER ── */}
        <header className="sf-header">
          <div className="sf-brand">
            <div>
              <div className="sf-brand-name">SOI</div>
              <div className="sf-brand-sub">Operational Intelligence</div>
            </div>
          </div>
          <div className="sf-hdr-div" />
          <div>
            <div className="sf-station-code">{operator.station}</div>
            <div className="sf-station-mode">Eagle Operations</div>
          </div>
          <div className="sf-hdr-spacer" />

          {/* Greeting */}
          {greeting && <div style={{ fontSize: 11, color: 'var(--sf-cyan)', opacity: .7 }}>{greeting}</div>}

          {/* Layout selector */}
          <div className="sf-layout-pill" onClick={() => {
            const roles: RoleId[] = ['crew_chief', 'ramp_manager', 'dispatcher', 'executive'];
            const next = roles[(roles.indexOf(activeRole) + 1) % roles.length];
            switchRole(next);
          }}>
            <div className="sf-layout-pip" />
            <div className="sf-layout-label">{ROLE_LABELS[activeRole]}</div>
          </div>

          {/* Edit / Crisis toggles */}
          <button onClick={() => setEditMode(!editMode)} style={{ background: 'none', border: '1px solid var(--sf-line)', borderRadius: 6, padding: '4px 10px', fontFamily: 'var(--sf-mono)', fontSize: 8, letterSpacing: '.14em', textTransform: 'uppercase', color: editMode ? 'var(--sf-cyan)' : 'var(--sf-ink-4)', cursor: 'pointer' }}>
            {editMode ? 'Exit Edit' : 'Edit'}
          </button>
          <button onClick={toggleCrisis} style={{ background: crisisMode ? 'rgba(255,125,77,.06)' : 'none', border: `1px solid ${crisisMode ? 'rgba(255,125,77,.3)' : 'var(--sf-line)'}`, borderRadius: 6, padding: '4px 10px', fontFamily: 'var(--sf-mono)', fontSize: 8, letterSpacing: '.14em', textTransform: 'uppercase', color: crisisMode ? 'var(--sf-orange,#ff7d4d)' : 'var(--sf-ink-4)', cursor: 'pointer' }}>
            Crisis
          </button>

          <div className="sf-conditions">{liveTime}</div>
          <div className="sf-hdr-div" />
          <div className="sf-operator">
            <div className="sf-op-avatar">{operator.displayName.charAt(0)}</div>
            <div>
              <div className="sf-op-name">{operator.displayName}</div>
              <div className="sf-op-role">{getRoleLabel(operator)}</div>
            </div>
          </div>
        </header>

        {/* Edit mode banner */}
        {editMode && (
          <div className="sf-edit-banner">
            <div className="sf-edit-pill"><div className="dot" /><div className="label">Edit Layout</div></div>
            <span style={{ flex: 1 }} />
            <button onClick={() => { setLayoutSlots(getRolePreset(activeRole)); setEditMode(false); }} style={{ background: 'none', border: '1px solid var(--sf-line)', borderRadius: 6, padding: '5px 12px', fontFamily: 'var(--sf-mono)', fontSize: 9, color: 'var(--sf-ink-3)', cursor: 'pointer', letterSpacing: '.1em', textTransform: 'uppercase' }}>Reset</button>
            <button onClick={() => setEditMode(false)} style={{ background: 'none', border: '1px solid var(--sf-line)', borderRadius: 6, padding: '5px 12px', fontFamily: 'var(--sf-mono)', fontSize: 9, color: 'var(--sf-ink-3)', cursor: 'pointer', letterSpacing: '.1em', textTransform: 'uppercase' }}>Cancel</button>
            <button onClick={saveCurrentLayout} className="sf-dock-btn primary" style={{ padding: '5px 14px' }}>Save</button>
          </div>
        )}

        {/* Crisis strip */}
        {crisisMode && (
          <div className="sf-crisis-strip">
            <div>
              <div className="sf-crisis-label">Active Crisis</div>
              <div className="sf-crisis-title">{soiRecommendations[0]?.title ?? 'Operational instability'}</div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 20, alignItems: 'center' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--sf-mono)', fontSize: 7, letterSpacing: '.2em', color: 'var(--sf-ink-4)', textTransform: 'uppercase' }}>Pressure</div>
                <div style={{ fontFamily: 'var(--sf-mono)', fontSize: 16, fontWeight: 500, color: 'var(--sf-orange,#ff7d4d)' }}>{operationalAssessment.globalPressure}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--sf-mono)', fontSize: 7, letterSpacing: '.2em', color: 'var(--sf-ink-4)', textTransform: 'uppercase' }}>Incidents</div>
                <div style={{ fontFamily: 'var(--sf-mono)', fontSize: 16, fontWeight: 500, color: 'var(--sf-ink)' }}>{temporalIncidents.filter(i => i.status !== 'RESOLVED' && i.status !== 'CLOSED').length}</div>
              </div>
            </div>
          </div>
        )}

        {/* Replay timeline */}
        <ReplayTimeline active={replayMode} playing={replayPlaying} currentTimestamp={replayTimestamp}
          startTimestamp={new Date(Math.min(...events.map(e => new Date(e.created_at).getTime()).filter(t => t > 0), Date.now() - 7200000))}
          endTimestamp={new Date()}
          eventTimestamps={events.filter(e => e.entity_type === 'incident' || e.entity_type === 'recovery_action').map(e => new Date(e.created_at).getTime()).filter(t => t > 0)}
          onScrub={ts => setReplayTimestamp(ts)} onTogglePlay={togglePlayback} onStep={stepReplay} onExit={exitReplay} />

        {/* ── BODY: 3-column grid ── */}
        <div className="sf-body">

          {/* LEFT RAIL */}
          <div className="sf-rail left">
            {LEFT_SLOTS.map(s => renderSlot(s))}
            {/* Dev controls */}
            <div style={{ marginTop: 'auto', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <button className="sf-dock-btn" style={{ fontSize: 7, padding: '3px 6px' }} onClick={() => { seedDemoScenario().then(() => { refresh(); refreshIncidents(); }); }}>Seed</button>
              <button className="sf-dock-btn" style={{ fontSize: 7, padding: '3px 6px' }} onClick={() => { clearDemoData().then(() => { refresh(); refreshIncidents(); }); }}>Clear</button>
              <button className="sf-dock-btn" style={{ fontSize: 7, padding: '3px 6px' }} onClick={refresh}>Refresh</button>
              {!replayMode && <button className="sf-dock-btn" style={{ fontSize: 7, padding: '3px 6px' }} onClick={startReplay}>Replay</button>}
            </div>
          </div>

          {/* CENTER STAGE */}
          <div className="sf-stage">
            {/* M1: Map anchor */}
            <div className="sf-map">
              <SpatialField
                assessment={operationalAssessment}
                gates={ALL_GATES}
                incidents={temporalIncidents}
                recoveryActions={temporalRecoveryActions}
                events={temporalEvents}
                flightWorld={flightWorldMap}
                selectedZoneId={selectedZoneId}
                selectedGateId={selectedGateId}
                liveExec={liveExec}
                activePlan={cmdMemory.activePlan}
                onGateClick={gateId => {
                  setSelectedGateId(gateId === selectedGateId ? null : gateId);
                  const zoneId = zones.find(z => z.gate_ids.includes(gateId))?.id;
                  if (zoneId) setSelectedZoneId(zoneId === selectedZoneId ? null : zoneId);
                }}
              />
            </div>

            {/* A2: Active Recommendation anchor */}
            {soiRecommendations.length > 0 && (() => {
              const rec = soiRecommendations[0];
              const sevColor = rec.severity === 'critical' ? 'var(--sf-red)' : rec.severity === 'high' ? 'var(--sf-amber)' : 'var(--sf-cyan)';
              return (
                <div className="sf-rec" style={crisisMode ? { flex: 1, minHeight: 200 } : undefined}>
                  <div>
                    <div className="sf-rec-label">Active Recommendation</div>
                    <div className="sf-rec-title">{rec.title}</div>
                    <div className="sf-rec-body">{rec.summary}</div>
                  </div>
                  <div className="sf-rec-metrics">
                    <div><div className="sf-rec-metric-k">Confidence</div><div className="sf-rec-metric-v" style={{ color: rec.confidence.score >= 70 ? 'var(--sf-green)' : 'var(--sf-amber)' }}>{rec.confidence.score}%</div></div>
                    <div><div className="sf-rec-metric-k">Stabilization</div><div className="sf-rec-metric-v">~{rec.estimatedStabilizationMinutes}m</div></div>
                    <div><div className="sf-rec-metric-k">Pressure</div><div className="sf-rec-metric-v"><span style={{ color: 'var(--sf-red)' }}>{rec.preview.beforePressure}</span> → <span style={{ color: 'var(--sf-green)' }}>{rec.preview.afterPressure}</span></div></div>
                  </div>
                  <div className="sf-rec-plan">
                    <div className="sf-rec-label">Modeled Recovery</div>
                    {rec.recommendedActions.slice(0, 4).map((a, i) => (
                      <div key={i} className="sf-rec-step">
                        <div className={`marker ${i === 0 ? 'done' : i === 1 ? 'active' : 'wait'}`} />
                        <span>{a.label}</span>
                      </div>
                    ))}
                    <button className="sf-rec-btn" onClick={() => handleCommand(`stabilize ${rec.affectedGate ?? rec.affectedZone}`)}>
                      {rec.title}
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Response panels */}
            {commandResponse && (
              <div style={{ margin: '8px 12px', padding: '12px 14px', background: 'var(--sf-elev)', border: '1px solid var(--sf-line)', borderLeft: '2px solid var(--sf-blue,#5a93ff)', borderRadius: 8, fontSize: 10, fontFamily: 'var(--sf-mono)', color: 'var(--sf-ink-2)' }}>
                {commandResponse.map((line, i) => <div key={i} style={{ padding: '1px 0', color: i === 0 ? 'var(--sf-ink)' : undefined }}>{line}</div>)}
                <button onClick={() => setCommandResponse(null)} style={{ marginTop: 4, padding: '2px 6px', background: 'none', border: '1px solid var(--sf-line)', borderRadius: 4, color: 'var(--sf-ink-4)', fontFamily: 'inherit', fontSize: 8, cursor: 'pointer' }}>dismiss</button>
              </div>
            )}
            {copilotAnswer && copilotAnswer.title !== 'Processing' && (
              <div style={{ margin: '8px 12px', padding: '12px 14px', background: 'var(--sf-elev)', border: '1px solid var(--sf-line)', borderLeft: '2px solid var(--sf-blue,#5a93ff)', borderRadius: 8, fontFamily: 'var(--sf-mono)' }}>
                <div style={{ fontSize: 7, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--sf-blue,#5a93ff)', marginBottom: 4 }}>SOI</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--sf-ink)', marginBottom: 4 }}>{copilotAnswer.title}</div>
                <div style={{ fontSize: 10, color: 'var(--sf-ink-2)', lineHeight: 1.5, marginBottom: 6 }}>{copilotAnswer.answer}</div>
                {copilotAnswer.bullets.length > 0 && copilotAnswer.bullets.slice(0, 4).map((b, i) => (
                  <div key={i} style={{ fontSize: 9, color: 'var(--sf-ink-3)', padding: '1px 0' }}>· {b}</div>
                ))}
                {copilotAnswer.recommendedNextAction && <div style={{ fontSize: 9, color: 'var(--sf-cyan)', marginTop: 4 }}>→ {copilotAnswer.recommendedNextAction}</div>}
                <button onClick={() => setCopilotAnswer(null)} style={{ marginTop: 6, padding: '2px 6px', background: 'none', border: '1px solid var(--sf-line)', borderRadius: 4, color: 'var(--sf-ink-4)', fontFamily: 'inherit', fontSize: 8, cursor: 'pointer' }}>dismiss</button>
              </div>
            )}

            {/* Execution plan */}
            {cmdMemory.activePlan && (
              <div style={{ margin: '8px 12px', padding: '12px 14px', background: 'var(--sf-elev)', border: '1px solid var(--sf-line)', borderLeft: '2px solid var(--sf-cyan)', borderRadius: 8, fontFamily: 'var(--sf-mono)' }}>
                <div style={{ fontSize: 7, color: 'var(--sf-cyan)', letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 4 }}>
                  {liveExec && isExecutionActive(liveExec) ? 'Recovery Active' : 'SOI Objective'}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sf-ink)', marginBottom: 4 }}>{cmdMemory.activePlan.objective.operationalGoal}</div>
                {cmdMemory.activePlan.steps.map((step, i) => {
                  const ls = liveExec?.steps[i];
                  const sc = ls?.phase === 'completed' ? 'var(--sf-green)' : ls?.phase === 'failed' ? 'var(--sf-red)' : ls?.phase === 'stalled' ? 'var(--sf-amber)' : (ls?.phase === 'active' || ls?.phase === 'dispatched' || ls?.phase === 'acknowledged') ? 'var(--sf-blue)' : 'var(--sf-ink-4)';
                  return (
                    <div key={step.stepId} style={{ padding: '3px 8px', marginBottom: 2, background: 'var(--sf-elev)', borderLeft: `2px solid ${sc}`, borderRadius: 4, display: 'flex', alignItems: 'center', gap: 6, fontSize: 9 }}>
                      <span style={{ color: sc, fontWeight: 700, width: 12 }}>{ls?.phase === 'completed' ? '✓' : ls?.phase === 'failed' ? '✗' : step.sequence}</span>
                      <span style={{ color: 'var(--sf-ink-2)', flex: 1 }}>{step.title}</span>
                    </div>
                  );
                })}
                {!replayMode && !liveExec && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                    <button className="sf-dock-btn primary" style={{ flex: 2 }} onClick={handleApprovePlan}>Approve</button>
                    <button className="sf-dock-btn" style={{ flex: 1 }} onClick={() => { setCmdMemory(clearCommandMemory(cmdMemory)); }}>Cancel</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* UTILITY ROW */}
          <div className="sf-utility">
            {UTILITY_SLOTS.map(s => renderSlot(s))}
          </div>

          {/* RIGHT RAIL */}
          <div className="sf-rail right">
            {/* Incident detail (when selected) */}
            {selectedIncident ? (
              <IncidentDetailPanel
                incident={selectedIncident} incidentEvents={incidentEvents} recoveryActions={recoveryActions}
                isTransitioning={incidentTransitioning === selectedIncident.id}
                onTransition={handleIncidentTransition} onBack={() => setSelectedIncidentId(null)}
                onCreateRecoveryAction={handleCreateRecoveryAction} onRecoveryTransition={handleRecoveryTransition}
                raTransitioning={raTransitioning} raSubmitting={raSubmitting}
                showRecoveryForm={showRecoveryForm} onToggleRecoveryForm={() => setShowRecoveryForm(!showRecoveryForm)}
              />
            ) : (
              <>
                {RIGHT_SLOTS.map(s => renderSlot(s))}
                {/* Quick incident triage */}
                {triageIncidents.length > 0 && (
                  <ModuleFrame moduleId="incidents" name="Priority Incidents" size="normal">
                    {triageIncidents.slice(0, 4).map(inc => {
                      const sevC = inc.severity === 'CRITICAL' ? 'var(--sf-red)' : inc.severity === 'HIGH' ? 'var(--sf-amber)' : 'var(--sf-blue)';
                      return (
                        <div key={inc.id} onClick={() => setSelectedIncidentId(inc.id)} style={{ padding: '6px 0', borderBottom: '1px solid var(--sf-line)', cursor: 'pointer', fontSize: 10 }}>
                          <div style={{ color: 'var(--sf-ink)', fontWeight: 500, marginBottom: 2 }}>{inc.title.length > 45 ? inc.title.slice(0, 45) + '...' : inc.title}</div>
                          <div style={{ fontSize: 8, color: 'var(--sf-ink-3)', display: 'flex', gap: 8 }}>
                            <span style={{ color: sevC }}>{inc.severity}</span>
                            <span>{inc.gate_id ?? ''}</span>
                            <ElapsedTime since={inc.opened_at} format="relative" />
                          </div>
                        </div>
                      );
                    })}
                  </ModuleFrame>
                )}
              </>
            )}
          </div>
        </div>

        {/* Crisis suggestion prompt */}
        {crisisSuggested && !crisisMode && (
          <div style={{ margin: '0 24px 8px', padding: '10px 18px', background: 'rgba(255,125,77,.04)', border: '1px solid rgba(255,125,77,.15)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 14, fontFamily: 'var(--sf-mono)' }}>
            <span style={{ fontSize: 10, color: 'var(--sf-orange,#ff7d4d)' }}>Pressure crossed threshold — switch to Crisis layout?</span>
            <span style={{ flex: 1 }} />
            <button onClick={toggleCrisis} className="sf-dock-btn" style={{ color: 'var(--sf-orange,#ff7d4d)', borderColor: 'rgba(255,125,77,.2)', padding: '5px 12px' }}>Switch</button>
            <button onClick={() => setCrisisSuggested(false)} className="sf-dock-btn" style={{ padding: '5px 10px' }}>Dismiss</button>
          </div>
        )}

        {/* Module gallery overlay */}
        {showModuleGallery && galleryTarget && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => { setShowModuleGallery(false); setGalleryTarget(null); }}>
            <div style={{ width: 480, maxHeight: '70vh', overflow: 'auto', background: 'var(--sf-bg,#080b10)', border: '1px solid var(--sf-line)', borderRadius: 12, padding: '20px 24px', fontFamily: 'var(--sf-sans)' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ fontFamily: 'var(--sf-mono)', fontSize: 8, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--sf-ink-4)', marginBottom: 12 }}>Add Module to {galleryTarget}</div>
              {(['core', 'dispatch', 'executive', 'utility', 'optional'] as const).map(cat => {
                const region = galleryTarget.startsWith('L') ? 'L' : galleryTarget.startsWith('R') ? 'R' : 'U';
                const modules = MODULE_REGISTRY.filter(m => m.category === cat && m.allowedRegions.includes(region as 'L' | 'R' | 'U'));
                if (modules.length === 0) return null;
                return (
                  <div key={cat} style={{ marginBottom: 14 }}>
                    <div style={{ fontFamily: 'var(--sf-mono)', fontSize: 7, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--sf-ink-3)', marginBottom: 6 }}>{cat}</div>
                    {modules.map(m => (
                      <div key={m.id} onClick={() => addModuleToSlot(galleryTarget, m.id)}
                        style={{ padding: '8px 10px', marginBottom: 4, background: 'var(--sf-elev)', border: '1px solid var(--sf-line)', borderRadius: 8, cursor: 'pointer', transition: '.15s' }}>
                        <div style={{ fontSize: 11, color: 'var(--sf-ink)', fontWeight: 500 }}>{m.name}</div>
                        <div style={{ fontSize: 8, color: 'var(--sf-ink-4)', marginTop: 2 }}>{m.defaultSize} · {m.allowedRegions.join(', ')}</div>
                      </div>
                    ))}
                  </div>
                );
              })}
              <button onClick={() => { setShowModuleGallery(false); setGalleryTarget(null); }} style={{ width: '100%', padding: '8px', marginTop: 8, background: 'none', border: '1px solid var(--sf-line)', borderRadius: 6, color: 'var(--sf-ink-3)', fontFamily: 'var(--sf-mono)', fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        )}

        {/* ── A3: COMMAND DOCK ── */}
        <div className="sf-dock">
          <div className="sf-waveform">
            <div className="sf-wave-bar" /><div className="sf-wave-bar" /><div className="sf-wave-bar" /><div className="sf-wave-bar" /><div className="sf-wave-bar" />
          </div>
          <input className="sf-dock-input" type="text" value={commandInput} onChange={e => setCommandInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && commandInput.trim()) { lastInputWasVoiceRef.current = false; handleCommand(commandInput); } }}
            placeholder="Ask SOI anything... assign a team, show me 52C, what should I worry about?" />
          <button className="sf-dock-btn primary" onClick={() => { if (commandInput.trim()) { lastInputWasVoiceRef.current = false; handleCommand(commandInput); } }} disabled={!commandInput.trim()}>Run</button>
          {isVoiceInputAvailable() && (
            <button className="sf-dock-mic" onMouseDown={() => startListening()} onMouseUp={() => stopListening()} onMouseLeave={() => { if (voiceState === 'listening') stopListening(); }} title="Push to talk">
              {voiceState === 'listening' ? '●' : '🎙'}
            </button>
          )}
          {isTTSAvailable() && <button className={`sf-dock-btn${ttsOn ? ' primary' : ''}`} onClick={() => { if (ttsOn) { disableTTS(); setTtsOn(false); } else { enableTTS(); setTtsOn(true); } }}>{ttsOn ? (ttsMode === 'openai' ? 'AI Voice' : 'Voice') : 'Voice'}</button>}
          {crisisMode && (
            <>
              <button className="sf-dock-btn" style={{ color: 'var(--sf-amber)' }} onClick={() => handleCommand('brief me')}>Brief Team</button>
              <button className="sf-dock-btn" style={{ color: 'var(--sf-orange,#ff7d4d)' }} onClick={() => handleCommand('stabilize worst zone')}>Escalate</button>
            </>
          )}
          {(voiceState !== 'idle' || ttsState === 'speaking') && (
            <span style={{ fontFamily: 'var(--sf-mono)', fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase', color: ttsState === 'speaking' ? 'var(--sf-blue)' : voiceState === 'listening' ? 'var(--sf-red)' : 'var(--sf-amber)' }}>
              {ttsState === 'speaking' ? 'speaking' : voiceState}
            </span>
          )}
        </div>
      </div>
    </>
  );
}

// ============================================================
// HELPERS
// ============================================================

// statusBorderColor, sevFg, sevBg removed — replaced by
// SeverityIndicator and OperationalStatus primitives from
// @/components/soi which derive colors from operational-states.ts.
