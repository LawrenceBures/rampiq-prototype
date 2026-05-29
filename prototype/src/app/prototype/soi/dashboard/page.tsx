'use client';

import { useState, useRef, useEffect } from 'react';
import { useLiveEvents, useRealtimeIncidents, useRecoveryActions, updateEventStatus, resetEvents, fetchZones, postAuditEvent, postEvent } from '@/lib/store';
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
  normalizeNatoGates,
  explainInstability,
  assessOperation,
  answerOperationalQuestion,
  createEmptyContext,
  updateContext,
  isContextActive,
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
import { getRolePreset, getCrisisPreset, createDefaultLayout, ROLE_LABELS } from '@/lib/soi-surface';
import dynamic from 'next/dynamic';
import './command.css';

// Lazy load 3D airport scene (Three.js is heavy)
const AirportScene = dynamic(() => import('@/components/soi/AirportScene').then(m => ({ default: m.AirportScene })), { ssr: false });
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
  // Interactive agent selection for assignment workflow
  const [agentSelection, setAgentSelection] = useState<{
    gate: string;
    candidates: { id: string; name: string; role: string; status: string; workload: number; currentZone?: string }[];
    selected: Set<string>;
    phase: 'picking' | 'confirming';
  } | null>(null);

  // ── Surface layout state (persisted) ──
  const ALL_LAYOUT_NAMES: LayoutName[] = ['Default', 'Operational', 'Focus', 'Crisis', 'Personal Custom'];

  const [activeRole, setActiveRole] = useState<RoleId>(() => {
    if (typeof window === 'undefined') return 'crew_chief';
    const stored = getStoredIdentity();
    if (stored?.viewerRole === 'manager') return 'ramp_manager';
    if (stored?.viewerRole === 'ops_director') return 'executive';
    return 'crew_chief';
  });
  const [activeLayoutName, setActiveLayoutName] = useState<LayoutName>(() => {
    if (typeof window === 'undefined') return 'Default';
    const stored = getStoredIdentity();
    const role: RoleId = stored?.viewerRole === 'manager' ? 'ramp_manager' : stored?.viewerRole === 'ops_director' ? 'executive' : 'crew_chief';
    return getLastUsedLayoutName(stored?.userId ?? 'anon', role, 'LAX');
  });
  const [layoutSlots, setLayoutSlots] = useState(() => {
    if (typeof window === 'undefined') return getRolePreset('crew_chief');
    try {
      const stored = getStoredIdentity();
      const role: RoleId = stored?.viewerRole === 'manager' ? 'ramp_manager' : stored?.viewerRole === 'ops_director' ? 'executive' : 'crew_chief';
      const lastLayout = getLastUsedLayoutName(stored?.userId ?? 'anon', role, 'LAX');
      if (lastLayout === 'Default') return getRolePreset(role);
      const saved = loadLayout(stored?.userId ?? 'anon', role, 'LAX', lastLayout);
      return saved?.slots ?? getRolePreset(role);
    } catch { return getRolePreset('crew_chief'); }
  });
  const [savedSlots, setSavedSlots] = useState(layoutSlots); // snapshot for diff
  const [editMode, setEditMode] = useState(false);
  const [leftRailOrder, setLeftRailOrder] = useState<number[]>(() => {
    try { const s = localStorage.getItem('soi_left_rail_order'); return s ? JSON.parse(s) : [0, 1, 2, 3]; } catch { return [0, 1, 2, 3]; }
  });
  const [rightRailOrder, setRightRailOrder] = useState<number[]>(() => {
    try { const s = localStorage.getItem('soi_right_rail_order'); return s ? JSON.parse(s) : [0, 1, 2]; } catch { return [0, 1, 2]; }
  });
  const [dragItem, setDragItem] = useState<{ rail: 'left' | 'right'; index: number } | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<{ rail: 'left' | 'right'; index: number } | null>(null);
  const [crisisMode, setCrisisMode] = useState(false);
  const [crisisSuggested, setCrisisSuggested] = useState(false);
  const [showModuleGallery, setShowModuleGallery] = useState(false);
  const [galleryTarget, setGalleryTarget] = useState<SlotId | null>(null);
  const [showLayoutDropdown, setShowLayoutDropdown] = useState(false);
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);

  // Diff detection
  const isModified = JSON.stringify(layoutSlots) !== JSON.stringify(savedSlots);
  const diffSummary = (() => {
    if (!isModified) return '';
    const changes: string[] = [];
    const allSlots = [...LEFT_SLOTS, ...RIGHT_SLOTS, ...UTILITY_SLOTS] as SlotId[];
    for (const s of allSlots) {
      const curr = layoutSlots[s];
      const saved = savedSlots[s];
      if (!curr && saved) changes.push(`${s}: ${getModuleDef(saved.moduleId)?.name ?? saved.moduleId} removed`);
      else if (curr && !saved) changes.push(`${s}: ${getModuleDef(curr.moduleId)?.name ?? curr.moduleId} added`);
      else if (curr && saved && curr.moduleId !== saved.moduleId) changes.push(`${s}: swapped`);
      else if (curr && saved && curr.size !== saved.size) changes.push(`${s}: ${getModuleDef(curr.moduleId)?.name ?? ''} ${saved.size}→${curr.size}`);
    }
    return changes.slice(0, 4).join(' · ');
  })();

  function switchRole(role: RoleId) {
    setActiveRole(role);
    setActiveLayoutName('Default');
    const slots = getRolePreset(role);
    setLayoutSlots(slots);
    setSavedSlots(slots);
    setEditMode(false);
    setShowRoleDropdown(false);
  }

  function switchLayout(name: LayoutName) {
    setActiveLayoutName(name);
    if (name === 'Default') {
      const slots = getRolePreset(activeRole);
      setLayoutSlots(slots);
      setSavedSlots(slots);
    } else if (name === 'Crisis') {
      const saved = loadLayout(operator.userId, activeRole, 'LAX', 'Crisis');
      const slots = saved?.slots ?? getCrisisPreset();
      setLayoutSlots(slots);
      setSavedSlots(slots);
    } else {
      const saved = loadLayout(operator.userId, activeRole, 'LAX', name);
      const slots = saved?.slots ?? getRolePreset(activeRole);
      setLayoutSlots(slots);
      setSavedSlots(slots);
    }
    setLastUsedLayoutName(operator.userId, activeRole, 'LAX', name);
    setEditMode(false);
    setShowLayoutDropdown(false);
    if (name === 'Crisis') setCrisisMode(true);
    else setCrisisMode(false);
  }

  function saveCurrentLayout() {
    if (activeLayoutName === 'Default') return; // can't save over default
    saveLayout({
      userId: operator.userId,
      role: activeRole,
      stationId: 'LAX',
      layoutName: activeLayoutName,
      slots: layoutSlots,
      lastModified: Date.now(),
    });
    setSavedSlots(layoutSlots);
    setLastUsedLayoutName(operator.userId, activeRole, 'LAX', activeLayoutName);
    setEditMode(false);
  }

  function saveAsLayout(name: LayoutName) {
    saveLayout({
      userId: operator.userId,
      role: activeRole,
      stationId: 'LAX',
      layoutName: name,
      slots: layoutSlots,
      lastModified: Date.now(),
    });
    setActiveLayoutName(name);
    setSavedSlots(layoutSlots);
    setEditMode(false);
  }

  function resetLayout() {
    // Reset rail widget order
    resetRailLayout();
    if (activeLayoutName === 'Default') {
      const slots = getRolePreset(activeRole);
      setLayoutSlots(slots);
      setSavedSlots(slots);
    } else {
      const saved = loadLayout(operator.userId, activeRole, 'LAX', activeLayoutName);
      const slots = saved?.slots ?? getRolePreset(activeRole);
      setLayoutSlots(slots);
      setSavedSlots(slots);
    }
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

  function moveModuleCrossRail(slotId: SlotId, targetRegion: 'L' | 'R' | 'U') {
    const inst = layoutSlots[slotId];
    if (!inst) return;
    const def = getModuleDef(inst.moduleId);
    if (def && !def.allowedRegions.includes(targetRegion)) return;
    const targetSlots = targetRegion === 'L' ? LEFT_SLOTS : targetRegion === 'R' ? RIGHT_SLOTS : UTILITY_SLOTS;
    const emptySlot = targetSlots.find(s => !layoutSlots[s]);
    if (!emptySlot) return; // no room
    setLayoutSlots(prev => {
      const next = { ...prev };
      next[emptySlot] = next[slotId];
      delete next[slotId];
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

  // Drag-and-drop reorder for rail blocks (uses useState for visual reactivity)
  function handleDragStart(rail: 'left' | 'right', index: number, e: React.DragEvent) {
    setDragItem({ rail, index });
    // Set drag image to the block itself for clear visual
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', `${rail}:${index}`);
    }
  }
  function handleDragOver(e: React.DragEvent, rail: 'left' | 'right', index: number) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    setDragOverIndex({ rail, index });
  }
  function handleDragLeave() {
    setDragOverIndex(null);
  }
  function handleDrop(rail: 'left' | 'right', index: number) {
    setDragOverIndex(null);
    if (!dragItem || dragItem.rail !== rail) { setDragItem(null); return; }
    const fromIdx = dragItem.index;
    setDragItem(null);
    if (fromIdx === index) return;
    const setOrder = rail === 'left' ? setLeftRailOrder : setRightRailOrder;
    const lsKey = rail === 'left' ? 'soi_left_rail_order' : 'soi_right_rail_order';
    setOrder(prev => {
      const next = [...prev];
      const [removed] = next.splice(fromIdx, 1);
      next.splice(index, 0, removed);
      try { localStorage.setItem(lsKey, JSON.stringify(next)); } catch { /* */ }
      return next;
    });
  }
  function handleDragEnd() {
    setDragItem(null);
    setDragOverIndex(null);
  }
  function resetRailLayout() {
    const defaultLeft = [0, 1, 2, 3];
    const defaultRight = [0, 1, 2];
    setLeftRailOrder(defaultLeft);
    setRightRailOrder(defaultRight);
    try {
      localStorage.removeItem('soi_left_rail_order');
      localStorage.removeItem('soi_right_rail_order');
    } catch { /* */ }
  }

  function deleteLayout(name: LayoutName) {
    if (name === 'Default') return;
    if (!confirm(`Delete layout "${name}"?`)) return;
    // Remove from localStorage
    try {
      const key = `${operator.userId}:${activeRole}:LAX:${name}`;
      const all = JSON.parse(localStorage.getItem('soi_layout_state') ?? '{}');
      delete all[key];
      localStorage.setItem('soi_layout_state', JSON.stringify(all));
    } catch { /* */ }
    // Switch to Default if deleting active
    if (activeLayoutName === name) {
      switchLayout('Default');
    }
  }

  const [showDiffPopover, setShowDiffPopover] = useState(false);
  const [liveWeatherText, setLiveWeatherText] = useState<string | null>(null);

  // Fetch live weather for module
  useEffect(() => {
    fetchLiveWeather(operator.station).then(w => {
      setLiveWeatherText(`${w.station}: ${w.condition}, ${w.temperature}. ${w.wind}. ${w.impactDescription}${w.isDemo ? ' (demo)' : ''}`);
    }).catch(() => setLiveWeatherText(null));
  }, [operator.station]);

  function exportLayout(): string {
    return JSON.stringify({ version: 1, role: activeRole, layoutName: activeLayoutName, slots: layoutSlots, exportedAt: Date.now() });
  }

  function importLayout(json: string): boolean {
    try {
      const data = JSON.parse(json);
      if (data.version !== 1 || !data.slots) return false;
      setLayoutSlots(data.slots);
      setActiveLayoutName(data.layoutName ?? 'Personal Custom');
      return true;
    } catch { return false; }
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
  const [ttsMode, setTtsMode] = useState<TTSMode>('unavailable');
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
  // Each computation is independent — one failure must not block others.
  // Uses FALLBACK_ZONES if zones haven't loaded yet to prevent "0 zones" briefings.
  const FALLBACK_ZONES: Zone[] = [
    { id: 'GATES-52ABC', label: 'Alpha–Charlie Block', station: 'LAX', gate_ids: ['52A', '52B', '52C'], active: true },
    { id: 'GATES-52DEF', label: 'Delta–Foxtrot Block', station: 'LAX', gate_ids: ['52D', '52E', '52F'], active: true },
    { id: 'GATES-52GHI', label: 'Golf–India Block', station: 'LAX', gate_ids: ['52G', '52H', '52I'], active: true },
  ];
  const effectiveZones = zones.length > 0 ? zones : FALLBACK_ZONES;

  let operationalAssessment: import('@/lib/soi-intelligence').OperationalAssessment = {
    timestamp: new Date().toISOString(), zoneAssessments: [], globalPressure: 0,
    globalStability: 'stable', summary: '', topPressureSources: [],
  };
  try {
    operationalAssessment = assessOperation(temporalEvents, temporalIncidents, temporalRecoveryActions, effectiveZones, asOf);
  } catch (err) {
    console.error('[SOI Intelligence] assessOperation error:', err);
  }
  // Keep a ref to the LATEST assessment so stale closures (voice handlers) always read current state
  const assessmentRef = useRef(operationalAssessment);
  assessmentRef.current = operationalAssessment;

  // Debug: trace operational truth
  console.log('[SOI Truth] pressure:', operationalAssessment.globalPressure, 'zones:', operationalAssessment.zoneAssessments.length, 'stability:', operationalAssessment.globalStability);

  let soiRecommendations: SoiRecommendation[] = [];
  try {
    soiRecommendations = generateRecommendations(
      temporalEvents, temporalIncidents, temporalRecoveryActions, effectiveZones, asOf
    );
  } catch (err) {
    console.error('[SOI Intelligence] generateRecommendations error:', err);
  }

  const recommendationsRef = useRef(soiRecommendations);
  recommendationsRef.current = soiRecommendations;

  let dispatchPlan = { actions: [] as import('@/lib/soi-intelligence').RankedAction[], summary: '', totalEstimatedMinutes: 0 };
  try {
    dispatchPlan = rankRecommendations(soiRecommendations, temporalIncidents, temporalRecoveryActions);
  } catch (err) {
    console.error('[SOI Intelligence] rankRecommendations error:', err);
  }
  const dispatchPlanRef = useRef(dispatchPlan);
  dispatchPlanRef.current = dispatchPlan;

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
  function handleCommand(rawInput: string) {
    const raw = normalizeNatoGates(rawInput);
    // Audit: log all commands
    logAuditEvent('command', { input: rawInput, normalized: raw });

    // Context resolution: replace pronouns/references with last active gate/zone
    // "what about it" → "what about 52D" if Delta was last discussed
    // "fix that" → "stabilize 52D"
    // "over there" → last gate
    if (isContextActive(conversationMemory) && conversationMemory.activeGate) {
      const lower = raw.toLowerCase();
      const hasGateRef = /\b52[A-I]\b/i.test(raw);
      if (!hasGateRef && /\b(?:it|that|there|this|that\s+gate|over\s+there|same\s+one|that\s+one)\b/i.test(lower)) {
        // Inject last active gate
        const gate = conversationMemory.activeGate;
        // Replace pronoun-like reference with gate
        const injected = raw
          .replace(/\b(?:over\s+there|that\s+gate|that\s+one|same\s+one)\b/i, gate)
          .replace(/\b(?:it|that|there|this)\b/i, gate);
        if (injected !== raw) {
          console.log('[SOI Context] Resolved reference:', raw, '→', injected);
          return handleCommand(injected);
        }
      }
    }

    // A-2. Clear/reset command — wipe all demo data
    if (/^(?:clear|reset|wipe|clear\s+all|reset\s+all|clear\s+data|start\s+fresh|clean\s+slate)$/i.test(raw.trim())) {
      clearDemoData().then(() => {
        refresh();
        refreshIncidents();
        setCopilotAnswer({ title: 'Cleared', answer: 'All operational data cleared. Starting fresh.', confidence: 'high', bullets: [], assumptions: [], source: 'deterministic_operational_model' });
        setCommandResponse(null);
        soiSpeak('Data cleared. Starting fresh.');
      });
      setCommandInput('');
      return;
    }

    // A-1. Agent selection mode — intercept number/name input
    if (agentSelection && agentSelection.phase === 'picking') {
      // Check if input looks like agent selection (numbers, names, or "assign")
      const hasNumbers = /\d/.test(raw);
      const hasNames = agentSelection.candidates.some(c => raw.toLowerCase().includes(c.name.split(' ')[0].toLowerCase()));
      const isAssignConfirm = /\b(?:assign|dispatch|send|confirm|go)\b/i.test(raw);
      if (hasNumbers || hasNames || isAssignConfirm) {
        if (isAssignConfirm && !hasNumbers && !hasNames && agentSelection.selected.size > 0) {
          // User said "assign" with existing selection
          const selectedNames = agentSelection.candidates.filter(c => agentSelection.selected.has(c.id)).map(c => c.name);
          const gate = agentSelection.gate;
          setPendingAssignment({ gate, members: Array.from(agentSelection.selected), reasoning: `Selected by operator: ${selectedNames.join(', ')}` });
          setAgentSelection({ ...agentSelection, phase: 'confirming' });
          setCopilotAnswer({
            title: `Confirm Assignment to Gate ${gate}`,
            answer: `Assign ${selectedNames.join(', ')} to Gate ${gate}?`,
            confidence: 'high',
            bullets: [`Estimated impact: +${Math.round(agentSelection.selected.size * 12)} staffing coverage`, `Projected delay risk reduction: -${Math.round(agentSelection.selected.size * 9)}%`],
            assumptions: [], recommendedNextAction: 'Say "confirm" to dispatch',
            source: 'deterministic_operational_model',
          });
          setCommandResponse(null);
          soiSpeak(`Ready to assign ${selectedNames.join(' and ')} to Gate ${gate}. Confirm?`);
          setCommandInput('');
          return;
        }
        handleAgentNumberSelection(raw);
        setCommandInput('');
        return;
      }
      // Not a selection command — cancel selection mode and fall through
      setAgentSelection(null);
    }

    // A0. Confirm pending team assignment
    if (pendingAssignment && /\b(?:confirm|yes|go|approved?|dispatch|do\s+it|roger|affirmative|send\s+them|assign\s+them|make\s+it\s+happen|green\s+light)\b/i.test(raw)) {
      const pa = pendingAssignment;
      setPendingAssignment(null);
      setAgentSelection(null);
      // Resolve member names for voice
      const memberNames = pa.members.map(id => {
        const m = workforceState.roster.find(r => r.id === id);
        return m ? m.name : id;
      });
      // Create recovery action for the assignment
      const gateInc = temporalIncidents.find(i => i.gate_id === pa.gate && i.status !== 'RESOLVED' && i.status !== 'CLOSED');
      if (gateInc) {
        createRecoveryAction({
          incident_id: gateInc.id,
          title: `Team dispatched: ${memberNames.join(', ')} → ${pa.gate}`,
          action_type: 'DISPATCH',
          severity: 'HIGH',
          proposed_by: operator.userId,
          assigned_to: pa.members[0],
          gate_id: pa.gate,
          description: `SOI dispatch: ${pa.reasoning}. Agents: ${memberNames.join(', ')}. Confirmed by ${operator.displayName}.`,
        }).then(() => { refreshRecovery(); refresh(); });
      }
      // Emit dispatch notification event (mobile surfaces pick this up via realtime)
      for (const agentId of pa.members) {
        postEvent({
          event_type: 'dispatch.assignment',
          event_subtype: 'team_dispatch',
          severity: 'HIGH' as const,
          station: operator.station,
          gate_id: pa.gate,
          reported_by: operator.userId,
          role_type: operator.role,
          shift_window: 'AM',
          device_id: 'soi-dashboard',
          source_platform: 'DESKTOP',
          qr_target_type: 'GATE',
          qr_target_id: `LAX-GATE-${pa.gate}`,
          entity_type: 'dispatch_notification',
          entity_id: agentId,
          state_after: 'DISPATCHED',
          notes: `You have been dispatched to Gate ${pa.gate}. Report immediately.`,
          details_json: { agentId, agentName: memberNames[pa.members.indexOf(agentId)], gate: pa.gate, dispatchedBy: operator.displayName, allAgents: memberNames },
        }).catch(err => console.error('[dispatch notification]', err));
      }
      // Audit: log the dispatch
      logAuditEvent('dispatch_confirmed', { gate: pa.gate, agents: pa.members, agentNames: memberNames, reasoning: pa.reasoning });
      setCopilotAnswer({
        title: 'Team Dispatched',
        answer: `${memberNames.join(' and ')} dispatched to Gate ${pa.gate}. Agents notified via mobile. Staffing board updated.`,
        confidence: 'high',
        bullets: [
          `Agents notified: ${memberNames.join(', ')}`,
          `Gate: ${pa.gate}`,
          `Dispatched by: ${operator.displayName}`,
          `Audit event created`,
        ],
        assumptions: [],
        source: 'deterministic_operational_model',
      });
      setCommandResponse(null);
      soiSpeak(`${memberNames.join(' and ')} dispatched to Gate ${pa.gate}. Agents notified.`);
      setCommandInput('');
      return;
    }

    // A. Approval / confirmation / cancel (highest priority)
    const agenticParsed = parseAgenticIntent(raw, effectiveZones);
    if (agenticParsed.intent === 'execute_plan' && cmdMemory.activePlan) {
      handleApprovePlan();
      soiSpeak('Recovery chain approved and execution initiated.');
      setCommandInput('');
      return;
    }
    if (agenticParsed.intent === 'cancel_plan') {
      logAuditEvent('plan_cancelled', { plan: cmdMemory.activePlan?.summary ?? 'unknown' });
      if (liveExecTickRef.current) clearInterval(liveExecTickRef.current);
      setLiveExec(null);
      setAdaptiveRecs([]);
      setCmdMemory(clearCommandMemory(cmdMemory));
      setCommandResponse(['Execution plan cancelled.']);
      setCopilotAnswer(null);
      soiSpeak('Execution cancelled.');
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
        cmdMemory.activePlan.objective, assessmentRef.current,
        recommendationsRef.current, temporalIncidents, temporalRecoveryActions,
      );
      setCmdMemory(stagePlan(cmdMemory, altPlan, altPlan.objective, assessmentRef.current));
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

    // B0. Dispatch/assign intent → interactive agent selection (not agentic plan)
    if (agenticParsed.intent === 'dispatch_recovery' && agenticParsed.targetGate) {
      startAgentSelection(agenticParsed.targetGate);
      setCommandInput('');
      return;
    }
    if (agenticParsed.intent === 'dispatch_recovery' && !agenticParsed.targetGate) {
      setCopilotAnswer({ title: 'Assignment', answer: 'Which gate do you need a team at? Just say the gate name.', confidence: 'moderate', bullets: [], assumptions: [], source: 'deterministic_operational_model' });
      setCommandResponse(null);
      soiSpeak('Which gate do you need a team at?');
      setCommandInput('');
      return;
    }

    // B. Agentic execution intents (stabilize, prevent, reduce, dispatch, etc.)
    if (agenticParsed.intent && !['execute_plan', 'cancel_plan', 'show_plan_status', 'show_alternatives', 'continue_recovery', 'dispatch_recovery'].includes(agenticParsed.intent)) {
      // Resolve gate to zone if only gate was provided
      if (!agenticParsed.targetZone && agenticParsed.targetGate && zones.length > 0) {
        const resolved = resolveZonePattern(agenticParsed.targetGate, effectiveZones);
        if (resolved) agenticParsed.targetZone = resolved;
      }

      const objective = buildObjective(agenticParsed, assessmentRef.current, effectiveZones);
      const plan = buildExecutionPlan(
        objective, assessmentRef.current,
        recommendationsRef.current, temporalIncidents, temporalRecoveryActions,
      );

      if (plan.steps.length === 0) {
        // Explain why no plan could be built
        const zoneLabel = objective.targetZoneLabel ?? objective.targetZone ?? 'the target area';
        const za = objective.targetZone ? assessmentRef.current.zoneAssessments.find(z => z.zoneId === objective.targetZone) : null;
        const reason = za
          ? za.unresolvedCount === 0
            ? `No active incidents at ${zoneLabel}. Zone is currently stable.`
            : `Recovery actions already cover incidents at ${zoneLabel}. No additional steps needed.`
          : `Unable to assess ${zoneLabel}. Zone data not available.`;
        setCommandResponse([reason]);
        setCopilotAnswer(null);
      } else {
        const auth = authorizeExecution(plan.steps, operator.viewerRole as 'coordinator' | 'manager' | 'ops_director');
        setCmdMemory(stagePlan(cmdMemory, plan, objective, assessmentRef.current));
        setCommandResponse(null);
        setCopilotAnswer(null);
        soiSpeak(`Recovery plan staged for ${objective.targetZoneLabel ?? objective.targetZone ?? 'target zone'}. ${plan.steps.length} steps. Say approve to execute.`);
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
        // Read from refs to ALWAYS get current state (prevents stale closure reads)
        const liveAssessment = assessmentRef.current;
        const liveRecs = recommendationsRef.current;
        const activeIncs = temporalIncidents.filter(i => i.status !== 'RESOLVED' && i.status !== 'CLOSED');
        const activeRAs = temporalRecoveryActions.filter(ra => ra.status === 'ACTIVE' || ra.status === 'ACKNOWLEDGED');

        console.log('[SOI Briefing] source pressure:', liveAssessment.globalPressure, 'zones:', liveAssessment.zoneAssessments.length, 'incidents:', activeIncs.length, 'recs:', liveRecs.length);

        const worstZone = liveAssessment.zoneAssessments.length > 0
          ? liveAssessment.zoneAssessments.reduce((a, b) => a.pressure > b.pressure ? a : b)
          : null;
        const stabilityWord = liveAssessment.globalStability === 'critical' ? 'Critical'
          : liveAssessment.globalStability === 'unstable' ? 'Unstable'
          : liveAssessment.globalStability === 'degrading' ? 'Elevated'
          : 'Stable';
        const pressureNote = liveAssessment.globalPressure >= 60
          ? `Pressure at ${liveAssessment.globalPressure}. ${worstZone ? `${worstZone.zoneLabel} is the highest risk at ${worstZone.pressure}.` : ''}`
          : liveAssessment.globalPressure > 0
          ? `Pressure at ${liveAssessment.globalPressure}. Operations manageable.`
          : 'Waiting for operational data.';
        const incNote = activeIncs.length > 0
          ? `${activeIncs.length} active incident${activeIncs.length > 1 ? 's' : ''}.`
          : 'No active incidents.';
        const recNote = liveRecs.length > 0
          ? `I'd prioritize: ${liveRecs[0].title}.`
          : '';

        setCopilotAnswer({
          title: `Briefing — ${stabilityWord}`,
          answer: `${pressureNote} ${incNote} ${activeRAs.length > 0 ? `${activeRAs.length} recovery action${activeRAs.length !== 1 ? 's' : ''} running.` : ''} ${recNote}`.trim(),
          confidence: 'high',
          bullets: [
            ...liveAssessment.zoneAssessments.map(z => `${z.zoneLabel}: pressure ${z.pressure} (${z.stability})`),
            ...activeIncs.slice(0, 3).map(i => `${i.severity}: ${i.title.slice(0, 60)}`),
          ],
          assumptions: [],
          recommendedNextAction: liveRecs.length > 0 ? liveRecs[0].title : undefined,
          source: 'deterministic_operational_model',
        });
        setCommandResponse(null);
        break;
      }
      case 'show_staffing': {
        const ws = workforceState;
        setCopilotAnswer({
          title: 'Workforce Status',
          answer: `${ws.totalOnShift} personnel on shift. ${ws.available.length} available, ${ws.assigned.length} assigned, ${ws.recovering.length} in recovery.`,
          confidence: 'high',
          bullets: [
            ...(ws.available.length > 0 ? [`Available: ${ws.available.map(m => m.name).join(', ')}`] : ['No agents available']),
            ...(ws.assigned.length > 0 ? [`Assigned: ${ws.assigned.map(m => `${m.name}${m.currentGate ? ` (${m.currentGate})` : ''}`).join(', ')}`] : []),
            ...(ws.recovering.length > 0 ? [`Recovering: ${ws.recovering.map(m => m.name).join(', ')}`] : []),
          ],
          assumptions: ws.isDemo ? ['Demo workforce model'] : [],
          source: 'deterministic_operational_model',
        });
        setCommandResponse(null);
        break;
      }
      case 'show_risk': {
        // Read from ref for current state
        const riskAssessment = assessmentRef.current;
        const worstZone = riskAssessment.zoneAssessments.length > 0 ? riskAssessment.zoneAssessments.reduce((a, b) => a.pressure > b.pressure ? a : b) : null;
        const topSources = riskAssessment.topPressureSources.slice(0, 3);
        setCopilotAnswer({
          title: 'Risk Assessment',
          answer: worstZone
            ? `Highest risk: ${worstZone.zoneLabel} at pressure ${worstZone.pressure}. ${worstZone.explanation[0] ?? 'Elevated operational load.'}`
            : 'No elevated risk detected. Operations nominal.',
          confidence: 'high',
          bullets: [
            ...topSources.map(s => `${s.severity}: ${s.description}`),
            ...(cascadeRisks.length > 0 ? [`Cascade risk: ${cascadeRisks[0].direction}`] : []),
          ],
          assumptions: [],
          recommendedNextAction: worstZone && worstZone.pressure >= 60 ? `Consider: stabilize ${worstZone.zoneLabel}` : undefined,
          source: 'deterministic_operational_model',
        });
        setCommandResponse(null);
        break;
      }
      case 'explain_instability': {
        setCopilotAnswer(null);
        const zoneId = resolveZonePattern(intent.target, effectiveZones);
        if (zoneId) {
          const lines = explainInstability(zoneId, zones, temporalEvents, temporalIncidents, temporalRecoveryActions, asOf);
          setCommandResponse(lines);
        } else {
          // Intent-first: try to interpret as a gate question
          setCopilotAnswer({
            title: 'Gate Not Found',
            answer: `I couldn't find "${intent.target}" as a known gate. Gates are Alpha through India (52A–52I). Which gate are you asking about?`,
            confidence: 'moderate', bullets: [], assumptions: [],
            source: 'deterministic_operational_model',
          });
          setCommandResponse(null);
        }
        break;
      }
      case 'recommend_recovery': {
        const liveRecs = recommendationsRef.current;
        if (liveRecs.length === 0) {
          setCopilotAnswer({
            title: 'Recovery Status',
            answer: `Nothing flagged right now. Pressure at ${assessmentRef.current.globalPressure}. I'm monitoring.`,
            confidence: 'high', bullets: [], assumptions: [],
            source: 'deterministic_operational_model',
          });
          setCommandResponse(null);
        } else {
          setCopilotAnswer({
            title: 'Recommended Play',
            answer: `I'd prioritize: ${liveRecs[0].title}. ${liveRecs[0].summary}`,
            confidence: 'high',
            bullets: liveRecs.slice(0, 3).map((r, i) => `${i + 1}. ${r.title} — ${r.severity}, confidence ${r.confidence.score}%`),
            assumptions: [],
            recommendedNextAction: liveRecs[0].title,
            source: 'deterministic_operational_model',
          });
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
        const zoneId = resolveZonePattern(intent.zonePattern, effectiveZones);
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
        const cascades = assessmentRef.current.zoneAssessments.filter(z => z.stability === 'critical' || z.stability === 'unstable');
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
            const scenarios = compareScenarios(selectedZoneId ?? undefined, assessmentRef.current, forecast, cascadeRisks, recoveryConf, opProfile);
            const bullets = scenarios.map(s => {
              const tgt = s.outcomes.find(o => o.zoneId === (selectedZoneId ?? assessmentRef.current.zoneAssessments[0]?.zoneId));
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
              assessment: assessmentRef.current,
              recommendations: recommendationsRef.current,
              dispatchPlan,
              activeIncidentCount: temporalIncidents.filter(i => i.status !== 'RESOLVED' && i.status !== 'CLOSED').length,
              activeRecoveryCount: temporalRecoveryActions.filter(ra => ra.status === 'ACTIVE' || ra.status === 'ACKNOWLEDGED').length,
            };
            const result = answerOperationalQuestion(raw, opCtx, effectiveZones, conversationMemory, true);
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
          const result = answerOperationalQuestion(raw, opCtx, effectiveZones, conversationMemory, true);
          setCopilotAnswer(result.answer);
          setConversationMemory(result.updatedMemory);
          setLastInferredFrom(result.inferredFrom);
        });

        // Voice rewrite handled by the copilot answer useEffect
      }
    }

    // Update conversation context with any gate/zone from this command
    const gateInCmd = raw.match(/\b(52[A-I])\b/i);
    if (gateInCmd) {
      const gate = gateInCmd[1].toUpperCase();
      const zoneForGate = zones.find(z => z.gate_ids.includes(gate));
      setConversationMemory(prev => updateContext(prev, {
        activeGate: gate,
        activeZone: zoneForGate?.id,
        activeZoneLabel: zoneForGate?.label,
      }));
    } else if (selectedGateId) {
      setConversationMemory(prev => updateContext(prev, { activeGate: selectedGateId }));
    }

    setCommandInput('');
  }

  // ── Audit Logging (localStorage + Supabase) ──
  function logAuditEvent(action: string, details: Record<string, unknown>) {
    const entry = {
      timestamp: new Date().toISOString(),
      operator: operator.userId,
      operatorName: operator.displayName,
      role: operator.role,
      station: operator.station,
      action,
      details,
    };
    // Persist to localStorage audit log (append-only)
    try {
      const key = 'soi_audit_log';
      const existing = JSON.parse(localStorage.getItem(key) ?? '[]');
      existing.push(entry);
      if (existing.length > 500) existing.splice(0, existing.length - 500);
      localStorage.setItem(key, JSON.stringify(existing));
    } catch { /* silently fail */ }
    // Persist to Supabase (non-blocking)
    postAuditEvent({
      action,
      operator_id: operator.userId,
      operator_name: operator.displayName,
      role: operator.role,
      station: operator.station,
      gate_id: (details.gate as string) ?? undefined,
      details,
    });
    console.log('[SOI Audit]', action, details);
  }

  // ── Interactive Agent Selection for assignment workflow ──
  function startAgentSelection(gate: string) {
    const available = workforceState.roster.filter(m => m.status !== 'off_shift');
    if (available.length === 0) {
      setCopilotAnswer({ title: 'No Crew Available', answer: 'No agents currently on shift for assignment.', confidence: 'high', bullets: [], assumptions: [], source: 'deterministic_operational_model' });
      setCommandResponse(null);
      soiSpeak('No agents currently available for assignment.');
      return;
    }
    setAgentSelection({ gate, candidates: available.map(m => ({ id: m.id, name: m.name, role: m.role, status: m.status, workload: m.workload, currentZone: m.currentZone })), selected: new Set(), phase: 'picking' });
    const lines = [`Available agents for Gate ${gate}:`, ...available.map((m, i) => `${i + 1}. ${m.name} — ${m.role} · ${m.status}${m.currentGate ? ` at ${m.currentGate}` : ''} · workload ${m.workload}/3`)];
    setCommandResponse(lines);
    setCopilotAnswer({
      title: `Assign Team to Gate ${gate}`,
      answer: `${available.length} agents on shift. Select agents by number, name, or click the checkboxes. Then say "assign" to confirm.`,
      confidence: 'high', bullets: [], assumptions: [],
      recommendedNextAction: 'Say the numbers — e.g., "1, 3 and 5"',
      source: 'deterministic_operational_model',
    });
    soiSpeak(`${available.length} agents available. Select by number or name, then say assign.`);
  }

  function handleAgentNumberSelection(input: string) {
    if (!agentSelection) return;
    const lower = input.toLowerCase();

    // Parse number references: "1, 2 and 4" or "1 3 5" or "numbers 1 and 3"
    const numbers = lower.match(/\d+/g)?.map(Number).filter(n => n >= 1 && n <= agentSelection.candidates.length) ?? [];

    // Parse name references: "Jackson and Reed"
    const nameMatches = agentSelection.candidates.filter(c =>
      lower.includes(c.name.split(' ')[0].toLowerCase()) || lower.includes(c.name.toLowerCase())
    );

    const newSelected = new Set(agentSelection.selected);
    for (const n of numbers) {
      newSelected.add(agentSelection.candidates[n - 1].id);
    }
    for (const m of nameMatches) {
      newSelected.add(m.id);
    }

    if (newSelected.size === 0) {
      soiSpeak('I didn\'t catch which agents. Say the numbers next to their names.');
      return;
    }

    // Check if user also said "assign" / "confirm" / "dispatch"
    const wantsConfirm = /\b(?:assign|confirm|dispatch|send|go|do\s+it)\b/i.test(lower);

    const selectedNames = agentSelection.candidates.filter(c => newSelected.has(c.id)).map(c => c.name);
    setAgentSelection({ ...agentSelection, selected: newSelected, phase: wantsConfirm ? 'confirming' : 'picking' });

    if (wantsConfirm) {
      // Move to confirmation
      const gate = agentSelection.gate;
      setPendingAssignment({ gate, members: Array.from(newSelected), reasoning: `Selected by operator: ${selectedNames.join(', ')}` });
      setCopilotAnswer({
        title: `Confirm Assignment to Gate ${gate}`,
        answer: `Assign ${selectedNames.join(', ')} to Gate ${gate}?`,
        confidence: 'high',
        bullets: [
          `Estimated impact: +${Math.round(newSelected.size * 12)} staffing coverage`,
          `Projected delay risk reduction: -${Math.round(newSelected.size * 9)}%`,
          `Recovery window: 12–18 minutes`,
        ],
        assumptions: [],
        recommendedNextAction: 'Say "confirm" to dispatch',
        source: 'deterministic_operational_model',
      });
      setCommandResponse(null);
      soiSpeak(`Ready to assign ${selectedNames.join(' and ')} to Gate ${gate}. Confirm?`);
    } else {
      setCommandResponse([`Selected: ${selectedNames.join(', ')}`, `Say "assign" to dispatch, or add more agents by number.`]);
      soiSpeak(`${selectedNames.join(' and ')} selected. Say assign when ready.`);
    }
  }

  function toggleAgentSelection(agentId: string) {
    if (!agentSelection) return;
    const newSelected = new Set(agentSelection.selected);
    if (newSelected.has(agentId)) newSelected.delete(agentId);
    else newSelected.add(agentId);
    setAgentSelection({ ...agentSelection, selected: newSelected });
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
    logAuditEvent('plan_approved', { plan: cmdMemory.activePlan.summary, steps: cmdMemory.activePlan.steps.length, targetZone: cmdMemory.activePlan.objective.targetZone });
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
          report = evaluateChainHealth(next, cmdMemory.preExecutionAssessment, assessmentRef.current);
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
  // Check OpenAI TTS availability on mount. TTS starts OFF — user enables via toggle.
  useEffect(() => {
    checkOpenAITTS().then(available => {
      const mode = available ? 'openai' : (isTTSAvailable() ? 'browser' : 'unavailable');
      setTtsMode(mode);
      console.log('[SOI Voice] TTS mode resolved:', mode);
    });
    onOpenAISpeakingChange(speaking => {
      setTtsState(speaking ? 'speaking' : 'idle');
    });
  }, []);

  /** Speak using OpenAI TTS (primary). Browser TTS only as explicit fallback after OpenAI failure.
   *  Sets handlerSpokeRef so the copilotAnswer useEffect won't double-speak. */
  const handlerSpokeRef = useRef(false);
  async function soiSpeak(text: string) {
    if (!ttsOn) return;
    handlerSpokeRef.current = true;
    // Cancel any in-progress speech to prevent overlap
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    stopOpenAI();
    // Always try OpenAI first regardless of ttsMode
    try {
      const used = await speakWithOpenAI(text);
      if (used) {
        console.log('[SOI Voice] OpenAI TTS');
        return;
      }
    } catch { /* OpenAI failed, fall through */ }
    // Browser fallback — only if OpenAI is truly unavailable
    if (ttsMode === 'browser' && isTTSAvailable()) {
      console.log('[SOI Voice] Browser fallback (OpenAI unavailable)');
      speakDirect(text);
    } else {
      console.log('[SOI Voice] Speech suppressed — no TTS available');
    }
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

  // ── Speak copilot answers and command responses when TTS is on ──
  // Skips if a handler already called soiSpeak() this render cycle.
  useEffect(() => {
    if (!ttsOn) return;
    // If handler already spoke for this interaction, skip to prevent double-speak
    if (handlerSpokeRef.current) {
      // Still track the answer so we don't re-speak it later
      if (copilotAnswer) prevCopilotAnswerRef.current = copilotAnswer.answer;
      handlerSpokeRef.current = false;
      return;
    }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copilotAnswer, commandResponse]);

  // ── Speak narratives that qualify (skip if handler just spoke) ──
  useEffect(() => {
    if (!ttsOn || handlerSpokeRef.current) return;
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

  // ── Proactive SOI alerts for rising pressure ──
  const lastAlertedPressureRef = useRef<number>(0);
  const lastAlertTimeRef = useRef<number>(0);
  useEffect(() => {
    if (!ttsOn) return;
    const pressure = operationalAssessment.globalPressure;
    const now = Date.now();
    const cooldown = 60000; // 60s minimum between proactive alerts

    // Only alert on threshold crossings, with cooldown
    if (now - lastAlertTimeRef.current < cooldown) return;

    if (pressure >= 80 && lastAlertedPressureRef.current < 80) {
      // Critical threshold crossed
      const worstZone = operationalAssessment.zoneAssessments.reduce((a, b) => a.pressure > b.pressure ? a : b);
      soiSpeak(`Attention. System pressure has reached critical at ${pressure}. ${worstZone.zoneLabel} is the highest risk area. Recommend immediate intervention.`);
      setCopilotAnswer({
        title: 'Pressure Alert — Critical',
        answer: `System pressure at ${pressure}/100. ${worstZone.zoneLabel} at ${worstZone.pressure}. Immediate action recommended.`,
        confidence: 'high',
        bullets: operationalAssessment.zoneAssessments.filter(z => z.pressure >= 60).map(z => `${z.zoneLabel}: ${z.pressure}`),
        assumptions: [], source: 'deterministic_operational_model',
        recommendedNextAction: `Stabilize ${worstZone.zoneLabel}`,
      });
      lastAlertedPressureRef.current = pressure;
      lastAlertTimeRef.current = now;
    } else if (pressure >= 60 && lastAlertedPressureRef.current < 60) {
      // High threshold crossed
      const worstZone = operationalAssessment.zoneAssessments.reduce((a, b) => a.pressure > b.pressure ? a : b);
      soiSpeak(`Advisory. System pressure elevated to ${pressure}. ${worstZone.zoneLabel} showing increased load. Monitoring.`);
      lastAlertedPressureRef.current = pressure;
      lastAlertTimeRef.current = now;
    } else if (pressure < 40 && lastAlertedPressureRef.current >= 60) {
      // Pressure dropped back to stable
      soiSpeak('System pressure returning to normal. Operations stabilizing.');
      lastAlertedPressureRef.current = pressure;
      lastAlertTimeRef.current = now;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operationalAssessment.globalPressure, ttsOn]);

  // ── Route LLM-interpreted intents into SOI engines ──
  function routeLLMIntent(li: { intent: string; gate?: string; zone?: string; resource?: string; confidence: number; reasoning: string }, _raw: string) {
    // Resolve gate → zone
    let targetZone = li.zone ? resolveZonePattern(li.zone, effectiveZones) ?? undefined : undefined;
    const targetGate = li.gate?.toUpperCase();
    if (!targetZone && targetGate) {
      targetZone = resolveZonePattern(targetGate, effectiveZones) ?? undefined;
    }

    // Update conversation context with LLM-resolved targets
    if (targetGate || targetZone) {
      const zoneLabel = targetZone ? zones.find(z => z.id === targetZone)?.label : undefined;
      setConversationMemory(prev => updateContext(prev, {
        activeGate: targetGate,
        activeZone: targetZone,
        activeZoneLabel: zoneLabel,
        lastIntent: li.intent,
      }));
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
        const zoneId = targetZone ?? (targetGate ? resolveZonePattern(targetGate, effectiveZones) ?? undefined : undefined);
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
          setCopilotAnswer({ title: 'Assignment', answer: 'Which gate should I assign a team to? Just say the gate — Alpha, Bravo, Charlie, and so on.', confidence: 'moderate', bullets: [], assumptions: [], source: 'deterministic_operational_model' });
          setCommandResponse(null);
          break;
        }
        // Show interactive numbered agent list
        startAgentSelection(gate);
        break;
      }
      case 'select_agents': {
        // User selecting agents by number from the list
        if (agentSelection && agentSelection.phase === 'picking') {
          handleAgentNumberSelection(_raw);
        } else {
          setCopilotAnswer({ title: 'No Active Selection', answer: 'No agent list is active. Tell me which gate you want to assign a team to first.', confidence: 'moderate', bullets: [], assumptions: [], source: 'deterministic_operational_model' });
          setCommandResponse(null);
        }
        break;
      }
      case 'forecast': {
        handleCommand('what happens if we do nothing');
        break;
      }
      case 'flight_query': {
        handleCommand(li.gate ? `show flight at ${li.gate}` : 'which flights are at risk');
        break;
      }
      case 'repeat_last': {
        // Repeat the last copilot answer
        if (prevCopilotAnswerRef.current) {
          soiSpeak(condenseForSpeech(prevCopilotAnswerRef.current));
        } else {
          soiSpeak('Nothing to repeat. Ask me something.');
        }
        break;
      }
      case 'followup_who': {
        // "who?" — answer from last context (agents, crew, etc.)
        if (agentSelection) {
          const names = agentSelection.candidates.filter(c => agentSelection.selected.has(c.id)).map(c => c.name);
          if (names.length > 0) {
            setCopilotAnswer({ title: 'Selected Agents', answer: names.join(', '), confidence: 'high', bullets: [], assumptions: [], source: 'deterministic_operational_model' });
          } else {
            handleCommand('who is available');
          }
        } else {
          handleCommand('who is available');
        }
        break;
      }
      case 'followup_why': {
        // "why?" — explain from last context
        if (conversationMemory.activeGate) {
          handleCommand(`why is ${conversationMemory.activeGate} under pressure`);
        } else if (conversationMemory.activeZone) {
          handleCommand(`explain ${conversationMemory.activeZone}`);
        } else {
          handleCommand('why are we critical');
        }
        break;
      }
      default: {
        // Intent-first: give the best operational answer, never reject
        // Use the reasoning as a natural acknowledgement
        const liveA = assessmentRef.current;
        const worst = liveA.zoneAssessments.length > 0
          ? liveA.zoneAssessments.reduce((a, b) => a.pressure > b.pressure ? a : b)
          : null;
        const contextNote = worst && worst.pressure >= 40
          ? `Right now, ${worst.zoneLabel} is your main concern at pressure ${worst.pressure}.`
          : `Operations at pressure ${liveA.globalPressure}.`;
        setCopilotAnswer({
          title: 'Copy',
          answer: `${li.reasoning ?? 'I hear you.'} ${contextNote}`,
          confidence: 'moderate',
          bullets: [],
          assumptions: [],
          source: 'deterministic_operational_model',
        });
        setCommandResponse(null);
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
      case 'weather-impact': {
        return (<div style={mono}>{liveWeatherText ?? 'Loading weather...'}</div>);
      }
      case 'incident-history': {
        const resolved = temporalIncidents.filter(i => i.status === 'RESOLVED' || i.status === 'CLOSED');
        return (<div style={mono}>{resolved.length} resolved incidents this session.{resolved.slice(0, 2).map(i => (<div key={i.id} style={{ fontSize: 9, color: 'var(--sf-ink-3)', marginTop: 3 }}>· {i.title.slice(0, 40)}</div>))}</div>);
      }
      case 'resource-utilization': {
        const ws = workforceState;
        const util = ws.totalOnShift > 0 ? Math.round(((ws.assigned.length + ws.recovering.length) / ws.totalOnShift) * 100) : 0;
        return (<div style={mono}>Workforce utilization: <span style={{ ...val, fontSize: 14, color: util > 80 ? 'var(--sf-amber)' : 'var(--sf-green)' }}>{util}%</span><div style={{ fontSize: 9, color: 'var(--sf-ink-3)', marginTop: 2 }}>{ws.assigned.length + ws.recovering.length}/{ws.totalOnShift} active</div></div>);
      }
      case 'inbound-surge':
        return (<div style={mono}>{[...flightWorldMap.values()].filter(f => f.turnPhase === 'arrival' || f.turnPhase === 'pre_arrival').length} inbound · {[...flightWorldMap.values()].filter(f => f.minutesToDeparture < 20 && f.minutesToDeparture > 0).length} departing soon</div>);
      case 'gate-conflicts': {
        const conflicts = [...flightWorldMap.values()].filter(f => f.departureRisk === 'CRITICAL' || f.departureRisk === 'HIGH');
        return (<div style={mono}>{conflicts.length > 0 ? conflicts.map(f => (<div key={f.gateId} style={{ fontSize: 9, marginBottom: 2 }}><span style={{ color: f.departureRisk === 'CRITICAL' ? 'var(--sf-red)' : 'var(--sf-amber)' }}>{f.gateId}</span> · {f.flightNumber} · {f.departureRisk}</div>)) : <span style={{ color: 'var(--sf-ink-3)' }}>No gate conflicts</span>}</div>);
      }
      case 'governance-audit':
        return (<div style={mono}>{temporalEvents.filter(e => e.event_type.includes('audit') || e.event_type.includes('escalation')).length} governance events · {temporalRecoveryActions.filter(ra => ra.status === 'ESCALATED').length} escalated</div>);
      case 'cost-impact':
        return (<div style={mono}>Delay cost estimate: <span style={{ color: 'var(--sf-amber)' }}>${Math.round(operationalAssessment.globalPressure * 120)}</span>/hr projected · demo model</div>);
      case 'cross-station':
        return (<div style={mono}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span style={{ color: 'var(--sf-ink)' }}>LAX</span><span style={{ color: 'var(--sf-green)' }}>Live</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, opacity: .4 }}><span>SFO</span><span style={{ color: 'var(--sf-ink-4)' }}>Preview</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, opacity: .4 }}><span>JFK</span><span style={{ color: 'var(--sf-ink-4)' }}>Preview</span></div>
          <div style={{ fontSize: 8, color: 'var(--sf-ink-4)', marginTop: 4 }}>Network preview · demo stations</div>
        </div>);
      case 'throughput': {
        const resolved = temporalIncidents.filter(i => i.status === 'RESOLVED' || i.status === 'CLOSED').length;
        const total = temporalIncidents.length;
        return (<div style={mono}>Resolution rate: <span style={{ ...val, fontSize: 14, color: 'var(--sf-green)' }}>{total > 0 ? Math.round((resolved / total) * 100) : 0}%</span><div style={{ fontSize: 9, color: 'var(--sf-ink-3)', marginTop: 2 }}>{resolved}/{total} incidents resolved</div></div>);
      }
      case 'historical-trend':
        return (<div style={mono}>Pressure trend: {forecast?.globalTrend === 'rising' ? '↑ rising' : forecast?.globalTrend === 'falling' ? '↓ falling' : '→ stable'}</div>);
      case 'notification-stream':
        return (<div style={mono}>{getVisibleNarratives(narrativeFeed, 2).map(n => (<div key={n.id} style={{ fontSize: 9, color: 'var(--sf-ink-3)', marginBottom: 2 }}>{n.narrative.slice(0, 60)}...</div>))}</div>);
      case 'recovery-coord':
        return (<div style={mono}>{temporalRecoveryActions.filter(ra => ra.status === 'ACTIVE').length} active · {temporalRecoveryActions.filter(ra => ra.status === 'BLOCKED').length} blocked · {temporalRecoveryActions.filter(ra => ra.status === 'PROPOSED').length} proposed</div>);
      case 'cross-zone-forecast':
        return (<div style={mono}>{cascadeRisks.length > 0 ? cascadeRisks.slice(0, 2).map((cr, i) => (<div key={i} style={{ fontSize: 9, marginBottom: 3 }}><span style={{ color: 'var(--sf-amber)' }}>{cr.direction}</span> · {cr.transferLikelihood}% · ~{cr.estimatedMinutes}m</div>)) : <span style={{ color: 'var(--sf-ink-3)' }}>No cascade risk detected</span>}</div>);
      case 'predictive-summary':
        return (<div style={mono}>{forecast ? (<><div>Global: {forecast.globalTrend} · conf: {forecast.globalConfidence}</div>{forecast.zones.filter(z => z.trend !== 'stable').map(z => (<div key={z.zoneId} style={{ fontSize: 9, color: 'var(--sf-ink-3)', marginTop: 2 }}>{z.zoneLabel}: {z.currentPressure}→{z.pressure15m}</div>))}</>) : 'No forecast data'}</div>);
      case 'stabilization-forecast':
        return (<div style={mono}>Est. stabilization: <span style={val}>{recoveryConf.estimatedStabilizationMin}m</span><div style={{ fontSize: 9, color: 'var(--sf-ink-3)', marginTop: 2 }}>Confidence: {recoveryConf.overallConfidence}{recoveryConf.weaknesses[0] ? ` · ${recoveryConf.weaknesses[0]}` : ''}</div></div>);
      case 'inbound-coord':
        return (<div style={mono}>{[...flightWorldMap.values()].filter(f => f.turnPhase === 'arrival').length} arriving · {[...flightWorldMap.values()].filter(f => f.turnPhase === 'servicing').length} servicing</div>);
      case 'coordination-msgs':
        return (<div style={mono}><span style={{ color: 'var(--sf-ink-3)' }}>No active coordination messages</span></div>);
      case 'resource-movement':
        return (<div style={mono}>{temporalRecoveryActions.filter(ra => ra.action_type === 'DISPATCH' && ra.status === 'ACTIVE').length} active dispatches · {temporalRecoveryActions.filter(ra => ra.action_type === 'EQUIPMENT_SWAP').length} equipment moves</div>);
      case 'kpi-strip': {
        const ai = temporalIncidents.filter(i => i.status !== 'RESOLVED' && i.status !== 'CLOSED').length;
        return (<div style={{ display: 'flex', gap: 16, ...mono }}>
          <div><div style={label}>Pressure</div><div style={{ ...val, color: operationalAssessment.globalPressure >= 70 ? 'var(--sf-red)' : 'var(--sf-green)' }}>{operationalAssessment.globalPressure}</div></div>
          <div><div style={label}>Active</div><div style={val}>{ai}</div></div>
          <div><div style={label}>Recovery</div><div style={val}>{recoveryProgress.pct}%</div></div>
          <div><div style={label}>Cascade</div><div style={{ ...val, color: cascadeRisks.length > 0 ? 'var(--sf-amber)' : 'var(--sf-green)' }}>{cascadeRisks.length}</div></div>
        </div>);
      }
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
            {slotId.startsWith('R') && <button onClick={() => moveModuleCrossRail(slotId, 'L')} style={{ background: 'none', border: '1px solid var(--sf-line)', borderRadius: 4, padding: '1px 6px', fontSize: 7, color: 'var(--sf-ink-4)', cursor: 'pointer', fontFamily: 'var(--sf-mono)' }}>→L</button>}
            {slotId.startsWith('L') && <button onClick={() => moveModuleCrossRail(slotId, 'R')} style={{ background: 'none', border: '1px solid var(--sf-line)', borderRadius: 4, padding: '1px 6px', fontSize: 7, color: 'var(--sf-ink-4)', cursor: 'pointer', fontFamily: 'var(--sf-mono)' }}>→R</button>}
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
          <div style={{ width: 380, padding: '40px 32px', background: '#080b10', border: '1px solid rgba(150,170,190,.08)', fontFamily: 'var(--sans)', borderRadius: 14 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#52d6e6', letterSpacing: '.06em', marginBottom: 4 }}>SOI</div>
            <div style={{ fontSize: 7, letterSpacing: '.2em', textTransform: 'uppercase', color: '#5c6772', marginBottom: 24 }}>Operational Intelligence</div>
            <input type="text" value={accessCode} onChange={e => setAccessCode(e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === 'Enter') handleAccessCode(); }} placeholder="ACCESS CODE" autoFocus
              style={{ width: '100%', padding: '10px 14px', marginBottom: 10, background: '#05070a', border: '1px solid rgba(150,170,190,.08)', color: '#eef3f8', fontFamily: 'inherit', fontSize: 15, letterSpacing: '.12em', textAlign: 'center', borderRadius: 8 }} />
            {accessError && <div style={{ fontSize: 9, color: '#ff5564', marginBottom: 8, textAlign: 'center' }}>{accessError}</div>}
            <button onClick={handleAccessCode} style={{ width: '100%', padding: '8px', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', fontFamily: 'inherit', background: 'none', border: '1px solid #52d6e6', color: '#52d6e6', cursor: 'pointer', borderRadius: 8 }}>Authenticate</button>
            <div style={{ fontSize: 8, color: '#3c454e', textAlign: 'center', marginTop: 12 }}>Demo: CHIEF52 · MGRLAX · OPSDIR · AGENT14</div>
          </div>
        </div>
      )}

      <div className={`env${crisisMode ? ' crisis' : ''}${editMode ? ' editing' : ''}`}>

        {/* ═══ EDIT MODE BANNER (replaces header) ═══ */}
        {editMode ? (
          <header className="edit-banner">
            <div className="edit-tag"><span className="pip" /><span className="t">Edit Layout</span></div>
            <span className="hint">Rearrange modules · <b>Recommendation</b> and <b>Command Dock</b> are locked anchors</span>
            <div className="edit-spacer" />
            {isModified && <div className="modified-pill"><span className="d" /><span className="t">Modified</span></div>}
            <button className="btn-banner danger" onClick={resetLayout}>Reset to Default</button>
            <button className="btn-banner ghost" onClick={() => { setLayoutSlots(savedSlots); setEditMode(false); }}>Cancel</button>
            <button className="btn-banner primary" onClick={() => { saveCurrentLayout(); setEditMode(false); }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L20 7" stroke="#03222a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Save Layout
            </button>
          </header>
        ) : (

        /* ═══ CRISIS STRIP ═══ */
        crisisMode ? (
          <>
            <header className="header">
              <div className="brand">
                <div className="brand-mark">
                  <svg viewBox="0 0 30 30" fill="none">
                    <circle cx="15" cy="15" r="13.5" stroke="#ff7d4d" strokeOpacity=".5"/>
                    <circle cx="15" cy="15" r="4" fill="#ff7d4d" fillOpacity=".18" stroke="#ff7d4d"/>
                    <path d="M15 1.5V6M15 24v4.5M1.5 15H6M24 15h4.5" stroke="#ff7d4d" strokeOpacity=".7" strokeWidth="1.2"/>
                  </svg>
                </div>
                <div className="brand-txt"><span className="name">SOI</span><span className="sub">Crisis Mode</span></div>
              </div>
              <div className="hdr-div" />
              <div className="station"><span className="code" style={{ color: 'var(--orange)' }}>{operator.station} · EAGLE</span><span className="mode">Gates 52A–I</span></div>
              <div className="hdr-spacer" />
              <div className="hdr-stat"><span className="v">{liveTime}</span><span className="k">Local</span></div>
              <div className="hdr-div" />
              <div className="soi-status">
                <div className="ai-orb" style={{ background: 'radial-gradient(circle at 38% 34%, #ffb89a 0%, #ff7d4d 32%, #8a3a1d 78%, #421a0a 100%)', boxShadow: '0 0 0 1px rgba(255,125,77,.4), 0 0 18px var(--glow-orange)' }} />
                <div className="lbl"><span className="a">Crisis Active</span><span className="b" style={{ color: 'var(--orange)' }}>Elevated pressure</span></div>
              </div>
              <button className="cta cta-ghost" style={{ padding: '8px 14px', fontSize: 11, borderRadius: 8 }} onClick={toggleCrisis}>Exit Crisis</button>
              <div className="op-avatar">{operator.displayName.split(' ').map(n => n[0]).join('')}</div>
            </header>
            <div className="crisis-strip">
              <div className="crisis-id">
                <span className="label">Active Incident</span>
                <span className="title">{soiRecommendations[0]?.title ?? `${operator.station} operational pressure elevated`}</span>
              </div>
              <div className="crisis-meta">
                <div className="cm-stat"><span className="k">Pressure</span><span className="v crit">{operationalAssessment.globalPressure}</span></div>
                <div className="cm-stat"><span className="k">Incidents</span><span className="v">{temporalIncidents.filter(i => i.status !== 'RESOLVED' && i.status !== 'CLOSED').length}</span></div>
                <div className="cm-stat"><span className="k">Recovery</span><span className="v">{recoveryProgress.pct}%</span></div>
              </div>
            </div>
          </>
        ) : (

        /* ═══ DEFAULT HEADER ═══ */
        <header className="header">
          <div className="brand">
            <div className="brand-mark">
              <svg viewBox="0 0 30 30" fill="none">
                <circle cx="15" cy="15" r="13.5" stroke="#52d6e6" strokeOpacity=".5"/>
                <circle cx="15" cy="15" r="4" fill="#52d6e6" fillOpacity=".18" stroke="#52d6e6"/>
                <path d="M15 1.5V6M15 24v4.5M1.5 15H6M24 15h4.5" stroke="#52d6e6" strokeOpacity=".7" strokeWidth="1.2"/>
              </svg>
            </div>
            <div className="brand-txt">
              <span className="name">SOI</span>
              <span className="sub">Operational Intelligence</span>
            </div>
          </div>
          <div className="hdr-div" />
          <div className="station">
            <span className="code">{operator.station} · EAGLE</span>
            <span className="mode">Gates 52A–I · Spatial</span>
          </div>
          <div className="hdr-spacer" />
          <div className="hdr-stat"><span className="v">{liveTime}</span><span className="k">Local</span></div>
          <div className="hdr-div" />
          <div className="hdr-stat"><span className="v c-cyan">{liveWeatherText?.split('.')[0] ?? 'Loading...'}</span><span className="k">Conditions</span></div>
          <div className="hdr-div" />
          <div className="hdr-stat"><span className="v">{operator.shiftWindow} Shift</span><span className="k">Shift</span></div>
          <div className="hdr-div" />
          <div className="soi-status">
            <div className="ai-orb" />
            <div className="lbl">
              <span className="a">SOI Active</span>
              <span className="b">Monitoring · {operationalAssessment.zoneAssessments.length} zones</span>
            </div>
          </div>

          <button onClick={() => setEditMode(true)} style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', padding: '7px 13px', borderRadius: 10, background: 'var(--elev-2)', border: '1px solid var(--line-2)', color: 'var(--ink-3)', cursor: 'pointer', transition: '.16s' }}>Edit</button>
          <button onClick={toggleCrisis} style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', padding: '7px 13px', borderRadius: 10, background: operationalAssessment.globalPressure >= 70 ? 'rgba(255,125,77,.06)' : 'var(--elev-2)', border: `1px solid ${operationalAssessment.globalPressure >= 70 ? 'rgba(255,125,77,.3)' : 'var(--line-2)'}`, color: operationalAssessment.globalPressure >= 70 ? 'var(--orange)' : 'var(--ink-3)', cursor: 'pointer', transition: '.16s' }}>Crisis</button>

          <div className="op-avatar" onClick={() => { clearIdentity(); setShowAccessPrompt(true); }} style={{ cursor: 'pointer' }} title="Switch operator">{operator.displayName.split(' ').map(n => n[0]).join('')}</div>
        </header>
        ))}

        {/* ═══ BODY ═══ */}
        <div className="body">

          {/* ─── LEFT RAIL ─── */}
          <aside className="rail left">
            {(() => {
              const leftBlocks = [
                // 0: Operational Snapshot
                <div key="snap" className="block-head"><span className="tac">Operational Snapshot</span>
                  <div className="snapshot" style={{ marginTop: 12 }}>
                    <div className="big"><span className="num">{operationalAssessment.globalPressure}</span><span className="unit">/ 100 PSI</span></div>
                    <div className="cap">System pressure index — {operationalAssessment.globalStability}</div>
                    {forecast && forecast.globalTrend !== 'stable' && (
                      <div className="trend"><span className="arrow">{forecast.globalTrend === 'rising' ? '▲' : '▼'}</span> {forecast.globalTrend} trend</div>
                    )}
                  </div>
                </div>,
                // 1: Zone Health
                <div key="zones">
                  <div className="block-head"><span className="tac">Zone Health</span><span className="meta">{operationalAssessment.zoneAssessments.length} ACTIVE</span></div>
                  <div className="zone-row">
                    {operationalAssessment.zoneAssessments.map(za => {
                      const barClass = za.pressure >= 80 ? 'red' : za.pressure >= 60 ? 'orange' : za.pressure >= 40 ? 'amber' : 'cyan';
                      const colorClass = za.pressure >= 80 ? 'c-red' : za.pressure >= 60 ? 'c-orange' : za.pressure >= 40 ? 'c-amber' : 'c-cyan';
                      const label = za.pressure >= 80 ? 'CRITICAL' : za.pressure >= 60 ? 'HIGH' : za.pressure >= 40 ? 'ELEVATED' : 'STABLE';
                      return (
                        <div key={za.zoneId} className="zone-item">
                          <div className="zl"><span className="nm">{za.zoneLabel}</span><span className={`vl ${colorClass}`}>{label} · {za.pressure}</span></div>
                          <div className="bar"><i className={barClass} style={{ width: `${za.pressure}%` }} /></div>
                        </div>
                      );
                    })}
                  </div>
                </div>,
                // 2: Staffing (prototype capacity model)
                <div key="staff">
                  <div className="block-head"><span className="tac">Staffing Capacity</span><span className="meta">PROTOTYPE</span></div>
                  <div className="staff">
                    <div className="grp"><span className="n num">{workforceState.assigned.length + workforceState.recovering.length}</span><span className="l">Deployed</span></div>
                    <div className="grp"><span className="n num c-cyan">{workforceState.available.length}</span><span className="l">Available</span></div>
                    <div className="grp"><span className="n num c-amber">{workforceState.recovering.length}</span><span className="l">Recovery</span></div>
                  </div>
                  <div style={{ fontSize: 8, color: 'var(--ink-4)', fontFamily: 'var(--mono)', letterSpacing: '.08em', marginTop: 8, textTransform: 'uppercase' }}>Capacity model · status from live events</div>
                </div>,
                // 3: Recovery Status — uses actual recovery action statuses when available
                <div key="recov">
                  <div className="block-head"><span className="tac">Recovery Status</span></div>
                  <div className="recov">
                    {(() => {
                      // Show ACTUAL recovery actions if any exist
                      const activeRAs = temporalRecoveryActions.filter(ra => ra.status !== 'COMPLETE' && ra.status !== 'WITHDRAWN' && ra.status !== 'ESCALATED');
                      if (activeRAs.length > 0) {
                        return activeRAs.slice(0, 4).map((ra, i) => {
                          const statusClass = ra.status === 'ACTIVE' ? 'active' : ra.status === 'COMPLETE' ? 'done' : 'wait';
                          const statusLabel = ra.status === 'ACTIVE' ? 'Executing' : ra.status === 'ACKNOWLEDGED' ? 'Acknowledged' : ra.status === 'BLOCKED' ? 'Blocked' : 'Pending execution';
                          return (
                            <div key={ra.id ?? i} className="step">
                              <span className={`marker ${statusClass}`} />
                              <div className="txt">
                                <span className="t">{ra.title?.slice(0, 50) ?? 'Recovery action'}</span>
                                <span className="s">{statusLabel}{ra.gate_id ? ` · ${ra.gate_id}` : ''}</span>
                              </div>
                            </div>
                          );
                        });
                      }
                      // Fall back to recommended actions (not yet executed)
                      if (soiRecommendations.length > 0) {
                        return soiRecommendations[0].recommendedActions.slice(0, 4).map((a, i) => (
                          <div key={i} className="step">
                            <span className="marker wait" />
                            <div className="txt">
                              <span className="t">{a.label}</span>
                              <span className="s">Recommended{a.expectedImpact ? ` · ${a.expectedImpact.slice(0, 30)}` : ''}</span>
                            </div>
                          </div>
                        ));
                      }
                      return (
                        <div className="step"><span className="marker done" /><div className="txt"><span className="t">No active recovery</span><span className="s">Operations nominal</span></div></div>
                      );
                    })()}
                  </div>
                </div>,
              ];
              const LEFT_BLOCK_NAMES = ['op-snapshot', 'zone-health', 'staffing', 'recovery-status'];
              return leftRailOrder.map((blockIdx, renderIdx) => (
                <div key={`left-${LEFT_BLOCK_NAMES[blockIdx]}`}
                  className={`block${dragItem?.rail === 'left' && dragItem.index === renderIdx ? ' dragging' : ''}${dragOverIndex?.rail === 'left' && dragOverIndex.index === renderIdx ? ' drag-over' : ''}`}
                  draggable={editMode}
                  onDragStart={e => handleDragStart('left', renderIdx, e)}
                  onDragOver={e => handleDragOver(e, 'left', renderIdx)}
                  onDragLeave={handleDragLeave}
                  onDrop={() => handleDrop('left', renderIdx)}
                  onDragEnd={handleDragEnd}
                >
                  {editMode && <div className="drag-handle"><span /><span /><span /></div>}
                  {leftBlocks[blockIdx]}
                </div>
              ));
            })()}

            {/* Dev controls — always visible at bottom of rail */}
            <div style={{ marginTop: 'auto', display: 'flex', gap: 4, flexWrap: 'wrap', paddingTop: 12, position: 'sticky', bottom: 0, background: 'var(--bg)', paddingBottom: 4, zIndex: 2 }}>
              <button className="cta cta-ghost" style={{ padding: '6px 10px', fontSize: 9, borderRadius: 6 }} onClick={async () => {
                const btn = document.activeElement as HTMLButtonElement;
                if (btn) btn.textContent = 'Seeding...';
                await clearDemoData();
                await seedDemoScenario();
                refresh();
                refreshIncidents();
                if (btn) btn.textContent = 'Seed ✓';
                setTimeout(() => { if (btn) btn.textContent = 'Seed'; }, 2000);
              }}>Seed</button>
              <button className="cta cta-ghost" style={{ padding: '6px 10px', fontSize: 9, borderRadius: 6 }} onClick={async () => {
                await clearDemoData();
                refresh();
                refreshIncidents();
              }}>Clear</button>
              <button className="cta cta-ghost" style={{ padding: '6px 10px', fontSize: 9, borderRadius: 6 }} onClick={refresh}>Refresh</button>
            </div>
          </aside>

          {/* ─── CENTER STAGE ─── */}
          <main className="stage">
            <div className="map-amb">
              <div className="bloom r" />
              <div className="bloom o" />
              <div className="bloom a" />
              <AirportScene
                assessment={operationalAssessment}
                flightWorld={flightWorldMap}
                selectedGateId={selectedGateId}
                onGateClick={gateId => {
                  setSelectedGateId(gateId === selectedGateId ? null : gateId);
                  const zoneId = zones.find(z => z.gate_ids.includes(gateId))?.id;
                  if (zoneId) setSelectedZoneId(zoneId === selectedZoneId ? null : zoneId);
                }}
              />
            </div>

            <div className="stage-inner">
              <div className="spatial-cap">
                <span className="ttl">{operator.station} · Pressure Field</span>
                <span className="pill" style={{ background: 'rgba(82,214,230,.08)', fontSize: 7 }}>Live Pressure</span>
                <span className="pill" style={{ background: 'rgba(255,255,255,.03)', borderColor: 'var(--line)', color: 'var(--ink-4)', fontSize: 7 }}>Prototype Map</span>
                <div className="legend-inline">
                  <div className="li"><span className="d" style={{ background: 'var(--red)', boxShadow: '0 0 8px var(--glow-red)' }} />Critical</div>
                  <div className="li"><span className="d" style={{ background: 'var(--orange)', boxShadow: '0 0 8px var(--glow-orange)' }} />High</div>
                  <div className="li"><span className="d" style={{ background: 'var(--amber)', boxShadow: '0 0 8px var(--glow-amber)' }} />Elevated</div>
                  <div className="li"><span className="d" style={{ background: 'var(--cyan)', boxShadow: '0 0 8px var(--glow-cyan)' }} />Stable</div>
                </div>
              </div>

              {/* ACTIVE RECOMMENDATION */}
              {soiRecommendations.length > 0 && (() => {
                const rec = soiRecommendations[0];
                const confPct = rec.confidence.score;
                const circumference = 2 * Math.PI * 33;
                const offset = circumference * (1 - confPct / 100);
                return (
                  <section className="rec">
                    <div className="rec-top">
                      <div className="rec-id">
                        <span className="tac">Active Recommendation · {liveTime}</span>
                        <span className="title">{rec.title}</span>
                        <span className="desc">{rec.summary}</span>
                      </div>
                      <div className="rec-conf">
                        <div className="conf-ring">
                          <svg width="78" height="78" viewBox="0 0 78 78">
                            <circle cx="39" cy="39" r="33" fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="4" />
                            <circle cx="39" cy="39" r="33" fill="none" stroke="#52d6e6" strokeWidth="4" strokeLinecap="round"
                              strokeDasharray={circumference} strokeDashoffset={offset} style={{ filter: 'drop-shadow(0 0 6px rgba(82,214,230,.5))', transform: 'rotate(-90deg)', transformOrigin: 'center' }} />
                          </svg>
                          <div className="val"><span className="p num">{confPct}</span><span className="l">Confidence</span></div>
                        </div>
                      </div>
                    </div>
                    <div className="rec-body">
                      <div className="proj">
                        <span className="tac">Projected Outcome</span>
                        <div className="proj-grid">
                          <div className="proj-item"><div className="pv c-cyan num">−{rec.preview.riskReducedBy}%</div><div className="pl">Pressure reduction</div></div>
                          <div className="proj-item"><div className="pv c-green num">−{Math.round(rec.preview.riskReducedBy * 1.5)}%</div><div className="pl">Cascade risk</div></div>
                          <div className="proj-item"><div className="pv num">{rec.estimatedStabilizationMinutes}<span style={{ fontSize: 12, color: 'var(--ink-3)' }}> min</span></div><div className="pl">Recovery window</div></div>
                          <div className="proj-item"><div className="pv num">{operationalAssessment.zoneAssessments.filter(z => z.stability !== 'stable').length}</div><div className="pl">Zones affected</div></div>
                        </div>
                      </div>
                      <div className="trade">
                        <span className="tac">Tradeoffs</span>
                        <div className="trade-list">
                          {rec.preview.possibleTradeoffs.filter(t => t !== 'No significant tradeoffs identified').slice(0, 3).map((t, i) => (
                            <div key={i} className="trade-row"><span className="d" style={{ background: i === 0 ? 'var(--orange)' : 'var(--amber)', boxShadow: `0 0 6px ${i === 0 ? 'var(--glow-orange)' : 'var(--glow-amber)'}` }} />{t}</div>
                          ))}
                          {rec.preview.possibleTradeoffs.filter(t => t !== 'No significant tradeoffs identified').length === 0 && (
                            <div className="trade-row"><span className="d" style={{ background: 'var(--green)', boxShadow: '0 0 6px rgba(63,212,137,.4)' }} />Low operational risk</div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="rec-actions">
                      <button className="cta cta-primary" onClick={() => handleCommand(`stabilize ${rec.affectedGate ?? rec.affectedZone}`)}>
                        Approve &amp; Execute <span className="dotk">↵</span>
                      </button>
                      <button className="cta cta-ghost" onClick={() => handleCommand('compare recovery options')}>Simulate Plan</button>
                      <button className="cta cta-ghost" onClick={() => handleCommand('brief me')}>Brief</button>
                    </div>
                  </section>
                );
              })()}

              {/* Response panels */}
              {commandResponse && (
                <div style={{ margin: '12px 0', padding: '14px 18px', background: 'rgba(255,255,255,.022)', border: '1px solid rgba(150,170,190,.08)', borderRadius: 12, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-2)' }}>
                  {commandResponse.map((line, i) => <div key={i} style={{ padding: '1px 0', color: i === 0 ? 'var(--ink)' : undefined }}>{line}</div>)}
                  <button onClick={() => setCommandResponse(null)} style={{ marginTop: 6, padding: '3px 8px', background: 'none', border: '1px solid rgba(150,170,190,.08)', borderRadius: 6, color: 'var(--ink-4)', fontFamily: 'inherit', fontSize: 8, cursor: 'pointer' }}>dismiss</button>
                </div>
              )}
              {copilotAnswer && copilotAnswer.title !== 'Processing' && (
                <div style={{ margin: '12px 0', padding: '14px 18px', background: 'rgba(255,255,255,.022)', border: '1px solid rgba(150,170,190,.08)', borderRadius: 12, fontFamily: 'var(--mono)' }}>
                  <div style={{ fontSize: 8, letterSpacing: '.2em', textTransform: 'uppercase', color: '#52d6e6', marginBottom: 6 }}>SOI</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>{copilotAnswer.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.5, marginBottom: 6 }}>{copilotAnswer.answer}</div>
                  {copilotAnswer.bullets.slice(0, 4).map((b, i) => (
                    <div key={i} style={{ fontSize: 10, color: 'var(--ink-3)', padding: '1px 0' }}>· {b}</div>
                  ))}
                  {copilotAnswer.recommendedNextAction && <div style={{ fontSize: 10, color: '#52d6e6', marginTop: 4 }}>→ {copilotAnswer.recommendedNextAction}</div>}
                  <button onClick={() => setCopilotAnswer(null)} style={{ marginTop: 6, padding: '3px 8px', background: 'none', border: '1px solid rgba(150,170,190,.08)', borderRadius: 6, color: 'var(--ink-4)', fontFamily: 'inherit', fontSize: 8, cursor: 'pointer' }}>dismiss</button>
                </div>
              )}

              {/* ── Agent Selection Panel ── */}
              {agentSelection && agentSelection.phase === 'picking' && (
                <div style={{ margin: '12px 0', padding: '18px', background: 'linear-gradient(180deg, rgba(82,214,230,.04), rgba(82,214,230,.01))', border: '1px solid rgba(82,214,230,.2)', borderRadius: 14, fontFamily: 'var(--mono)' }}>
                  <div style={{ fontSize: 8, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--cyan)', marginBottom: 8 }}>Assign Team to Gate {agentSelection.gate}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-2)', marginBottom: 12 }}>Select agents, then say &ldquo;assign&rdquo; or click Dispatch.</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {agentSelection.candidates.map((c, i) => {
                      const isSelected = agentSelection.selected.has(c.id);
                      const statusColor = c.status === 'available' ? 'var(--green)' : c.status === 'assigned' ? 'var(--amber)' : c.status === 'recovering' ? 'var(--orange)' : 'var(--ink-4)';
                      return (
                        <div key={c.id} onClick={() => toggleAgentSelection(c.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', transition: '.14s',
                            background: isSelected ? 'rgba(82,214,230,.08)' : 'rgba(255,255,255,.015)',
                            border: `1px solid ${isSelected ? 'rgba(82,214,230,.35)' : 'rgba(150,170,190,.06)'}` }}>
                          <span style={{ width: 20, height: 20, borderRadius: 5, border: `1.5px solid ${isSelected ? 'var(--cyan)' : 'var(--ink-4)'}`, background: isSelected ? 'rgba(82,214,230,.15)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--cyan)', fontWeight: 600, flexShrink: 0 }}>
                            {isSelected ? '✓' : (i + 1)}
                          </span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 500 }}>{c.name}</div>
                            <div style={{ fontSize: 9, color: 'var(--ink-3)' }}>{c.role} · workload {c.workload}/3</div>
                          </div>
                          <span style={{ fontSize: 8, letterSpacing: '.12em', textTransform: 'uppercase', color: statusColor, fontWeight: 600 }}>{c.status}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    <button className="cta cta-primary" style={{ fontSize: 12, padding: '10px 18px' }}
                      disabled={agentSelection.selected.size === 0}
                      onClick={() => {
                        if (agentSelection.selected.size === 0) return;
                        const selectedNames = agentSelection.candidates.filter(c => agentSelection.selected.has(c.id)).map(c => c.name);
                        setPendingAssignment({ gate: agentSelection.gate, members: Array.from(agentSelection.selected), reasoning: `Selected by operator: ${selectedNames.join(', ')}` });
                        setAgentSelection({ ...agentSelection, phase: 'confirming' });
                        setCopilotAnswer({
                          title: `Confirm: Dispatch to Gate ${agentSelection.gate}`,
                          answer: `Assign ${selectedNames.join(', ')} to Gate ${agentSelection.gate}?`,
                          confidence: 'high',
                          bullets: [`+${Math.round(agentSelection.selected.size * 12)} staffing coverage`, `-${Math.round(agentSelection.selected.size * 9)}% delay risk`],
                          assumptions: [], recommendedNextAction: 'Say "confirm" to dispatch',
                          source: 'deterministic_operational_model',
                        });
                        setCommandResponse(null);
                        soiSpeak(`Ready to dispatch ${selectedNames.join(' and ')} to Gate ${agentSelection.gate}. Confirm?`);
                      }}>
                      Dispatch Selected ({agentSelection.selected.size})
                    </button>
                    <button className="cta cta-ghost" style={{ fontSize: 12, padding: '10px 14px' }} onClick={() => { setAgentSelection(null); setCommandResponse(null); }}>Cancel</button>
                  </div>
                </div>
              )}

            </div>

            {/* COMMAND DOCK — pinned at bottom of stage, never scrolls away */}
            <div className="dock-wrap">
              <div className="dock">
                <div className="dock-orb" />
                <div className="wave">
                  <span /><span /><span /><span /><span /><span /><span />
                </div>
                <div className="dock-input" onClick={() => {
                  const el = document.getElementById('soi-cmd-input');
                  if (el) el.focus();
                }}>
                  <input id="soi-cmd-input" type="text" value={commandInput} onChange={e => setCommandInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && commandInput.trim()) { lastInputWasVoiceRef.current = false; handleCommand(commandInput); } }}
                    placeholder="Ask SOI, or issue a command…"
                    style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--ink-2)', fontFamily: 'var(--sans)', fontSize: 15, fontWeight: 300, width: '100%' }} />
                  <span className="hint">{ttsOn ? 'Voice on' : 'Voice off'} · {voiceState !== 'idle' ? voiceState : 'type or hold mic'}</span>
                </div>
                <div className="dock-meta">
                  {/* Voice toggle */}
                  <button onClick={() => { if (ttsOn) { disableTTS(); setTtsOn(false); } else { enableTTS(); setTtsOn(true); } }}
                    style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', padding: '6px 10px', borderRadius: 8, background: ttsOn ? 'rgba(82,214,230,.08)' : 'transparent', border: `1px solid ${ttsOn ? 'rgba(82,214,230,.3)' : 'var(--line)'}`, color: ttsOn ? 'var(--cyan)' : 'var(--ink-4)', cursor: 'pointer', transition: '.16s' }}>
                    {ttsOn ? '🔊 On' : '🔇 Off'}
                  </button>
                  {/* Mic push-to-talk */}
                  {isVoiceInputAvailable() && (
                    <div style={{ cursor: 'pointer' }} onMouseDown={() => startListening()} onMouseUp={() => stopListening()} onMouseLeave={() => { if (voiceState === 'listening') stopListening(); }}>
                      {voiceState === 'listening' ? (
                        <div className="listening"><span className="ld" />Listening</div>
                      ) : (
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.16em', color: 'var(--ink-4)', textTransform: 'uppercase', cursor: 'pointer' }}>🎙 Hold</div>
                      )}
                    </div>
                  )}
                  <button className="dock-send" onClick={() => { if (commandInput.trim()) { lastInputWasVoiceRef.current = false; handleCommand(commandInput); } }}>
                    <svg viewBox="0 0 24 24" fill="none"><path d="M5 12h13M13 6l6 6-6 6" stroke="#03222a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                </div>
                {crisisMode && (
                  <div style={{ display: 'flex', gap: 8, marginLeft: 8 }}>
                    <button className="dock-chip info" onClick={() => handleCommand('brief me')}>Brief Team</button>
                    <button className="dock-chip warn" onClick={() => handleCommand('stabilize worst zone')}>Hold Position</button>
                    <button className="dock-chip danger" onClick={() => handleCommand('stabilize worst zone')}>Escalate</button>
                  </div>
                )}
              </div>
            </div>
          </main>

          {/* ─── RIGHT RAIL ─── */}
          <aside className="rail right">
            {(() => {
              const rightBlocks = [
                // 0: Operational Intelligence
                <div key="intel">
                  <div className="block-head"><span className="tac">Operational Intelligence</span></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    {soiRecommendations.slice(0, 3).map((rec, i) => {
                      const sevColor = rec.severity === 'critical' ? 'var(--red)' : rec.severity === 'high' ? 'var(--orange)' : 'var(--amber)';
                      const glowColor = rec.severity === 'critical' ? 'var(--glow-red)' : rec.severity === 'high' ? 'var(--glow-orange)' : 'var(--glow-amber)';
                      return (
                        <div key={rec.id} className="intel-item">
                          <div className="intel-row">
                            <span className="intel-glyph" style={{ background: sevColor, boxShadow: `0 0 8px ${glowColor}` }} />
                            <div className="intel-txt">
                              <span className="it">{rec.title}</span>
                              <span className="is">{rec.summary.slice(0, 120)}</span>
                              <span className="intel-tag">{rec.severity === 'critical' ? 'Active Risk' : rec.severity === 'high' ? 'Elevated' : 'Advisory'}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {soiRecommendations.length === 0 && (
                      <div className="intel-item"><div className="intel-row"><span className="intel-glyph" style={{ background: 'var(--cyan)', boxShadow: '0 0 8px var(--glow-cyan)' }} /><div className="intel-txt"><span className="it">Operations nominal</span><span className="is">No elevated intelligence signals.</span></div></div></div>
                    )}
                  </div>
                </div>,
                // 1: Recovery Confidence (prototype model)
                <div key="conf">
                  <div className="block-head"><span className="tac">Recovery Confidence</span><span className="meta">PROTOTYPE MODEL</span></div>
                  <div className="predict">
                    <div className="spark">
                      {Array.from({ length: 9 }).map((_, i) => (
                        <span key={i} style={{ height: `${Math.min(95, 30 + recoveryConf.score * (i + 1) / 9)}%` }} />
                      ))}
                    </div>
                    <div className="pr"><span>Current projection</span><span className="num c-cyan">{recoveryConf.score}%</span></div>
                    <div className="pr"><span>Delayed scenario (est.)</span><span className="num c-amber">{Math.max(20, recoveryConf.score - 28)}%</span></div>
                    <div style={{ fontSize: 7, color: 'var(--ink-4)', fontFamily: 'var(--mono)', letterSpacing: '.06em', marginTop: 6, textTransform: 'uppercase' }}>Score from live incidents · weights require calibration</div>
                  </div>
                </div>,
                // 2: Recommended Next
                <div key="next">
                  <div className="block-head"><span className="tac">Recommended Next</span></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {soiRecommendations.slice(0, 3).map((rec, i) => (
                      <div key={i} className="micro" onClick={() => handleCommand(rec.recommendedActions[0]?.label ?? rec.title)}>
                        <span className="mi">{rec.recommendedActions[0]?.label ?? rec.title}</span>
                        <span className="ma">Execute</span>
                      </div>
                    ))}
                    {soiRecommendations.length === 0 && (
                      <div className="micro"><span className="mi">No pending actions</span><span className="ma">—</span></div>
                    )}
                  </div>
                </div>,
              ];
              const RIGHT_BLOCK_NAMES = ['op-intel', 'recovery-conf', 'recommended-next'];
              return rightRailOrder.map((blockIdx, renderIdx) => (
                <div key={`right-${RIGHT_BLOCK_NAMES[blockIdx]}`}
                  className={`block${dragItem?.rail === 'right' && dragItem.index === renderIdx ? ' dragging' : ''}${dragOverIndex?.rail === 'right' && dragOverIndex.index === renderIdx ? ' drag-over' : ''}`}
                  draggable={editMode}
                  onDragStart={e => handleDragStart('right', renderIdx, e)}
                  onDragOver={e => handleDragOver(e, 'right', renderIdx)}
                  onDragLeave={handleDragLeave}
                  onDrop={() => handleDrop('right', renderIdx)}
                  onDragEnd={handleDragEnd}
                >
                  {editMode && <div className="drag-handle"><span /><span /><span /></div>}
                  {rightBlocks[blockIdx]}
                </div>
              ));
            })()}
          </aside>
        </div>
      </div>
    </>
  );
}
