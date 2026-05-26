'use client';

import { useState, useRef, useEffect } from 'react';
import { useLiveEvents, useRealtimeIncidents, useRecoveryActions, updateEventStatus, resetEvents, fetchZones } from '@/lib/store';
import { durationLabel } from '@/lib/rampiq-types';
import type { RampiqEvent, Severity, OperationalStatus } from '@/lib/rampiq-types';
import type { Zone } from '@/lib/rampiq-types';
import { SeverityIndicator, ElapsedTime, EventCard, IncidentCard, KpiStrip, CommandBar, ZoneTile } from '@/components/rampiq';
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
} from '@/lib/lifecycle-commands';
import type { Incident } from '@/lib/lifecycle-types';
import type { IncidentStatus, RecoveryActionStatus } from '@/lib/operational-states';
import { RECOVERY_ACTION_STATUS_LABELS, validTransitions as getValidTransitions } from '@/lib/operational-states';

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

export default function ManagerDashboard() {
  const { events, loading, lastUpdated, refresh } = useLiveEvents(3000);
  const [view, setView] = useState<View>('feed');
  const [filters, setFilters] = useState<EventFilters>(EMPTY_FILTERS);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const prevIdsRef = useRef<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

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
  const [incSubmitting, setIncSubmitting] = useState(false);

  useEffect(() => {
    fetchZones('LAX').then(setZones);
  }, []);

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
      created_by: 'CC01',
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
      actor_id: 'CC01',
      actor_role: 'CREW_CHIEF',
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
  const [raTitle, setRaTitle] = useState('');
  const [raType, setRaType] = useState('');
  const [raRole, setRaRole] = useState('');
  const [raDesc, setRaDesc] = useState('');
  const [raSubmitting, setRaSubmitting] = useState(false);
  const [raTransitioning, setRaTransitioning] = useState<string | null>(null);

  async function handleCreateRecoveryAction() {
    if (!raTitle.trim() || !selectedIncidentId) return;
    setRaSubmitting(true);
    await createRecoveryAction({
      incident_id: selectedIncidentId,
      title: raTitle.trim(),
      action_type: raType || undefined,
      proposed_by: 'CC01',
      assigned_to: raRole || undefined,
      description: raDesc.trim() || undefined,
    });
    setRaTitle('');
    setRaType('');
    setRaRole('');
    setRaDesc('');
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
      actor_id: 'CC01',
      actor_role: 'CREW_CHIEF',
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
  // DERIVED STATE (from derived-operational-state.ts)
  // ============================================================

  const ds = deriveDashboardState(events);
  const { summary, filterOptions, patterns, attentionEvents } = ds;
  const { resolutionLatency } = summary;

  // ============================================================
  // FILTERS
  // ============================================================

  function setFilter(key: FilterKey, val: string) {
    setFilters(f => ({ ...f, [key]: val }));
  }

  const filteredEvents = filterEvents(events, filters);
  const filteredOpen = filterEvents(events.filter(isOpen), filters);
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
    if (events.length === 0) {
      return <div className="rq-quiet" style={{ padding: '24px 16px' }}>No data yet</div>;
    }

    const { byType, byGate, byEquipment, byShift } = patterns;
    const { avg: avgRes, p50: p50Res, p90: p90Res } = resolutionLatency;

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

        {/* Active incidents list */}
        {incidentsLoading && incidents.length === 0 && (
          <div className="rq-quiet" style={{ padding: '24px 16px' }}>Loading incidents...</div>
        )}
        {!incidentsLoading && incidents.length === 0 && (
          <div className="rq-quiet" style={{ padding: '24px 16px' }}>No active incidents</div>
        )}

        {incidents.map(inc => (
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
        {(filterOptions.gates.length > 0 || filterOptions.equipment.length > 0 || filterOptions.shifts.length > 0) && (
          <div className="rq-filters">
            {filterOptions.gates.length > 0 && (
              <>
                {['ALL', ...filterOptions.gates].map(g => (
                  <button key={`g-${g}`} className={`rq-chip${filters.gate === g ? ' active' : ''}`}
                    onClick={() => setFilter('gate', g)}>
                    {g === 'ALL' ? 'All Gates' : g}
                  </button>
                ))}
                {(filterOptions.equipment.length > 0 || filterOptions.shifts.length > 0) && (
                  <span style={{ width: 1, background: 'var(--rq-line)', margin: '0 2px' }} />
                )}
              </>
            )}
            {filterOptions.equipment.length > 0 && (
              <>
                {['ALL', ...filterOptions.equipment].map(eq => (
                  <button key={`e-${eq}`} className={`rq-chip${filters.equipment === eq ? ' active' : ''}`}
                    onClick={() => setFilter('equipment', eq)}>
                    {eq === 'ALL' ? 'All Equip' : eq}
                  </button>
                ))}
                {filterOptions.shifts.length > 0 && (
                  <span style={{ width: 1, background: 'var(--rq-line)', margin: '0 2px' }} />
                )}
              </>
            )}
            {filterOptions.shifts.length > 0 && (
              <>
                {['ALL', ...filterOptions.shifts].map(sh => (
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

  // Triage-sorted incidents: severity (CRITICAL first), then oldest first
  const triageIncidents = [...incidents].sort((a, b) => {
    const sevRank: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    const sa = sevRank[a.severity] ?? 9;
    const sb = sevRank[b.severity] ?? 9;
    if (sa !== sb) return sa - sb;
    return new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime();
  });

  // Filtered event memory: lifecycle transitions + high-severity, newest first
  const eventMemory = events
    .filter(e => e.entity_type === 'incident' || e.severity === 'CRITICAL' || e.severity === 'HIGH' || isOpen(e))
    .slice(0, 20);

  return (
    <>
      {/* Command bar — full width */}
      <CommandBar
        station="LAX"
        role="Crew Chief"
        lastEventSync={lastUpdated}
        lastIncidentSync={incidentLastSync}
        activeIncidentCount={incidents.length}
        openEventCount={summary.openCount}
      />

      {/* Three-panel grid */}
      <div className="rq-console-grid">

        {/* ── LEFT RAIL: Zone overview ── */}
        <div className="rq-console-rail-left">
          <div style={{
            padding: '6px 12px', fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9, color: 'var(--rq-ink-4)', letterSpacing: '.1em',
            textTransform: 'uppercase',
          }}>
            Zones
          </div>
          {zones.length === 0 && (
            <div className="rq-quiet" style={{ padding: '12px', fontSize: 11 }}>No zones loaded</div>
          )}
          {zones.map(z => {
            // Derive zone pressure from open events at zone gates
            const zoneOpenEvents = events.filter(e =>
              e.gate_id && z.gate_ids.includes(e.gate_id) && isOpen(e)
            ).length;
            const zoneIncidents = incidents.filter(i => i.zone_id === z.id).length;
            // Pressure: open events * 12 + incidents * 25, capped at 100
            const pressure = Math.min(100, zoneOpenEvents * 12 + zoneIncidents * 25);
            return (
              <ZoneTile
                key={z.id}
                name={z.label}
                gateCount={z.gate_ids.length}
                pressure={pressure}
                incidentCount={zoneIncidents}
              />
            );
          })}
        </div>

        {/* ── CENTER: Main operational surface ── */}
        <div className="rq-console-center">
          <div className="rq-ops-board">

            <KpiStrip summary={summary} />

            {/* Compact attention strip — desktop: inline details, mobile: summary */}
            {attentionEvents.length > 0 && (
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
                  {attentionEvents.length} attention
                </span>

                {/* Mobile: compact summary */}
                <span className="rq-attention-summary" style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--rq-ink-2)',
                }}>
                  {attentionEvents.filter(e => e.severity === 'CRITICAL').length > 0
                    ? `${attentionEvents.filter(e => e.severity === 'CRITICAL').length} critical · `
                    : ''
                  }
                  {attentionEvents.filter(e => e.severity === 'HIGH').length} high requiring action
                </span>

                {/* Desktop: inline event details with actions */}
                {attentionEvents.map(e => (
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
                { key: 'feed' as const, label: 'Live Feed', count: summary.total },
                { key: 'unresolved' as const, label: 'Unresolved', count: summary.openCount },
                { key: 'incidents' as const, label: 'Incidents', count: incidents.length },
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

            {/* Dev controls */}
            <div style={{ padding: '14px 16px', display: 'flex', gap: 8 }}>
              <button className="rq-btn-secondary" onClick={refresh} style={{ flex: 1 }}>
                Refresh
              </button>
              <button className="rq-btn-secondary" onClick={() => { resetEvents(); refresh(); }}
                style={{ flex: 1, color: 'var(--rq-red)', borderColor: 'var(--rq-red-dim)' }}>
                Reset (Dev)
              </button>
            </div>
          </div>
        </div>

        {/* ── RIGHT RAIL: Incident triage / detail / event memory ── */}
        <div className="rq-console-rail-right">
          {selectedIncident ? (
            /* ── Selected incident detail ── */
            <>
              <div className="rq-rail-header">
                <span>Incident Detail</span>
                <button type="button" onClick={() => setSelectedIncidentId(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--rq-ink-3)',
                    cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", fontSize: 9 }}>
                  back
                </button>
              </div>
              <div style={{ padding: '0 8px' }}>
                <IncidentCard
                  incident={selectedIncident}
                  isTransitioning={incidentTransitioning === selectedIncident.id}
                  onTransition={handleIncidentTransition}
                  isSelected
                />
              </div>

              {/* Lifecycle event timeline */}
              {incidentEvents.length > 0 && (
                <div style={{ padding: '6px 12px' }}>
                  <div className="rq-rail-header" style={{ padding: '4px 0' }}>Event Timeline</div>
                  {incidentEvents.map(ev => (
                    <div key={ev.id} style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                      color: 'var(--rq-ink-3)', padding: '3px 0',
                      borderBottom: '1px solid var(--rq-line)',
                      display: 'flex', justifyContent: 'space-between', gap: 8,
                    }}>
                      <span style={{ color: ev.state_after ? 'var(--rq-ink-2)' : 'var(--rq-ink-3)' }}>
                        {ev.event_type.replace(/_/g, ' ')}
                      </span>
                      <ElapsedTime since={ev.created_at} format="relative" />
                    </div>
                  ))}
                </div>
              )}

              {/* ── Recovery Actions ── */}
              <div style={{ padding: '4px 12px' }}>
                <div className="rq-rail-header" style={{ padding: '4px 0' }}>
                  <span>Recovery Actions</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'var(--rq-ink-4)' }}>
                    {recoveryActions.length}
                  </span>
                </div>

                {/* Create toggle */}
                <button
                  type="button"
                  onClick={() => setShowRecoveryForm(!showRecoveryForm)}
                  style={{
                    width: '100%', padding: '4px 8px', marginBottom: 4,
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                    letterSpacing: '.06em', textTransform: 'uppercase',
                    background: 'var(--rq-bg-2)', border: '1px solid var(--rq-line)',
                    color: 'var(--rq-ink-3)', cursor: 'pointer',
                  }}
                >
                  {showRecoveryForm ? 'Cancel' : '+ Propose Action'}
                </button>

                {/* Inline creation form */}
                {showRecoveryForm && (
                  <div style={{
                    padding: '6px 0', borderBottom: '1px solid var(--rq-line)', marginBottom: 4,
                  }}>
                    <input
                      type="text" value={raTitle} onChange={e => setRaTitle(e.target.value)}
                      placeholder="Action title"
                      style={{
                        width: '100%', padding: '5px 8px', marginBottom: 4,
                        background: 'var(--rq-bg-2)', border: '1px solid var(--rq-line-2)',
                        color: 'var(--rq-ink)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                      }}
                    />
                    <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                      <select value={raType} onChange={e => setRaType(e.target.value)}
                        style={{
                          flex: 1, padding: '4px 6px',
                          background: 'var(--rq-bg-2)', border: '1px solid var(--rq-line-2)',
                          color: 'var(--rq-ink)', fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                        }}
                      >
                        <option value="">Type</option>
                        <option value="DISPATCH">Dispatch</option>
                        <option value="EQUIPMENT_SWAP">Equip Swap</option>
                        <option value="PERSONNEL">Personnel</option>
                        <option value="ESCALATION">Escalation</option>
                        <option value="OTHER">Other</option>
                      </select>
                      <select value={raRole} onChange={e => setRaRole(e.target.value)}
                        style={{
                          flex: 1, padding: '4px 6px',
                          background: 'var(--rq-bg-2)', border: '1px solid var(--rq-line-2)',
                          color: 'var(--rq-ink)', fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                        }}
                      >
                        <option value="">Assign</option>
                        <option value="CREW_CHIEF">Crew Chief</option>
                        <option value="LT_RUNNER">LT / Runner</option>
                        <option value="RAMP_AGENT">Ramp Agent</option>
                        <option value="LAV_TECH">LAV Tech</option>
                        <option value="OPS">Ops</option>
                      </select>
                    </div>
                    <input
                      type="text" value={raDesc} onChange={e => setRaDesc(e.target.value)}
                      placeholder="Notes (optional)"
                      style={{
                        width: '100%', padding: '5px 8px', marginBottom: 4,
                        background: 'var(--rq-bg-2)', border: '1px solid var(--rq-line-2)',
                        color: 'var(--rq-ink)', fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                      }}
                    />
                    <button
                      type="button"
                      disabled={!raTitle.trim() || raSubmitting}
                      onClick={handleCreateRecoveryAction}
                      className="rq-qbtn qb-ack"
                      style={{ width: '100%', padding: '5px', fontSize: 9 }}
                    >
                      {raSubmitting ? 'Creating...' : 'Create Action'}
                    </button>
                  </div>
                )}

                {/* Recovery actions list */}
                {recoveryActions.length === 0 && !showRecoveryForm && (
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                    color: 'var(--rq-ink-4)', padding: '4px 0',
                  }}>
                    No recovery actions yet
                  </div>
                )}
                {recoveryActions.map(ra => {
                  const nextStatuses = getValidTransitions('recovery_action', ra.status);
                  const transitioning = raTransitioning === ra.id;
                  const statusColor = ra.status === 'ACTIVE' ? 'var(--rq-green)'
                    : ra.status === 'BLOCKED' ? 'var(--rq-red)'
                    : ra.status === 'COMPLETE' ? 'var(--rq-green)'
                    : 'var(--rq-ink-3)';

                  return (
                    <div key={ra.id} style={{
                      padding: '5px 0', borderBottom: '1px solid var(--rq-line)',
                    }}>
                      <div style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600,
                        color: 'var(--rq-ink)', display: 'flex', justifyContent: 'space-between',
                      }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>
                          {ra.title}
                        </span>
                        <ElapsedTime since={ra.created_at} format="relative" />
                      </div>
                      <div style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                        color: 'var(--rq-ink-4)', marginTop: 1, display: 'flex', gap: 6,
                      }}>
                        <span style={{ color: statusColor, fontWeight: 600 }}>
                          {RECOVERY_ACTION_STATUS_LABELS[ra.status]}
                        </span>
                        {ra.action_type && <span>{ra.action_type}</span>}
                        {ra.assigned_to && <span>&rarr; {ra.assigned_to}</span>}
                      </div>
                      {ra.description && (
                        <div style={{
                          fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                          color: 'var(--rq-ink-3)', marginTop: 2,
                        }}>
                          {ra.description}
                        </div>
                      )}
                      {nextStatuses.length > 0 && (
                        <div style={{ display: 'flex', gap: 3, marginTop: 3 }}>
                          {nextStatuses.map(ns => (
                            <button key={ns} type="button"
                              className={`rq-qbtn ${ns === 'COMPLETE' ? 'qb-resolve' : ns === 'ACKNOWLEDGED' ? 'qb-ack' : ns === 'WITHDRAWN' || ns === 'ESCALATED' ? 'qb-resolve' : 'qb-prog'}`}
                              style={{ padding: '1px 6px', fontSize: 8 }}
                              disabled={transitioning}
                              onClick={() => handleRecoveryTransition(ra.id, ns as RecoveryActionStatus)}
                            >
                              {transitioning ? '...' : RECOVERY_ACTION_STATUS_LABELS[ns as RecoveryActionStatus]}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Compact metadata */}
              <div style={{
                padding: '6px 12px', fontFamily: "'JetBrains Mono', monospace",
                fontSize: 8, color: 'var(--rq-ink-4)', display: 'flex', gap: 8, flexWrap: 'wrap',
              }}>
                <span>id: {selectedIncident.id.slice(0, 8)}</span>
                <span>corr: {selectedIncident.correlation_id.slice(0, 8)}</span>
                <span>by: {selectedIncident.created_by}</span>
              </div>
            </>

          ) : triageIncidents.length > 0 ? (
            /* ── Active incidents triage list (default when incidents exist) ── */
            <>
              <div className="rq-rail-header">
                <span>Active Incidents</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'var(--rq-ink-4)' }}>
                  {triageIncidents.length}
                </span>
              </div>
              {triageIncidents.map(inc => {
                const sevColor = inc.severity === 'CRITICAL' || inc.severity === 'HIGH'
                  ? 'var(--rq-red)' : inc.severity === 'MEDIUM' ? 'var(--rq-amber)' : 'var(--rq-ink-3)';
                return (
                  <div
                    key={inc.id}
                    onClick={() => setSelectedIncidentId(inc.id)}
                    style={{
                      padding: '6px 12px', cursor: 'pointer',
                      borderBottom: '1px solid var(--rq-line)',
                      borderLeft: `2px solid ${sevColor}`,
                      transition: 'background .1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--rq-bg-2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600,
                      color: 'var(--rq-ink)', display: 'flex', justifyContent: 'space-between',
                    }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                        {inc.title}
                      </span>
                      <ElapsedTime since={inc.opened_at} format="relative" />
                    </div>
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                      color: 'var(--rq-ink-4)', marginTop: 2, display: 'flex', gap: 6,
                    }}>
                      <span style={{ color: sevColor, fontWeight: 600 }}>{inc.severity}</span>
                      <span>{inc.status}</span>
                      {inc.zone_id && <span>{inc.zone_id}</span>}
                      {inc.gate_id && <span>{inc.gate_id}</span>}
                    </div>
                  </div>
                );
              })}

              {/* Event memory below triage list */}
              <div className="rq-rail-header" style={{ marginTop: 4 }}>Event Memory</div>
              {eventMemory.slice(0, 8).map(ev => (
                <div key={ev.id} style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                  color: 'var(--rq-ink-4)', padding: '3px 12px',
                  borderBottom: '1px solid var(--rq-line)',
                  display: 'flex', justifyContent: 'space-between',
                }}>
                  <span style={{ color: ev.entity_type === 'incident' ? 'var(--rq-ink-2)' : 'var(--rq-ink-3)' }}>
                    {ev.event_type.replace(/_/g, ' ')}
                  </span>
                  <ElapsedTime since={ev.created_at} format="relative" />
                </div>
              ))}
            </>

          ) : (
            /* ── No incidents — show filtered event memory ── */
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
                    <span style={{ color: ev.entity_type === 'incident' ? 'var(--rq-ink-2)' : 'var(--rq-ink-3)' }}>
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

