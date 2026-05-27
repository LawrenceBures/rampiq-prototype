'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  useFlights,
  useCrewAssignments,
  useLiveEvents,
  computeAssignmentPressure,
} from '@/lib/store';
import { getIdentity } from '@/lib/identity';
import {
  eventAge,
  ASSIGNMENT_STATUS_LABELS,
  ROLE_LABELS,
} from '@/lib/soi-types';
import type {
  Flight, ShiftWindow, CrewAssignment, SoiEvent,
  AssignmentPressure, AgentIdentity, UserLite,
} from '@/lib/soi-types';

// ============================================================
// HELPERS
// ============================================================

function fmtTime(iso: string | null): string {
  if (!iso) return '--:--';
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch { return '--:--'; }
}

function minutesUntil(iso: string | null): number {
  if (!iso) return 9999;
  return Math.floor((new Date(iso).getTime() - Date.now()) / 60000);
}

function turnMinutes(flight: Flight): number {
  if (!flight.arrival_time || !flight.departure_time) return 0;
  return Math.floor((new Date(flight.departure_time).getTime() - new Date(flight.arrival_time).getTime()) / 60000);
}

function timeWindow(flight: Flight): 'now' | 'next30' | 'next60' | 'next120' | 'later' {
  const mins = minutesUntil(flight.arrival_time);
  if (mins <= 0) return 'now';
  if (mins <= 30) return 'next30';
  if (mins <= 60) return 'next60';
  if (mins <= 120) return 'next120';
  return 'later';
}

const WINDOW_LABELS: Record<string, string> = {
  now: 'On Gate / Arrived',
  next30: 'Next 30 min',
  next60: '30–60 min',
  next120: '60–120 min',
  later: '2+ hours',
};

function statusColor(status: string): string {
  switch (status) {
    case 'ON_GATE': return 'var(--rq-accent)';
    case 'BOARDING': return 'var(--rq-amber)';
    case 'INBOUND': return 'var(--rq-blue)';
    case 'DEPARTED': return 'var(--rq-ink-4)';
    default: return 'var(--rq-ink-3)';
  }
}

function assignStatusColor(status: string | undefined): string {
  if (!status) return 'var(--rq-ink-4)';
  switch (status) {
    case 'ASSIGNED': return 'var(--rq-amber)';
    case 'ACKNOWLEDGED': case 'EN_ROUTE': return 'var(--rq-blue)';
    case 'IN_PROGRESS': return 'var(--rq-accent)';
    case 'COMPLETE': return 'var(--rq-green)';
    case 'ISSUE_REPORTED': return 'var(--rq-red)';
    default: return 'var(--rq-ink-4)';
  }
}

// ============================================================
// WARNINGS
// ============================================================

interface Warning {
  level: 'info' | 'warn' | 'critical';
  message: string;
}

function computeWarnings(
  flight: Flight,
  assignment: CrewAssignment | undefined,
  pressure: AssignmentPressure | undefined,
  events: SoiEvent[],
  users: UserLite[],
): Warning[] {
  const w: Warning[] = [];
  const turn = turnMinutes(flight);

  if (!assignment) {
    w.push({ level: 'critical', message: 'No team assigned' });
  }

  if (turn > 0 && turn < 50) {
    w.push({ level: 'warn', message: `Compressed turn: ${turn} min` });
  }

  if (assignment) {
    // Check pushback cert
    const members = assignment.assigned_user_ids;
    const memberUsers = members.map(id => users.find(u => u.id === id)).filter(Boolean) as UserLite[];
    const hasPushback = memberUsers.some(u => u.pushback_certified);
    if (!hasPushback) {
      w.push({ level: 'warn', message: 'No pushback-certified agent' });
    }

    // Check LT
    const hasLT = memberUsers.some(u => u.role_type === 'LT_RUNNER');
    if (!hasLT) {
      w.push({ level: 'info', message: 'No LT assigned' });
    }

    // Check shift conflicts
    const now = new Date();
    for (const u of memberUsers) {
      if (u.shift_end) {
        const [h, m] = u.shift_end.split(':').map(Number);
        const end = new Date(now);
        end.setHours(h, m, 0, 0);
        if (flight.departure_time && new Date(flight.departure_time).getTime() > end.getTime()) {
          w.push({ level: 'warn', message: `${u.id} off-time (${u.shift_end}) before departure` });
        }
      }
    }

    // Check readiness
    if (assignment.status === 'ASSIGNED') {
      w.push({ level: 'info', message: 'Readiness not started' });
    }
  }

  // Open events at this gate
  if (pressure && pressure.open_events > 0) {
    w.push({ level: pressure.critical_high_count > 0 ? 'critical' : 'warn',
      message: `${pressure.open_events} open event(s) at gate` });
  }

  // Gate readiness events
  const gateReadiness = events.filter(e =>
    e.event_type === 'GATE_READINESS' && e.gate_id === flight.gate_id
  );
  if (gateReadiness.length === 0 && assignment && flight.status !== 'DEPARTED') {
    w.push({ level: 'info', message: 'No readiness checklist submitted' });
  }

  return w;
}

