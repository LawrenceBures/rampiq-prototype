'use client';

import { useState, useRef, useEffect } from 'react';
import { useLiveEvents, useRealtimeIncidents, useRecoveryActions, updateEventStatus, resetEvents, fetchZones } from '@/lib/store';
import { durationLabel } from '@/lib/rampiq-types';
import type { RampiqEvent, Severity, OperationalStatus } from '@/lib/rampiq-types';
import type { Zone } from '@/lib/rampiq-types';
import { SeverityIndicator, ElapsedTime, EventCard, IncidentCard, KpiStrip, CommandBar, ZoneTile, IncidentDetailPanel } from '@/components/rampiq';
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
import type { Incident } from '@/lib/lifecycle-types';
import type { IncidentStatus, RecoveryActionStatus } from '@/lib/operational-states';
import { reconstructIncidents, reconstructRecoveryActions } from '@/lib/replay-lifecycle';
import { deriveWorkforceCoordination } from '@/lib/workforce-coordination';
import type { EscalationSignal } from '@/lib/workforce-coordination';
import { analyzeOperationalPatterns } from '@/lib/operational-patterns';
import type { PatternInsight, InsightCategory, PressureState } from '@/lib/operational-patterns';

// ============================================================
// TYPES
// ============================================================

type View = 'feed' | 'unresolved' | 'patterns' | 'incidents';
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

// Operator identity for the current session
type ViewerRole = 'coordinator' | 'manager' | 'ops_director';

interface OperatorSession {
  userId: string;
  displayName: string;
  role: string;
  viewerRole: ViewerRole;
  zoneId?: string;
}

const OPERATORS: OperatorSession[] = [
  { userId: 'CC01', displayName: 'Martinez J.', role: 'CREW_CHIEF', viewerRole: 'coordinator', zoneId: 'GATES-52ABC' },
  { userId: 'CC02', displayName: 'Reyes M.', role: 'CREW_CHIEF', viewerRole: 'coordinator', zoneId: 'GATES-52DEF' },
  { userId: 'OPS01', displayName: 'Kim D.', role: 'OPS', viewerRole: 'manager' },
  { userId: 'DIR01', displayName: 'Chen L.', role: 'OPS_DIRECTOR', viewerRole: 'ops_director' },
];

export default function ManagerDashboard() {
  const { events, loading, lastUpdated, refresh } = useLiveEvents(3000);
  const [view, setView] = useState<View>('feed');
  const [operator, setOperator] = useState<OperatorSession>(OPERATORS[0]);
  const [filters, setFilters] = useState<EventFilters>(EMPTY_FILTERS);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const prevIdsRef = useRef<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

  // ============================================================
  // REPLAY MODE
  // ============================================================

  const [replayMode, setReplayMode] = useState(false);
  const [replayTimestamp, setReplayTimestamp] = useState<Date | null>(null);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const replayIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startReplay() {
    // Compute bounds at start time — use events (available now) to find window
    const eventTs = events.map(e => new Date(e.created_at).getTime()).filter(t => t > 0);
    const twoHoursAgo = Date.now() - 2 * 60 * 60_000;
    // Find lifecycle events (they indicate when operational activity started)
    const lifecycleTs = events.filter(e => e.entity_type === 'incident' || e.entity_type === 'recovery_action')
      .map(e => new Date(e.created_at).getTime());
    const startTime = lifecycleTs.length > 0
      ? Math.max(Math.min(...lifecycleTs) - 10 * 60_000, twoHoursAgo)
      : eventTs.length > 0 ? Math.max(Math.min(...eventTs), twoHoursAgo) : twoHoursAgo;
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

  // EventCard — extracted to components/rampiq/EventCard.tsx

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

      {/* Workforce coordination strip (role-aware) */}
      {(workforce.escalations.length > 0 || workforce.summary.overloadedCount > 0 || workforce.ownershipGaps.length > 0) && (
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
          {(operator.viewerRole === 'manager' || operator.viewerRole === 'ops_director') && workforce.summary.overloadedCount > 0 && (
            <span style={{ fontSize: 8, color: 'var(--rq-red)' }}>
              {workforce.summary.overloadedCount} coord. need support
            </span>
          )}
          {operator.viewerRole === 'coordinator' && workforce.operatorLoads.find(o => o.operatorId === operator.userId)?.saturation === 'overloaded' && (
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
                          <span style={{ color: myLoad.saturation === 'overloaded' ? 'var(--rq-red)' : 'var(--rq-amber)', fontWeight: 600 }}>
                            {myLoad.saturation === 'overloaded' ? 'need support' : myLoad.saturation}
                          </span>
                        </span>
                      </div>
                    )}
                    {/* Manager/Director see aggregates or individuals */}
                    {showIndividuals && elevated.filter(o => o.operatorId !== operator.userId).slice(0, 4).map(op => {
                      const color = op.saturation === 'overloaded' ? 'var(--rq-red)' : op.saturation === 'saturated' ? 'var(--rq-amber)' : 'var(--rq-ink-3)';
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
            /* ── No incidents — show event memory ── */
            <>
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

      <div className="rq-quiet" style={{ padding: '6px 16px' }}>RampIQ · Operational Memory</div>
    </>
  );
}

// ============================================================
// HELPERS
// ============================================================

// statusBorderColor, sevFg, sevBg removed — replaced by
// SeverityIndicator and OperationalStatus primitives from
// @/components/rampiq which derive colors from operational-states.ts.

