'use client';

import { useState, useRef, useEffect } from 'react';
import { useLiveEvents, useRealtimeIncidents, updateEventStatus, resetEvents, fetchZones } from '@/lib/store';
import { formatTime, durationLabel, STATUS_LABELS } from '@/lib/rampiq-types';
import type { RampiqEvent, Severity, OperationalStatus } from '@/lib/rampiq-types';
import type { Zone } from '@/lib/rampiq-types';
import { SeverityIndicator, OperationalStatus as OperationalStatusPill, ElapsedTime } from '@/components/rampiq';
import {
  deriveDashboardState,
  filterEvents,
  activeFilterCount as countActiveFilters,
  isOpen,
  agingClass,
  ageMinutes,
  groupByAging,
  sortBySeverityThenAge,
} from '@/lib/derived-operational-state';
import type { EventFilters } from '@/lib/derived-operational-state';
import {
  createIncident,
  transitionIncident,
} from '@/lib/lifecycle-commands';
import type { Incident } from '@/lib/lifecycle-types';
import {
  INCIDENT_STATUS_LABELS,
  validTransitions,
} from '@/lib/operational-states';
import type { IncidentStatus } from '@/lib/operational-states';

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

function sevClass(sev: Severity): string {
  return `sev-${sev.toLowerCase()}`;
}

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
  const { severity: sevCounts, resolutionLatency } = summary;

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

  // ============================================================
  // EVENT CARD
  // ============================================================

  function EventCard({ e, showAging = false }: { e: RampiqEvent; showAging?: boolean }) {
    const expanded = expandedId === e.id;
    const updating = updatingId === e.id;
    const classes = [
      'rq-evt',
      sevClass(e.severity as Severity),
      showAging ? agingClass(e) : '',
      newIds.has(e.id) ? 'is-new' : '',
    ].filter(Boolean).join(' ');

    return (
      <div
        className={classes}
        onClick={() => setExpandedId(expanded ? null : e.id)}
      >
        {/* Row 1: severity + type + location + age */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600,
            color: 'var(--rq-ink)',
          }}>
            {e.event_type.replace(/_/g, ' ')}
          </span>
          {e.gate_id && (
            <span style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              color: 'var(--rq-ink-3)',
            }}>
              {e.gate_id}
            </span>
          )}
          {e.equipment_id && (
            <span style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              color: 'var(--rq-ink-3)',
            }}>
              {e.equipment_id}
            </span>
          )}
          <span style={{ marginLeft: 'auto' }}>
            <ElapsedTime
              since={e.created_at}
              format="relative"
              showAgeColor={isOpen(e)}
            />
          </span>
        </div>

        {/* Row 2: status + reporter + severity tag */}
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
          color: 'var(--rq-ink-3)', marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap',
          alignItems: 'center',
        }}>
          <OperationalStatusPill
            status={e.operational_status}
            label={STATUS_LABELS[e.operational_status as OperationalStatus]}
            variant="pill"
          />
          <SeverityIndicator severity={e.severity as Severity} variant="badge" />
          <span>{e.reported_by}</span>
          <span>{e.shift_window}</span>
          {e.event_duration_seconds != null && (
            <span style={{ color: 'var(--rq-ink-4)' }}>{durationLabel(e.event_duration_seconds)}</span>
          )}
        </div>

        {/* Notes */}
        {e.notes && (
          <div style={{
            fontSize: 12, color: 'var(--rq-ink-2)', marginTop: 5, lineHeight: 1.4,
          }}>
            {e.notes}
          </div>
        )}

        {/* Quick actions — always visible for open events */}
        {isOpen(e) && (
          <div className="rq-quick-actions">
            {e.operational_status === 'OPEN' && (
              <button className="rq-qbtn qb-ack" disabled={updating}
                onClick={(ev) => handleStatus(e.id, 'ACKNOWLEDGED', ev)}>
                Ack
              </button>
            )}
            {(e.operational_status === 'OPEN' || e.operational_status === 'ACKNOWLEDGED') && (
              <button className="rq-qbtn qb-prog" disabled={updating}
                onClick={(ev) => handleStatus(e.id, 'IN_PROGRESS', ev)}>
                In Prog
              </button>
            )}
            <button className="rq-qbtn qb-resolve" disabled={updating}
              onClick={(ev) => handleStatus(e.id, 'RESOLVED', ev)}>
              {updating ? '...' : 'Resolve'}
            </button>
          </div>
        )}

        {/* Expanded detail panel */}
        {expanded && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--rq-line)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 12px' }}>
              <DItem label="Severity">
                <SeverityIndicator severity={e.severity as Severity} variant="pill" />
              </DItem>
              <DItem label="Status">
                <OperationalStatusPill
                  status={e.operational_status}
                  label={STATUS_LABELS[e.operational_status as OperationalStatus]}
                  variant="pill"
                />
              </DItem>
              <DItem label="Reporter" value={`${e.reported_by} (${e.role_type.replace(/_/g, ' ')})`} />
              <DItem label="Shift" value={e.shift_window} />
              <DItem label="Device" value={e.device_id} />
              <DItem label="Platform" value={e.source_platform} />
              <DItem label="Target" value={`${e.qr_target_type} · ${e.qr_target_id}`} />
              <DItem label="Reported" value={formatTime(e.created_at)} />
              {e.resolved_at && <DItem label="Resolved at" value={formatTime(e.resolved_at)} />}
              {e.resolved_by && <DItem label="Resolved by" value={e.resolved_by} />}
              {e.event_duration_seconds != null && <DItem label="Duration" value={durationLabel(e.event_duration_seconds)} />}
            </div>
          </div>
        )}
      </div>
    );
  }

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
        {filteredEvents.map(e => <EventCard key={e.id} e={e} showAging />)}
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
            {group.events.map(e => <EventCard key={e.id} e={e} showAging />)}
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

        {incidents.map(inc => {
          const transitioning = incidentTransitioning === inc.id;
          const nextStatuses = validTransitions('incident', inc.status);

          return (
            <div
              key={inc.id}
              className={`rq-evt sev-${inc.severity.toLowerCase()}`}
              style={{ cursor: 'default' }}
            >
              {/* Row 1: title + age */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600,
                  color: 'var(--rq-ink)',
                }}>
                  {inc.title}
                </span>
                <span style={{ marginLeft: 'auto' }}>
                  <ElapsedTime since={inc.opened_at} format="relative" showAgeColor />
                </span>
              </div>

              {/* Row 2: status + severity + location */}
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                color: 'var(--rq-ink-3)', marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap',
                alignItems: 'center',
              }}>
                <OperationalStatusPill
                  status={inc.status}
                  label={INCIDENT_STATUS_LABELS[inc.status as IncidentStatus]}
                  variant="pill"
                />
                <SeverityIndicator severity={inc.severity as Severity} variant="badge" />
                {inc.zone_id && <span>{inc.zone_id}</span>}
                {inc.gate_id && <span>{inc.gate_id}</span>}
                {inc.assigned_to && <span>→ {inc.assigned_to}</span>}
              </div>

              {/* Description */}
              {inc.description && (
                <div style={{ fontSize: 12, color: 'var(--rq-ink-2)', marginTop: 5, lineHeight: 1.4 }}>
                  {inc.description}
                </div>
              )}

              {/* Transition buttons */}
              {nextStatuses.length > 0 && (
                <div className="rq-quick-actions">
                  {nextStatuses.map(ns => (
                    <button
                      key={ns}
                      className={`rq-qbtn ${ns === 'RESOLVED' || ns === 'CLOSED' ? 'qb-resolve' : ns === 'CONFIRMED' ? 'qb-ack' : 'qb-prog'}`}
                      disabled={transitioning}
                      onClick={() => handleIncidentTransition(inc.id, ns as IncidentStatus)}
                    >
                      {transitioning ? '...' : INCIDENT_STATUS_LABELS[ns as IncidentStatus]}
                    </button>
                  ))}
                </div>
              )}

              {/* Debug: incident metadata */}
              <div style={{
                marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--rq-line)',
                fontFamily: "'JetBrains Mono', monospace", fontSize: 8,
                color: 'var(--rq-ink-4)', display: 'flex', gap: 8, flexWrap: 'wrap',
              }}>
                <span>id: {inc.id.slice(0, 8)}</span>
                <span>corr: {inc.correlation_id.slice(0, 8)}</span>
                <span>status: {inc.status}</span>
                <span>by: {inc.created_by}</span>
              </div>
            </div>
          );
        })}
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

  return (
    <div className="rq-ops-board">
      {/* Header */}
      <div className="rq-gate-header">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div className="rq-gate-id" style={{ fontSize: 20 }}>Operations</div>
          <div className="rq-pulse" />
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
            color: 'var(--rq-ink-3)', letterSpacing: '.12em', textTransform: 'uppercase' as const,
          }}>
            LIVE
          </span>
        </div>
        <div className="rq-gate-meta">
          LAX &middot; <b>Manager</b> &middot; 3s
          {lastUpdated && <> &middot; {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</>}
        </div>
      </div>

      {/* KPIs */}
      <div className="rq-kpis rq-kpis-4">
        <div className="rq-kpi">
          <div className="rq-kpi-lbl">Open</div>
          <div className={`rq-kpi-val${summary.openCount > 0 ? ' rq-v-a' : ''}`}>{summary.openCount}</div>
        </div>
        <div className="rq-kpi">
          <div className="rq-kpi-lbl">Crit+High</div>
          <div className={`rq-kpi-val${summary.critHighCount > 0 ? ' rq-v-r' : ''}`}>{summary.critHighCount}</div>
        </div>
        <div className="rq-kpi">
          <div className="rq-kpi-lbl">Resolved</div>
          <div className={`rq-kpi-val${summary.resolvedCount > 0 ? ' rq-v-g' : ''}`}>{summary.resolvedCount}</div>
        </div>
        <div className="rq-kpi">
          <div className="rq-kpi-lbl">Oldest Open</div>
          <div className={`rq-kpi-val${summary.oldestOpen && ageMinutes(summary.oldestOpen.created_at) > 15 ? ' rq-v-r' : ''}`}>
            {summary.oldestOpen
              ? <ElapsedTime since={summary.oldestOpen.created_at} format="relative" />
              : '--'
            }
          </div>
        </div>
      </div>

      {/* Severity breakdown */}
      <div className="rq-sev-counters">
        <div className="rq-sev-count">
          <div className="rq-sev-count-n" style={{ color: sevCounts.CRITICAL > 0 ? 'var(--rq-red)' : 'var(--rq-ink-4)' }}>{sevCounts.CRITICAL}</div>
          <div className="rq-sev-count-l">Critical</div>
        </div>
        <div className="rq-sev-count">
          <div className="rq-sev-count-n" style={{ color: sevCounts.HIGH > 0 ? 'var(--rq-red)' : 'var(--rq-ink-4)' }}>{sevCounts.HIGH}</div>
          <div className="rq-sev-count-l">High</div>
        </div>
        <div className="rq-sev-count">
          <div className="rq-sev-count-n" style={{ color: sevCounts.MEDIUM > 0 ? 'var(--rq-amber)' : 'var(--rq-ink-4)' }}>{sevCounts.MEDIUM}</div>
          <div className="rq-sev-count-l">Medium</div>
        </div>
        <div className="rq-sev-count">
          <div className="rq-sev-count-n" style={{ color: sevCounts.LOW > 0 ? 'var(--rq-ink-3)' : 'var(--rq-ink-4)' }}>{sevCounts.LOW}</div>
          <div className="rq-sev-count-l">Low</div>
        </div>
      </div>

      {/* Critical/High attention banners */}
      {attentionEvents.map(e => (
          <div className="rq-attn" key={e.id}>
            <div className="rq-attn-row">
              <SeverityIndicator severity={e.severity as Severity} variant="text" />
              <span className="rq-attn-time">
                <ElapsedTime since={e.created_at} format="relative" />
              </span>
            </div>
            <div className="rq-attn-msg">
              <b>{e.event_type.replace(/_/g, ' ')}</b>
              {e.gate_id && <> — {e.gate_id}</>}
              {e.equipment_id && <> — {e.equipment_id}</>}
              {e.notes && <> — {e.notes}</>}
            </div>
            <div className="rq-quick-actions" style={{ marginTop: 6 }}>
              {e.operational_status === 'OPEN' && (
                <button className="rq-qbtn qb-ack" disabled={updatingId === e.id}
                  onClick={(ev) => handleStatus(e.id, 'ACKNOWLEDGED', ev)}>Ack</button>
              )}
              <button className="rq-qbtn qb-resolve" disabled={updatingId === e.id}
                onClick={(ev) => handleStatus(e.id, 'RESOLVED', ev)}>
                {updatingId === e.id ? '...' : 'Resolve'}
              </button>
            </div>
          </div>
        ))
      }

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

      {/* Realtime sync status (dev) */}
      <div style={{
        padding: '6px 16px', fontFamily: "'JetBrains Mono', monospace",
        fontSize: 8, color: 'var(--rq-ink-4)', display: 'flex', gap: 12,
      }}>
        <span>events: {lastUpdated ? lastUpdated.toLocaleTimeString('en-US', { hour12: false }) : '—'}</span>
        <span>incidents: {incidentLastSync ? incidentLastSync.toLocaleTimeString('en-US', { hour12: false }) : '—'}</span>
        <span>active: {incidents.length}</span>
      </div>

      <div className="rq-quiet">RampIQ · Operational Memory</div>
    </div>
  );
}

// ============================================================
// HELPERS
// ============================================================

// statusBorderColor, sevFg, sevBg removed — replaced by
// SeverityIndicator and OperationalStatus primitives from
// @/components/rampiq which derive colors from operational-states.ts.

function DItem({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div style={{ padding: '2px 0' }}>
      <span style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 8,
        color: 'var(--rq-ink-4)', letterSpacing: '.1em', textTransform: 'uppercase' as const,
      }}>
        {label}
      </span>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
        color: 'var(--rq-ink-2)',
      }}>
        {children ?? value}
      </div>
    </div>
  );
}