// ============================================================
// COMPONENT
// ============================================================

export default function FlightsPage() {
  const [shift, setShift] = useState<ShiftWindow>('AM');
  const { flights, loading: flightsLoading, source, error: flightsError, rawCount } = useFlights();
  const { assignments } = useCrewAssignments(shift);
  const { events } = useLiveEvents(5000);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [identity, setId] = useState<AgentIdentity | null>(null);

  useEffect(() => {
    setId(getIdentity());
    import('@/lib/store').then(({ fetchUsers }) => fetchUsers().then(setUsers));
  }, []);

  // Map gate → assignment
  const gateAssignments = new Map<string, CrewAssignment>();
  assignments.forEach(a => {
    if (['COMPLETE', 'CANCELLED'].includes(a.status)) return;
    a.gate_ids.forEach(g => {
      if (!gateAssignments.has(g) || a.created_at > (gateAssignments.get(g)?.created_at ?? '')) {
        gateAssignments.set(g, a);
      }
    });
  });

  // Compute pressure per assignment
  const pressureMap = new Map<string, AssignmentPressure>();
  assignments.forEach(a => {
    if (!['COMPLETE', 'CANCELLED'].includes(a.status)) {
      pressureMap.set(a.id, computeAssignmentPressure(a, events));
    }
  });

  // Group flights by time window
  const groups = new Map<string, Flight[]>();
  const windowOrder = ['now', 'next30', 'next60', 'next120', 'later'];
  windowOrder.forEach(w => groups.set(w, []));
  flights.forEach(f => {
    if (f.status === 'DEPARTED') return;
    const w = timeWindow(f);
    groups.get(w)?.push(f);
  });

  function toggleSelect(flightId: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(flightId)) next.delete(flightId);
      else next.add(flightId);
      return next;
    });
  }

  const selectedFlights = flights.filter(f => selected.has(f.id));
  const selectedGates = [...new Set(selectedFlights.map(f => f.gate_id).filter(Boolean))] as string[];

  return (
    <div className="rq-ops-board">
      <Link href="/prototype/soi" className="rq-back">&larr; Back</Link>

      <div className="rq-gate-header">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div className="rq-gate-id" style={{ fontSize: 20 }}>Flight Ops</div>
          <div className="rq-pulse" />
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'var(--rq-ink-3)', letterSpacing: '.12em', textTransform: 'uppercase' as const }}>
            LIVE
          </span>
        </div>
        <div className="rq-gate-meta">
          LAX Eagle &middot; <b>Crew Chief</b> &middot; {flights.filter(f => f.status !== 'DEPARTED').length} active flights
        </div>
      </div>

      {/* Shift filter */}
      <div className="rq-filters">
        {(['AM', 'PM', 'OVERNIGHT'] as ShiftWindow[]).map(s => (
          <button key={s} className={`rq-chip${shift === s ? ' active' : ''}`} onClick={() => setShift(s)}>{s}</button>
        ))}
      </div>

      {/* KPIs */}
      <div className="rq-kpis rq-kpis-4">
        <div className="rq-kpi">
          <div className="rq-kpi-lbl">Active</div>
          <div className="rq-kpi-val">{flights.filter(f => f.status !== 'DEPARTED').length}</div>
        </div>
        <div className="rq-kpi">
          <div className="rq-kpi-lbl">On Gate</div>
          <div className={`rq-kpi-val rq-v-a`}>{flights.filter(f => f.status === 'ON_GATE' || f.status === 'BOARDING').length}</div>
        </div>
        <div className="rq-kpi">
          <div className="rq-kpi-lbl">Inbound</div>
          <div className="rq-kpi-val">{flights.filter(f => f.status === 'INBOUND').length}</div>
        </div>
        <div className="rq-kpi">
          <div className="rq-kpi-lbl">Unassigned</div>
          <div className={`rq-kpi-val${flights.filter(f => f.status !== 'DEPARTED' && f.gate_id && !gateAssignments.has(f.gate_id)).length > 0 ? ' rq-v-r' : ''}`}>
            {flights.filter(f => f.status !== 'DEPARTED' && f.gate_id && !gateAssignments.has(f.gate_id)).length}
          </div>
        </div>
      </div>

      {/* Debug box */}
      <div style={{
        margin: '4px 16px', padding: '6px 10px',
        border: '1px solid var(--rq-line)',
        fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
        color: 'var(--rq-ink-4)',
      }}>
        source: <span style={{ color: source === 'supabase' ? 'var(--rq-green)' : source === 'fallback' ? 'var(--rq-amber)' : 'var(--rq-ink-3)' }}>{source}</span>
        {' '}&middot; rows: {rawCount}
        {' '}&middot; displayed: {flights.filter(f => f.status !== 'DEPARTED').length}
        {' '}&middot; shift: {shift}
        {' '}&middot; supabase: {typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SUPABASE_URL ? 'present' : 'missing'}
        {flightsError && <> &middot; <span style={{ color: 'var(--rq-red)' }}>{flightsError}</span></>}
      </div>

      {/* Selection bar */}
      {selected.size > 0 && (
        <div style={{
          padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8,
          borderBottom: '1px solid var(--rq-line)', background: 'var(--rq-bg-2)',
        }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--rq-accent)' }}>
            {selected.size} flight(s) &middot; gates {selectedGates.join(', ')}
          </span>
          <Link href={`/prototype/soi/operations/dispatch?gates=${selectedGates.join(',')}`}
            className="rq-btn-primary"
            style={{ marginLeft: 'auto', width: 'auto', padding: '8px 16px', fontSize: 10, textDecoration: 'none' }}>
            Assign Team
          </Link>
        </div>
      )}

      {/* Time-block groups */}
      {windowOrder.map(window => {
        const windowFlights = groups.get(window) || [];
        if (windowFlights.length === 0) return null;

        return (
          <div key={window}>
            <div className="rq-eyebrow" style={{
              color: window === 'now' ? 'var(--rq-accent)' : window === 'next30' ? 'var(--rq-amber)' : undefined,
            }}>
              {WINDOW_LABELS[window]}
              <b style={{ marginLeft: 6 }}>{windowFlights.length}</b>
            </div>

            {windowFlights.map(flight => {
              const assignment = flight.gate_id ? gateAssignments.get(flight.gate_id) : undefined;
              const pressure = assignment ? pressureMap.get(assignment.id) : undefined;
              const warnings = computeWarnings(flight, assignment, pressure, events, users);
              const isSelected = selected.has(flight.id);
              const turn = turnMinutes(flight);
              const critWarnings = warnings.filter(w => w.level === 'critical');
              const warnWarnings = warnings.filter(w => w.level === 'warn');

              return (
                <div key={flight.id}
                  onClick={() => toggleSelect(flight.id)}
                  style={{
                    margin: '0 16px 4px', padding: '10px 12px',
                    borderTop: `1px solid ${isSelected ? 'var(--rq-accent)' : critWarnings.length > 0 ? 'rgba(255,92,92,.3)' : 'var(--rq-line)'}`,
                    borderRight: `1px solid ${isSelected ? 'var(--rq-accent)' : critWarnings.length > 0 ? 'rgba(255,92,92,.3)' : 'var(--rq-line)'}`,
                    borderBottom: `1px solid ${isSelected ? 'var(--rq-accent)' : critWarnings.length > 0 ? 'rgba(255,92,92,.3)' : 'var(--rq-line)'}`,
                    borderLeft: `3px solid ${statusColor(flight.status)}`,
                    background: isSelected ? 'rgba(201,255,58,.04)' : critWarnings.length > 0 ? 'rgba(255,92,92,.02)' : 'var(--rq-bg-1)',
                    cursor: 'pointer', transition: 'background .12s',
                  }}>
                  {/* Row 1: flight + gate + status + times */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700 }}>
                      {flight.gate_id}
                    </span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--rq-ink-2)' }}>
                      {flight.id}
                    </span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'var(--rq-ink-3)' }}>
                      {flight.aircraft}
                    </span>
                    <span style={{
                      marginLeft: 'auto',
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 8,
                      padding: '2px 6px', letterSpacing: '.08em', textTransform: 'uppercase' as const,
                      border: `1px solid ${statusColor(flight.status)}`,
                      color: statusColor(flight.status),
                    }}>
                      {flight.status.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {/* Row 2: route + times + turn */}
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                    color: 'var(--rq-ink-3)', marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap',
                  }}>
                    <span>{flight.route}</span>
                    <span>&middot;</span>
                    <span>In {fmtTime(flight.arrival_time)}</span>
                    <span>Out {fmtTime(flight.departure_time)}</span>
                    {turn > 0 && (
                      <span style={{ color: turn < 50 ? 'var(--rq-red)' : 'var(--rq-ink-3)' }}>
                        &middot; {turn}m turn
                      </span>
                    )}
                  </div>

                  {/* Row 3: assignment info */}
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                    color: 'var(--rq-ink-3)', marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center',
                  }}>
                    {assignment ? (
                      <>
                        <span style={{
                          padding: '1px 5px',
                          border: `1px solid ${assignStatusColor(assignment.status)}`,
                          color: assignStatusColor(assignment.status),
                          fontSize: 8, letterSpacing: '.06em', textTransform: 'uppercase' as const,
                        }}>
                          {ASSIGNMENT_STATUS_LABELS[assignment.status]}
                        </span>
                        <span>{assignment.team_label || assignment.team_id}</span>
                        <span>{assignment.assigned_user_ids.join(', ')}</span>
                        {assignment.equipment_ids.length > 0 && (
                          <span style={{ color: 'var(--rq-ink-4)' }}>{assignment.equipment_ids.join(', ')}</span>
                        )}
                      </>
                    ) : (
                      <span style={{ color: 'var(--rq-red)', fontSize: 8, letterSpacing: '.06em', textTransform: 'uppercase' as const }}>
                        Unassigned
                      </span>
                    )}
                  </div>

                  {/* Warnings */}
                  {warnings.length > 0 && (
                    <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {warnings.map((w, i) => (
                        <span key={i} style={{
                          fontFamily: "'JetBrains Mono', monospace", fontSize: 8,
                          padding: '1px 5px',
                          border: `1px solid ${w.level === 'critical' ? 'var(--rq-red-dim)' : w.level === 'warn' ? 'var(--rq-amber-dim)' : 'var(--rq-line)'}`,
                          color: w.level === 'critical' ? 'var(--rq-red)' : w.level === 'warn' ? 'var(--rq-amber)' : 'var(--rq-ink-3)',
                        }}>
                          {w.message}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {flightsLoading && (
        <div className="rq-quiet" style={{ padding: '24px 16px' }}>Loading flights...</div>
      )}

      <div style={{ height: 20 }} />
      <div className="rq-quiet">SOI &middot; Flight Operations</div>
    </div>
  );
}
