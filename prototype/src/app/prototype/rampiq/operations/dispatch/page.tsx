'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  useCrewAssignments,
  useLiveEvents,
  fetchTeams,
  fetchTeamMembers,
  fetchZones,
  createCrewAssignment,
  completeCrewAssignment,
  cancelCrewAssignment,
  computeAssignmentPressure,
  computeSuggestion,
} from '@/lib/store';
import { getIdentity } from '@/lib/identity';
import {
  eventAge, durationLabel,
  ASSIGNMENT_STATUS_LABELS,
} from '@/lib/rampiq-types';
import type {
  ShiftWindow, Team, Zone, CrewAssignment,
  AssignmentPressure, OperationalSuggestion,
  AgentIdentity,
} from '@/lib/rampiq-types';

const GATES = [
  { id: '52A', nato: 'Alpha' },
  { id: '52B', nato: 'Bravo' },
  { id: '52C', nato: 'Charlie' },
  { id: '52D', nato: 'Delta' },
  { id: '52E', nato: 'Echo' },
  { id: '52F', nato: 'Foxtrot' },
  { id: '52G', nato: 'Golf' },
  { id: '52H', nato: 'Hotel' },
  { id: '52I', nato: 'India' },
];

function statusColor(status: string): string {
  switch (status) {
    case 'ASSIGNED': return 'var(--rq-amber)';
    case 'ACKNOWLEDGED': return 'var(--rq-blue)';
    case 'EN_ROUTE': return 'var(--rq-blue)';
    case 'IN_PROGRESS': return 'var(--rq-accent)';
    case 'COMPLETE': return 'var(--rq-green)';
    case 'ISSUE_REPORTED': return 'var(--rq-red)';
    default: return 'var(--rq-ink-4)';
  }
}

