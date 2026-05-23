'use client';

import { useState, useRef, useEffect } from 'react';
import { useLiveEvents, updateEventStatus, resetEvents } from '@/lib/store';
import {
  formatTime, eventAge, durationLabel,
  SEVERITY_ORDER, STATUS_LABELS,
} from '@/lib/rampiq-types';
import type { RampiqEvent, Severity, OperationalStatus } from '@/lib/rampiq-types';

// ============================================================
// TYPES
// ============================================================

type View = 'feed' | 'unresolved' | 'patterns';
type FilterKey = 'severity' | 'status' | 'gate' | 'equipment' | 'shift';

interface Filters {
  severity: string;
  status: string;
  gate: string;
  equipment: string;
  shift: string;
}

const EMPTY_FILTERS: Filters = {
  severity: 'ALL', status: 'ALL', gate: 'ALL', equipment: 'ALL', shift: 'ALL',
};

// ============================================================
// HELPERS
// ============================================================

function ageMins(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
}

function ageSeconds(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
}

function agingClass(e: RampiqEvent): string {
  if (e.operational_status === 'RESOLVED' || e.operational_status === 'CANCELLED') return '';
  const m = ageMins(e.created_at);
  if (m > 30) return 'aging-stale';
  if (m > 15) return 'aging-hot';
  if (m > 5) return 'aging-warm';
  return '';
}

function sevClass(sev: Severity): string {
  return `sev-${sev.toLowerCase()}`;
}

function isNew(e: RampiqEvent): boolean {
  return ageSeconds(e.created_at) < 60;
}

function isOpen(e: RampiqEvent): boolean {
  return e.operational_status !== 'RESOLVED' && e.operational_status !== 'CANCELLED';
}