export default function DispatchBoard() {
  const [shift, setShift] = useState<ShiftWindow>('AM');
  const { assignments, loading, refresh } = useCrewAssignments(shift);
  const { events } = useLiveEvents(3000);
  const [teams, setTeams] = useState<Team[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [identity, setId] = useState<AgentIdentity | null>(null);

  // New assignment form
  const [showForm, setShowForm] = useState(false);
  const [formTeam, setFormTeam] = useState('');
  const [formGates, setFormGates] = useState<string[]>([]);
  const [formEquipment, setFormEquipment] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formOverride, setFormOverride] = useState(false);
  const [formOverrideReason, setFormOverrideReason] = useState('');
  const [suggestion, setSuggestion] = useState<OperationalSuggestion | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  useEffect(() => {
    setId(getIdentity());
    fetchTeams('LAX').then(setTeams);
    fetchZones('LAX').then(setZones);
  }, []);

  const currentUserId = identity?.user_id ?? 'CC01';

  // Map: gateId → assignment
  const gateAssignments = new Map<string, CrewAssignment>();
  assignments.forEach(a => {
    a.gate_ids.forEach(g => {
      if (!gateAssignments.has(g) || a.created_at > (gateAssignments.get(g)?.created_at ?? '')) {
        gateAssignments.set(g, a);
      }
    });
  });

  // Compute pressure per assignment
  const pressureMap = new Map<string, AssignmentPressure>();
  assignments.forEach(a => {
    if (a.status !== 'COMPLETE' && a.status !== 'CANCELLED') {
      pressureMap.set(a.id, computeAssignmentPressure(a, events));
    }
  });

  // KPIs
  const activeCount = assignments.filter(a => !['COMPLETE', 'CANCELLED'].includes(a.status)).length;
  const acknowledgedCount = assignments.filter(a => a.status === 'ACKNOWLEDGED' || a.status === 'EN_ROUTE' || a.status === 'IN_PROGRESS').length;
  const issueCount = assignments.filter(a => a.status === 'ISSUE_REPORTED').length;
  const openEvents = events.filter(e => e.operational_status !== 'RESOLVED' && e.operational_status !== 'CANCELLED');

  // Suggestion
  useEffect(() => {
    if (!showForm || formGates.length === 0) { setSuggestion(null); return; }
    // Find zone for selected gates
    const zone = zones.find(z => formGates.some(g => z.gate_ids.includes(g)));
    if (zone) {
      computeSuggestion(zone.id, shift, events).then(setSuggestion);
    }
  }, [showForm, formGates, shift, events, zones]);

  async function handleCreate() {
    if (!formTeam || formGates.length === 0) return;
    setSubmitting(true);

    const members = await fetchTeamMembers(formTeam);
    const userIds = members.map(m => m.user_id);
    const equipIds = formEquipment.trim() ? formEquipment.split(',').map(s => s.trim()).filter(Boolean) : [];
    const zone = zones.find(z => formGates.some(g => z.gate_ids.includes(g)));
    const isOverride = formOverride && suggestion && formTeam !== suggestion.suggested_team_id;

    await createCrewAssignment({
      team_id: formTeam,
      assigned_user_ids: userIds,
      zone_id: zone?.id,
      gate_ids: formGates,
      equipment_ids: equipIds,
      assigned_by: currentUserId,
      shift_window: shift,
      recommended_team_id: suggestion?.suggested_team_id,
      recommendation_reason: suggestion?.reasons.join(' · '),
      override_used: isOverride || false,
      override_reason: isOverride ? formOverrideReason : undefined,
      override_by: isOverride ? currentUserId : undefined,
      notes: formNotes || undefined,
    });

    setFormTeam(''); setFormGates([]); setFormEquipment(''); setFormNotes('');
    setFormOverride(false); setFormOverrideReason('');
    setShowForm(false); setSuggestion(null);
    setSubmitting(false);
    refresh();
  }

  async function handleComplete(id: string) {
    setActionId(id);
    await completeCrewAssignment(id, currentUserId);
    setActionId(null);
    refresh();
  }

  async function handleCancel(id: string) {
    setActionId(id);
    await cancelCrewAssignment(id);
    setActionId(null);
    refresh();
  }

  return (
    <div className="rq-ops-board">
      <Link href="/prototype/rampiq" className="rq-back">&larr; Back</Link>

      <div className="rq-gate-header">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div className="rq-gate-id" style={{ fontSize: 20 }}>Dispatch</div>
          <div className="rq-pulse" />
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'var(--rq-ink-3)', letterSpacing: '.12em', textTransform: 'uppercase' as const }}>
            LIVE
          </span>
        </div>
        <div className="rq-gate-meta">
          LAX Eagle &middot; <b>Crew Chief</b> &middot; {identity?.display_name || '...'}
        </div>
      </div>

      {/* Shift filter */}
      <div className="rq-filters">
        {(['AM', 'PM', 'OVERNIGHT'] as ShiftWindow[]).map(s => (
          <button key={s} className={`rq-chip${shift === s ? ' active' : ''}`} onClick={() => setShift(s)}>{s}</button>
        ))}
        <button className={`rq-chip${showForm ? ' active' : ''}`}
          onClick={() => setShowForm(!showForm)}
          style={{ marginLeft: 'auto', borderColor: 'var(--rq-accent)', color: showForm ? 'var(--rq-bg)' : 'var(--rq-accent)', background: showForm ? 'var(--rq-accent)' : 'transparent' }}>
          + Assign
        </button>
      </div>

      {/* KPIs */}
      <div className="rq-kpis rq-kpis-4">
        <div className="rq-kpi">
          <div className="rq-kpi-lbl">Active</div>
          <div className={`rq-kpi-val${activeCount > 0 ? ' rq-v-g' : ''}`}>{activeCount}</div>
        </div>
        <div className="rq-kpi">
          <div className="rq-kpi-lbl">Working</div>
          <div className="rq-kpi-val">{acknowledgedCount}</div>
        </div>
        <div className="rq-kpi">
          <div className="rq-kpi-lbl">Issues</div>
          <div className={`rq-kpi-val${issueCount > 0 ? ' rq-v-r' : ''}`}>{issueCount}</div>
        </div>
        <div className="rq-kpi">
          <div className="rq-kpi-lbl">Open Events</div>
          <div className={`rq-kpi-val${openEvents.length > 0 ? ' rq-v-a' : ''}`}>{openEvents.length}</div>
        </div>
      </div>

      {/* New Assignment Form (collapsed by default) */}
      {showForm && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--rq-line)', background: 'var(--rq-bg-1)' }}>
          <div className="rq-eyebrow" style={{ padding: '0 0 8px' }}>New Assignment</div>

          {suggestion && (
            <div className="rq-suggestion" style={{ margin: '0 0 10px' }}>
              <div className="rq-suggestion-label">Suggested because</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                {suggestion.suggested_team_label}
              </div>
              <div className="rq-suggestion-reasons">{suggestion.reasons.join(' · ')}</div>
              <button className="rq-btn-secondary" style={{ marginTop: 6, padding: '6px 10px', fontSize: 9 }}
                onClick={() => { setFormTeam(suggestion.suggested_team_id); setFormOverride(false); }}>
                Accept
              </button>
            </div>
          )}

          <select className="rq-select" value={formTeam} onChange={e => {
            setFormTeam(e.target.value);
            setFormOverride(suggestion ? e.target.value !== suggestion.suggested_team_id : false);
          }} style={{ marginBottom: 8 }}>
            <option value="">Team...</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.label} ({t.shift})</option>)}
          </select>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginBottom: 8 }}>
            {GATES.map(g => (
              <button key={g.id} className={`rq-chip${formGates.includes(g.id) ? ' active' : ''}`}
                onClick={() => setFormGates(prev => prev.includes(g.id) ? prev.filter(x => x !== g.id) : [...prev, g.id])}>
                {g.id}
              </button>
            ))}
          </div>

          <input className="rq-select" value={formEquipment} onChange={e => setFormEquipment(e.target.value)}
            placeholder="Equipment: TUG-042, BELT-007" style={{ marginBottom: 8 }} />
          <textarea className="rq-textarea" value={formNotes} onChange={e => setFormNotes(e.target.value)}
            placeholder="Notes..." style={{ minHeight: 40, marginBottom: 8 }} />

          {formOverride && suggestion && formTeam !== suggestion?.suggested_team_id && (
            <div style={{ padding: 8, border: '1px solid var(--rq-amber-dim)', background: 'rgba(245,177,61,.03)', marginBottom: 8 }}>
              <span className="rq-override-tag" style={{ marginBottom: 4, display: 'block' }}>Override</span>
              <textarea className="rq-textarea" value={formOverrideReason} onChange={e => setFormOverrideReason(e.target.value)}
                placeholder="Override reason..." style={{ minHeight: 30 }} />
            </div>
          )}

          <button className="rq-btn-primary" onClick={handleCreate}
            disabled={submitting || !formTeam || formGates.length === 0} style={{ fontSize: 11 }}>
            {submitting ? 'Dispatching...' : 'Dispatch'}
          </button>
        </div>
      )}

      {/* Gate Cards */}
      <div className="rq-eyebrow">Gates</div>
      {loading && <div className="rq-quiet">Loading...</div>}

      {GATES.map(gate => {
        const assignment = gateAssignments.get(gate.id);
        const pressure = assignment ? pressureMap.get(assignment.id) : null;
        const isActing = assignment && actionId === assignment.id;

        return (
          <div key={gate.id} className="rq-assign-card" style={{
            borderLeftColor: assignment ? statusColor(assignment.status) : 'var(--rq-ink-4)',
          }}>
            {/* Gate header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700 }}>
                {gate.id}
              </span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--rq-ink-3)' }}>
                {gate.nato}
              </span>
              {assignment && (
                <span style={{
                  marginLeft: 'auto',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 8,
                  padding: '2px 6px', letterSpacing: '.08em', textTransform: 'uppercase' as const,
                  border: `1px solid ${statusColor(assignment.status)}`,
                  color: statusColor(assignment.status),
                }}>
                  {ASSIGNMENT_STATUS_LABELS[assignment.status] || assignment.status}
                </span>
              )}
              {!assignment && (
                <span style={{
                  marginLeft: 'auto',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 8,
                  padding: '2px 6px', color: 'var(--rq-ink-4)',
                  border: '1px solid var(--rq-line)', letterSpacing: '.08em', textTransform: 'uppercase' as const,
                }}>
                  Unassigned
                </span>
              )}
            </div>

            {/* Assignment details */}
            {assignment && (
              <>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                  color: 'var(--rq-ink-3)', marginTop: 4,
                }}>
                  {assignment.team_label} &middot; {assignment.assigned_user_ids.join(', ')} &middot; {eventAge(assignment.created_at)}
                </div>

                {/* Pressure */}
                {pressure && (pressure.open_events > 0 || pressure.critical_high_count > 0) && (
                  <div className="rq-pressure-bar">
                    <div className="rq-pressure-cell">
                      <div className="rq-pressure-val" style={{ color: pressure.open_events > 0 ? 'var(--rq-amber)' : 'var(--rq-ink-4)' }}>
                        {pressure.open_events}
                      </div>
                      <div className="rq-pressure-lbl">Open</div>
                    </div>
                    <div className="rq-pressure-cell">
                      <div className="rq-pressure-val" style={{ color: pressure.critical_high_count > 0 ? 'var(--rq-red)' : 'var(--rq-ink-4)' }}>
                        {pressure.critical_high_count}
                      </div>
                      <div className="rq-pressure-lbl">Crit</div>
                    </div>
                    <div className="rq-pressure-cell">
                      <div className="rq-pressure-val">{pressure.oldest_unresolved_age || '--'}</div>
                      <div className="rq-pressure-lbl">Oldest</div>
                    </div>
                    <div className="rq-pressure-cell">
                      <div className="rq-pressure-val">{pressure.time_since_assignment}</div>
                      <div className="rq-pressure-lbl">Since</div>
                    </div>
                  </div>
                )}

                {/* Override indicator */}
                {assignment.override_used && (
                  <span className="rq-override-tag" style={{ marginTop: 4 }}>
                    Override: {assignment.override_reason || '—'}
                  </span>
                )}

                {/* Actions */}
                <div className="rq-quick-actions" style={{ marginTop: 6 }}>
                  <button className="rq-qbtn qb-resolve" disabled={!!isActing}
                    onClick={() => handleComplete(assignment.id)}>
                    {isActing ? '...' : 'Complete'}
                  </button>
                  <button className="rq-qbtn" disabled={!!isActing}
                    onClick={() => handleCancel(assignment.id)}
                    style={{ borderColor: 'var(--rq-red-dim)', color: 'var(--rq-red)' }}>
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}

      <div style={{ height: 20 }} />
      <div className="rq-quiet">SOI &middot; Crew Chief Dispatch</div>
    </div>
  );
}