// Percentile helper
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function ManagerDashboard() {
  const { events, loading, lastUpdated, refresh } = useLiveEvents(3000);
  const [view, setView] = useState<View>('feed');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const prevIdsRef = useRef<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

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
  // COMPUTED
  // ============================================================

  const open = events.filter(isOpen);
  const resolved = events.filter(e => e.operational_status === 'RESOLVED');

  const bySev = (sev: Severity) => open.filter(e => e.severity === sev).length;
  const critCount = bySev('CRITICAL');
  const highCount = bySev('HIGH');
  const medCount = bySev('MEDIUM');
  const lowCount = bySev('LOW');

  // Oldest open event
  const oldestOpen = open.length > 0
    ? open.reduce((oldest, e) => e.created_at < oldest.created_at ? e : oldest)
    : null;
  const oldestAge = oldestOpen ? eventAge(oldestOpen.created_at) : '--';

  // Resolution latency stats
  const resTimes = resolved
    .map(e => e.event_duration_seconds)
    .filter((d): d is number => d != null && d > 0)
    .sort((a, b) => a - b);
  const avgRes = resTimes.length > 0 ? Math.round(resTimes.reduce((s, v) => s + v, 0) / resTimes.length) : null;
  const p50Res = resTimes.length > 0 ? percentile(resTimes, 50) : null;
  const p90Res = resTimes.length > 0 ? percentile(resTimes, 90) : null;

  // Unique values for filter chips
  const uniqueGates = Array.from(new Set(events.filter(e => e.gate_id).map(e => e.gate_id!)));
  const uniqueEquip = Array.from(new Set(events.filter(e => e.equipment_id).map(e => e.equipment_id!)));
  const uniqueShifts = Array.from(new Set(events.map(e => e.shift_window)));

  // ============================================================
  // FILTERS
  // ============================================================

  function setFilter(key: FilterKey, val: string) {
    setFilters(f => ({ ...f, [key]: val }));
  }

  function applyFilters(list: RampiqEvent[]): RampiqEvent[] {
    let out = list;
    if (filters.severity !== 'ALL') out = out.filter(e => e.severity === filters.severity);
    if (filters.status !== 'ALL') out = out.filter(e => e.operational_status === filters.status);
    if (filters.gate !== 'ALL') out = out.filter(e => e.gate_id === filters.gate);
    if (filters.equipment !== 'ALL') out = out.filter(e => e.equipment_id === filters.equipment);
    if (filters.shift !== 'ALL') out = out.filter(e => e.shift_window === filters.shift);
    return out;
  }

  const activeFilterCount = Object.values(filters).filter(v => v !== 'ALL').length;

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
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
            color: isOpen(e) && ageMins(e.created_at) > 15 ? 'var(--rq-red)' : 'var(--rq-ink-3)',
            marginLeft: 'auto', fontWeight: isOpen(e) && ageMins(e.created_at) > 15 ? 700 : 400,
          }}>
            {eventAge(e.created_at)}
          </span>
        </div>

        {/* Row 2: status + reporter + severity tag */}
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
          color: 'var(--rq-ink-3)', marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap',
          alignItems: 'center',
        }}>
          <span style={{
            padding: '1px 5px',
            border: `1px solid ${statusBorderColor(e.operational_status as OperationalStatus)}`,
            color: statusBorderColor(e.operational_status as OperationalStatus),
            fontSize: 8, letterSpacing: '.08em', textTransform: 'uppercase' as const,
          }}>
            {STATUS_LABELS[e.operational_status as OperationalStatus]}
          </span>
          <span style={{ fontSize: 9, padding: '1px 4px', background: sevBg(e.severity as Severity), color: sevFg(e.severity as Severity) }}>
            {e.severity}
          </span>
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
              <DItem label="Severity" value={e.severity} />
              <DItem label="Status" value={STATUS_LABELS[e.operational_status as OperationalStatus]} />
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
    const filtered = applyFilters(events);
    return (
      <>
        {renderFilterBar()}
        {filtered.length === 0 && (
          <div className="rq-quiet" style={{ padding: '24px 16px' }}>
            {events.length === 0 ? 'No events yet — waiting for agent signals' : 'No events match filters'}
          </div>
        )}
        {filtered.map(e => <EventCard key={e.id} e={e} showAging />)}
      </>
    );
  }

  // ============================================================
  // UNRESOLVED VIEW — grouped by aging band
  // ============================================================

  function renderUnresolved() {
    const unresolved = applyFilters(open)
      .sort((a, b) => {
        const sd = SEVERITY_ORDER[a.severity as Severity] - SEVERITY_ORDER[b.severity as Severity];
        if (sd !== 0) return sd;
        return a.created_at.localeCompare(b.created_at); // oldest first within same severity
      });

    // Group by aging band
    const stale = unresolved.filter(e => ageMins(e.created_at) > 30);
    const hot = unresolved.filter(e => { const m = ageMins(e.created_at); return m > 15 && m <= 30; });
    const warm = unresolved.filter(e => { const m = ageMins(e.created_at); return m > 5 && m <= 15; });
    const fresh = unresolved.filter(e => ageMins(e.created_at) <= 5);

    return (
      <>
        {renderFilterBar()}
        {unresolved.length === 0 && (
          <div className="rq-quiet" style={{ padding: '24px 16px' }}>All clear — no unresolved events</div>
        )}

        {stale.length > 0 && (
          <>
            <div className="rq-age-group ag-stale">
              <div className="rq-age-dot" />
              <span>Stale &gt; 30 min ({stale.length})</span>
            </div>
            {stale.map(e => <EventCard key={e.id} e={e} showAging />)}
          </>
        )}

        {hot.length > 0 && (
          <>
            <div className="rq-age-group ag-hot">
              <div className="rq-age-dot" />
              <span>Aging 15–30 min ({hot.length})</span>
            </div>
            {hot.map(e => <EventCard key={e.id} e={e} showAging />)}
          </>
        )}

        {warm.length > 0 && (
          <>
            <div className="rq-age-group ag-warm">
              <div className="rq-age-dot" />
              <span>Active 5–15 min ({warm.length})</span>
            </div>
            {warm.map(e => <EventCard key={e.id} e={e} showAging />)}
          </>
        )}

        {fresh.length > 0 && (
          <>
            <div className="rq-age-group ag-fresh">
              <div className="rq-age-dot" />
              <span>Just reported &lt; 5 min ({fresh.length})</span>
            </div>
            {fresh.map(e => <EventCard key={e.id} e={e} showAging />)}
          </>
        )}
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

    // Resolution times by event type
    const resByType: Record<string, { total: number; count: number }> = {};
    resolved.forEach(e => {
      if (!resByType[e.event_type]) resByType[e.event_type] = { total: 0, count: 0 };
      resByType[e.event_type].total += e.event_duration_seconds || 0;
      resByType[e.event_type].count++;
    });

    // By event type
    const byType: Record<string, number> = {};
    events.forEach(e => { byType[e.event_type] = (byType[e.event_type] || 0) + 1; });
    const typeEntries = Object.entries(byType).sort((a, b) => b[1] - a[1]);
    const maxType = Math.max(...typeEntries.map(([, c]) => c), 1);

    // By gate
    const byGate: Record<string, number> = {};
    events.filter(e => e.gate_id).forEach(e => { byGate[e.gate_id!] = (byGate[e.gate_id!] || 0) + 1; });
    const gateEntries = Object.entries(byGate).sort((a, b) => b[1] - a[1]);
    const maxGate = Math.max(...gateEntries.map(([, c]) => c), 1);

    // By equipment
    const byEquip: Record<string, number> = {};
    events.filter(e => e.equipment_id).forEach(e => { byEquip[e.equipment_id!] = (byEquip[e.equipment_id!] || 0) + 1; });
    const equipEntries = Object.entries(byEquip).sort((a, b) => b[1] - a[1]);
    const maxEquip = Math.max(...equipEntries.map(([, c]) => c), 1);

    // By shift
    const byShift: Record<string, number> = {};
    events.forEach(e => { byShift[e.shift_window] = (byShift[e.shift_window] || 0) + 1; });
    const shiftEntries = Object.entries(byShift).sort((a, b) => b[1] - a[1]);
    const maxShift = Math.max(...shiftEntries.map(([, c]) => c), 1);

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
        {typeEntries.length > 0 && (
          <>
            <div className="rq-eyebrow">By event type</div>
            {typeEntries.map(([type, count]) => (
              <div className="rq-pat-row" key={type}>
                <div className="rq-pat-label">{type.replace(/_/g, ' ')}</div>
                <div className="rq-pat-bar-track">
                  <div className="rq-pat-bar-fill" style={{
                    width: `${(count / maxType) * 100}%`,
                    background: 'var(--rq-accent)',
                  }} />
                </div>
                <div className="rq-pat-count">{count}</div>
                <div className="rq-pat-avg">
                  {resByType[type] ? `avg ${durationLabel(Math.round(resByType[type].total / resByType[type].count))}` : ''}
                </div>
              </div>
            ))}
          </>
        )}

        {/* By gate */}
        {gateEntries.length > 0 && (
          <>
            <div className="rq-eyebrow">By gate</div>
            {gateEntries.map(([gate, count]) => (
              <div className="rq-pat-row" key={gate}>
                <div className="rq-pat-label">Gate {gate}</div>
                <div className="rq-pat-bar-track">
                  <div className="rq-pat-bar-fill" style={{
                    width: `${(count / maxGate) * 100}%`,
                    background: 'var(--rq-blue)',
                  }} />
                </div>
                <div className="rq-pat-count">{count}</div>
                <div className="rq-pat-avg" />
              </div>
            ))}
          </>
        )}

        {/* By equipment */}
        {equipEntries.length > 0 && (
          <>
            <div className="rq-eyebrow">By equipment</div>
            {equipEntries.map(([equip, count]) => (
              <div className="rq-pat-row" key={equip}>
                <div className="rq-pat-label">{equip}</div>
                <div className="rq-pat-bar-track">
                  <div className="rq-pat-bar-fill" style={{
                    width: `${(count / maxEquip) * 100}%`,
                    background: 'var(--rq-amber)',
                  }} />
                </div>
                <div className="rq-pat-count">{count}</div>
                <div className="rq-pat-avg" />
              </div>
            ))}
          </>
        )}

        {/* By shift */}
        {shiftEntries.length > 0 && (
          <>
            <div className="rq-eyebrow">By shift</div>
            {shiftEntries.map(([shift, count]) => (
              <div className="rq-pat-row" key={shift}>
                <div className="rq-pat-label">{shift}</div>
                <div className="rq-pat-bar-track">
                  <div className="rq-pat-bar-fill" style={{
                    width: `${(count / maxShift) * 100}%`,
                    background: 'var(--rq-green)',
                  }} />
                </div>
                <div className="rq-pat-count">{count}</div>
                <div className="rq-pat-avg" />
              </div>
            ))}
          </>
        )}
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
        {(uniqueGates.length > 0 || uniqueEquip.length > 0 || uniqueShifts.length > 0) && (
          <div className="rq-filters">
            {uniqueGates.length > 0 && (
              <>
                {['ALL', ...uniqueGates].map(g => (
                  <button key={`g-${g}`} className={`rq-chip${filters.gate === g ? ' active' : ''}`}
                    onClick={() => setFilter('gate', g)}>
                    {g === 'ALL' ? 'All Gates' : g}
                  </button>
                ))}
                {(uniqueEquip.length > 0 || uniqueShifts.length > 0) && (
                  <span style={{ width: 1, background: 'var(--rq-line)', margin: '0 2px' }} />
                )}
              </>
            )}
            {uniqueEquip.length > 0 && (
              <>
                {['ALL', ...uniqueEquip].map(eq => (
                  <button key={`e-${eq}`} className={`rq-chip${filters.equipment === eq ? ' active' : ''}`}
                    onClick={() => setFilter('equipment', eq)}>
                    {eq === 'ALL' ? 'All Equip' : eq}
                  </button>
                ))}
                {uniqueShifts.length > 0 && (
                  <span style={{ width: 1, background: 'var(--rq-line)', margin: '0 2px' }} />
                )}
              </>
            )}
            {uniqueShifts.length > 0 && (
              <>
                {['ALL', ...uniqueShifts].map(sh => (
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
        {activeFilterCount > 0 && (
          <div style={{
            padding: '4px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'var(--rq-ink-4)' }}>
              {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active
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
          <div className={`rq-kpi-val${open.length > 0 ? ' rq-v-a' : ''}`}>{open.length}</div>
        </div>
        <div className="rq-kpi">
          <div className="rq-kpi-lbl">Crit+High</div>
          <div className={`rq-kpi-val${(critCount + highCount) > 0 ? ' rq-v-r' : ''}`}>{critCount + highCount}</div>
        </div>
        <div className="rq-kpi">
          <div className="rq-kpi-lbl">Resolved</div>
          <div className={`rq-kpi-val${resolved.length > 0 ? ' rq-v-g' : ''}`}>{resolved.length}</div>
        </div>
        <div className="rq-kpi">
          <div className="rq-kpi-lbl">Oldest Open</div>
          <div className={`rq-kpi-val${oldestOpen && ageMins(oldestOpen.created_at) > 15 ? ' rq-v-r' : ''}`}>
            {oldestAge}
          </div>
        </div>
      </div>

      {/* Severity breakdown */}
      <div className="rq-sev-counters">
        <div className="rq-sev-count">
          <div className="rq-sev-count-n" style={{ color: critCount > 0 ? 'var(--rq-red)' : 'var(--rq-ink-4)' }}>{critCount}</div>
          <div className="rq-sev-count-l">Critical</div>
        </div>
        <div className="rq-sev-count">
          <div className="rq-sev-count-n" style={{ color: highCount > 0 ? 'var(--rq-red)' : 'var(--rq-ink-4)' }}>{highCount}</div>
          <div className="rq-sev-count-l">High</div>
        </div>
        <div className="rq-sev-count">
          <div className="rq-sev-count-n" style={{ color: medCount > 0 ? 'var(--rq-amber)' : 'var(--rq-ink-4)' }}>{medCount}</div>
          <div className="rq-sev-count-l">Medium</div>
        </div>
        <div className="rq-sev-count">
          <div className="rq-sev-count-n" style={{ color: lowCount > 0 ? 'var(--rq-ink-3)' : 'var(--rq-ink-4)' }}>{lowCount}</div>
          <div className="rq-sev-count-l">Low</div>
        </div>
      </div>

      {/* Critical/High attention banners */}
      {open
        .filter(e => e.severity === 'CRITICAL' || e.severity === 'HIGH')
        .sort((a, b) => SEVERITY_ORDER[a.severity as Severity] - SEVERITY_ORDER[b.severity as Severity])
        .slice(0, 3)
        .map(e => (
          <div className="rq-attn" key={e.id}>
            <div className="rq-attn-row">
              <span className="rq-attn-tag">{e.severity}</span>
              <span className="rq-attn-time">{eventAge(e.created_at)}</span>
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
          { key: 'feed' as const, label: 'Live Feed', count: events.length },
          { key: 'unresolved' as const, label: 'Unresolved', count: open.length },
          { key: 'patterns' as const, label: 'Patterns', count: null },
        ]).map(tab => (
          <button
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
            {tab.key === 'unresolved' && open.length > 0 && (
              <span style={{
                marginLeft: 5, padding: '1px 5px',
                background: 'rgba(255,92,92,.12)', color: 'var(--rq-red)',
                fontSize: 9,
              }}>
                {open.length}
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

      <div className="rq-quiet">RampIQ · Operational Memory</div>
    </div>
  );
}

// ============================================================
// HELPERS
// ============================================================

function statusBorderColor(status: OperationalStatus): string {
  const map: Record<OperationalStatus, string> = {
    OPEN: 'var(--rq-red)',
    ACKNOWLEDGED: 'var(--rq-amber)',
    IN_PROGRESS: 'var(--rq-blue)',
    RESOLVED: 'var(--rq-green)',
    CANCELLED: 'var(--rq-ink-4)',
  };
  return map[status] || 'var(--rq-line)';
}

function sevFg(sev: Severity): string {
  const map: Record<Severity, string> = {
    CRITICAL: 'var(--rq-red)',
    HIGH: 'var(--rq-red)',
    MEDIUM: 'var(--rq-amber)',
    LOW: 'var(--rq-ink-3)',
  };
  return map[sev];
}

function sevBg(sev: Severity): string {
  const map: Record<Severity, string> = {
    CRITICAL: 'rgba(255,92,92,.12)',
    HIGH: 'rgba(255,92,92,.08)',
    MEDIUM: 'rgba(245,177,61,.08)',
    LOW: 'rgba(107,117,133,.08)',
  };
  return map[sev];
}

function DItem({ label, value }: { label: string; value: string }) {
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
        {value}
      </div>
    </div>
  );
}
