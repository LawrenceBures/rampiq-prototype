'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  useCrewAssignments,
  fetchTeams,
  fetchTeamMembers,
  fetchZones,
  createCrewAssignment,
  completeCrewAssignment,
  cancelCrewAssignment,
  computeAssignmentOutcome,
  computeAssignmentPressure,
  computeSuggestion,
  reassignCrew,
  useLiveEvents,
} from '@/lib/store';
import { getIdentity } from '@/lib/identity';
import {
  eventAge, durationLabel,
} from '@/lib/rampiq-types';
import type {
  ShiftWindow, Team, Zone, CrewAssignment,
  AssignmentOutcome, AssignmentPressure, OperationalSuggestion,
} from '@/lib/rampiq-types';

export default function OperationalAssignmentsPage() {
  const [shift, setShift] = useState<ShiftWindow>('AM');
  const { assignments, loading, refresh } = useCrewAssignments(shift);
  const { events } = useLiveEvents(5000);
  const [teams, setTeams] = useState<Team[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const identity = typeof window !== 'undefined' ? getIdentity() : null;
  const currentUserId = identity?.user_id ?? 'CC01';
  const [outcomes, setOutcomes] = useState<Map<string, AssignmentOutcome>>(new Map());
  const [suggestion, setSuggestion] = useState<OperationalSuggestion | null>(null);

  // Form state
  const [formTeam, setFormTeam] = useState('');
  const [formZone, setFormZone] = useState('');
  const [formGates, setFormGates] = useState<string[]>([]);
  const [formEquipment, setFormEquipment] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formOverride, setFormOverride] = useState(false);
  const [formOverrideReason, setFormOverrideReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  useEffect(() => {
    fetchTeams('LAX').then(setTeams);
    fetchZones('LAX').then(setZones);
  }, []);

  // Compute outcomes for completed assignments
  useEffect(() => {
    const completed = assignments.filter(a => a.status === 'COMPLETE');
    if (completed.length === 0) return;
    Promise.all(completed.map(a => computeAssignmentOutcome(a))).then(results => {
      const map = new Map<string, AssignmentOutcome>();
      results.forEach(r => map.set(r.assignment_id, r));
      setOutcomes(map);
    });
  }, [assignments]);

  // Compute suggestion when zone is selected
  useEffect(() => {
    if (!formZone) { setSuggestion(null); return; }
    computeSuggestion(formZone, shift, events).then(setSuggestion);
  }, [formZone, shift, events]);

  // Update available gates when zone changes
  const selectedZone = zones.find(z => z.id === formZone);
  useEffect(() => {
    if (selectedZone) setFormGates(selectedZone.gate_ids);
    else setFormGates([]);
  }, [formZone]);

  // KPIs
  const active = assignments.filter(a => !['COMPLETE', 'CANCELLED'].includes(a.status));
  const completed = assignments.filter(a => a.status === 'COMPLETE');
  const overrides = assignments.filter(a => a.override_used).length;
  const openEvents = events.filter(e => e.operational_status !== 'RESOLVED' && e.operational_status !== 'CANCELLED');

  // Compute pressure for active assignments
  const pressureMap = new Map<string, AssignmentPressure>();
  active.forEach(a => {
    pressureMap.set(a.id, computeAssignmentPressure(a, events));
  });

  async function handleCreate() {
    if (!formTeam || !formZone) return;
    setSubmitting(true);

    const members = await fetchTeamMembers(formTeam);
    const userIds = members.map(m => m.user_id);
    const equipIds = formEquipment.trim() ? formEquipment.split(',').map(s => s.trim()).filter(Boolean) : [];

    const isOverride = formOverride && suggestion && formTeam !== suggestion.suggested_team_id;

    await createCrewAssignment({
      team_id: formTeam,
      assigned_user_ids: userIds,
      zone_id: formZone,
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

    setFormTeam('');
    setFormZone('');
    setFormGates([]);
    setFormEquipment('');
    setFormNotes('');
    setFormOverride(false);
    setFormOverrideReason('');
    setSubmitting(false);
    setSuggestion(null);
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
        <div className="rq-gate-id" style={{ fontSize: 20 }}>Operational Assignments</div>
        <div className="rq-gate-meta">
          LAX &middot; <b>Coordination</b> &middot; Decision Trail
        </div>
      </div>

      {/* Shift filter */}
      <div className="rq-filters">
        {(['AM', 'PM', 'OVERNIGHT'] as ShiftWindow[]).map(s => (
          <button key={s} className={`rq-chip${shift === s ? ' active' : ''}`}
            onClick={() => setShift(s)}>
            {s}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="rq-kpis rq-kpis-4">
        <div className="rq-kpi">
          <div className="rq-kpi-lbl">Active</div>
          <div className={`rq-kpi-val${active.length > 0 ? ' rq-v-g' : ''}`}>{active.length}</div>
        </div>
        <div className="rq-kpi">
          <div className="rq-kpi-lbl">Overrides</div>
          <div className={`rq-kpi-val${overrides > 0 ? ' rq-v-a' : ''}`}>{overrides}</div>
        </div>
        <div className="rq-kpi">
          <div className="rq-kpi-lbl">Completed</div>
          <div className="rq-kpi-val">{completed.length}</div>
        </div>
        <div className="rq-kpi">
          <div className="rq-kpi-lbl">Open Events</div>
          <div className={`rq-kpi-val${openEvents.length > 0 ? ' rq-v-r' : ''}`}>{openEvents.length}</div>
        </div>
      </div>

      {/* Active Assignments with Pressure */}
      <div className="rq-eyebrow">Active Assignments</div>
      {loading && <div className="rq-quiet">Loading...</div>}
      {!loading && active.length === 0 && (
        <div className="rq-quiet">No active assignments for {shift} shift</div>
      )}
      {active.map(a => {
        const pressure = pressureMap.get(a.id);
        return (
          <ActiveAssignmentCard key={a.id} a={a} pressure={pressure || null}
            actionId={actionId}
            onComplete={() => handleComplete(a.id)}
            onCancel={() => handleCancel(a.id)} />
        );
      })}

      {/* New Assignment Form */}
      <div className="rq-eyebrow">New Assignment</div>

      {/* Suggestion display */}
      {suggestion && formZone && (
        <div className="rq-suggestion">
          <div className="rq-suggestion-label">Suggested because</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700 }}>
              {suggestion.suggested_team_label}
            </span>
          </div>
          <div className="rq-suggestion-reasons">
            {suggestion.reasons.join(' · ')}
          </div>
          {/* Factor breakdown */}
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            {Object.entries(suggestion.confidence_factors).map(([key, val]) => (
              <span key={key} style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 8,
                padding: '1px 4px', border: '1px solid var(--rq-line)',
                color: val >= 75 ? 'var(--rq-green)' : val >= 50 ? 'var(--rq-amber)' : 'var(--rq-ink-3)',
              }}>
                {key.replace(/_/g, ' ')} {val}%
              </span>
            ))}
          </div>
          <button className="rq-btn-secondary" style={{ marginTop: 8, padding: '8px', fontSize: 9 }}
            onClick={() => { setFormTeam(suggestion.suggested_team_id); setFormOverride(false); }}>
            Accept Suggestion
          </button>
        </div>
      )}

      <div style={{ padding: '0 16px 14px' }}>
        <div className="rq-field" style={{ padding: 0, marginBottom: 10 }}>
          <label className="rq-label">Team</label>
          <select className="rq-select" value={formTeam} onChange={e => {
            setFormTeam(e.target.value);
            if (suggestion && e.target.value !== suggestion.suggested_team_id) {
              setFormOverride(true);
            } else {
              setFormOverride(false);
            }
          }}>
            <option value="">Select team...</option>
            {teams.map(t => (
              <option key={t.id} value={t.id}>
                {t.label} ({t.shift})
                {suggestion && t.id === suggestion.suggested_team_id ? ' — suggested' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="rq-field" style={{ padding: 0, marginBottom: 10 }}>
          <label className="rq-label">Zone</label>
          <select className="rq-select" value={formZone} onChange={e => setFormZone(e.target.value)}>
            <option value="">Select zone...</option>
            {zones.map(z => (
              <option key={z.id} value={z.id}>{z.label} ({z.gate_ids.join(', ') || 'no gates'})</option>
            ))}
          </select>
        </div>

        {selectedZone && selectedZone.gate_ids.length > 0 && (
          <div className="rq-field" style={{ padding: 0, marginBottom: 10 }}>
            <label className="rq-label">Gates</label>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {selectedZone.gate_ids.map(g => {
                const selected = formGates.includes(g);
                return (
                  <button key={g} className={`rq-chip${selected ? ' active' : ''}`}
                    onClick={() => setFormGates(prev =>
                      selected ? prev.filter(x => x !== g) : [...prev, g]
                    )}>
                    {g}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="rq-field" style={{ padding: 0, marginBottom: 10 }}>
          <label className="rq-label">Equipment IDs (comma-separated)</label>
          <input className="rq-select" value={formEquipment}
            onChange={e => setFormEquipment(e.target.value)}
            placeholder="TUG-042, BELT-007" />
        </div>

        <div className="rq-field" style={{ padding: 0, marginBottom: 10 }}>
          <label className="rq-label">Notes</label>
          <textarea className="rq-textarea" value={formNotes}
            onChange={e => setFormNotes(e.target.value)}
            placeholder="Assignment context..." style={{ minHeight: 50 }} />
        </div>

        {/* Override controls — auto-activated when choosing a different team than suggested */}
        {formOverride && suggestion && formTeam && formTeam !== suggestion.suggested_team_id && (
          <div style={{
            padding: '10px', border: '1px solid var(--rq-amber-dim)',
            background: 'rgba(245,177,61,.03)', marginBottom: 10,
          }}>
            <div className="rq-override-tag" style={{ marginBottom: 6 }}>
              Override — different from suggestion
            </div>
            <label className="rq-label">Override reason</label>
            <textarea className="rq-textarea" value={formOverrideReason}
              onChange={e => setFormOverrideReason(e.target.value)}
              placeholder="Why are you choosing a different team?"
              style={{ minHeight: 40 }} />
          </div>
        )}

        <button className="rq-btn-primary" onClick={handleCreate}
          disabled={submitting || !formTeam || !formZone}
          style={{ fontSize: 12 }}>
          {submitting ? 'Assigning...' : 'Create Assignment'}
        </button>
      </div>

      {/* Completed Assignments with Outcomes */}
      {completed.length > 0 && (
        <>
          <div className="rq-eyebrow">Completed Assignments</div>
          {completed.map(a => {
            const outcome = outcomes.get(a.id);
            return (
              <div key={a.id} className="rq-assign-card status-completed">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700 }}>
                    {a.team_label || a.team_id}
                  </span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--rq-ink-3)', marginLeft: 'auto' }}>
                    {a.zone_label || a.zone_id}
                  </span>
                </div>
                {a.override_used && (
                  <span className="rq-override-tag" style={{ marginTop: 4 }}>
                    Override: {a.override_reason || 'no reason given'}
                  </span>
                )}
                {outcome && (
                  <div className="rq-kpis rq-kpis-4" style={{ margin: '8px 0 0', border: '1px solid var(--rq-line)' }}>
                    <div className="rq-kpi" style={{ padding: '6px 4px' }}>
                      <div className="rq-kpi-lbl" style={{ fontSize: 7 }}>Events</div>
                      <div className="rq-kpi-val" style={{ fontSize: 13 }}>{outcome.events_during}</div>
                    </div>
                    <div className="rq-kpi" style={{ padding: '6px 4px' }}>
                      <div className="rq-kpi-lbl" style={{ fontSize: 7 }}>Recovery</div>
                      <div className="rq-kpi-val" style={{ fontSize: 13 }}>{durationLabel(outcome.avg_resolution_seconds)}</div>
                    </div>
                    <div className="rq-kpi" style={{ padding: '6px 4px' }}>
                      <div className="rq-kpi-lbl" style={{ fontSize: 7 }}>High Sev</div>
                      <div className="rq-kpi-val" style={{ fontSize: 13 }}>{outcome.high_severity_count}</div>
                    </div>
                    <div className="rq-kpi" style={{ padding: '6px 4px' }}>
                      <div className="rq-kpi-lbl" style={{ fontSize: 7 }}>Resolved</div>
                      <div className="rq-kpi-val" style={{ fontSize: 13 }}>{outcome.resolved_count}</div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      <div style={{ height: 20 }} />
      <div className="rq-quiet">RampIQ &middot; Operational Decision Trail</div>
    </div>
  );
}

// ============================================================
// Active Assignment Card with Pressure
// ============================================================

function ActiveAssignmentCard({ a, pressure, actionId, onComplete, onCancel }: {
  a: CrewAssignment;
  pressure: AssignmentPressure | null;
  actionId: string | null;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const isActing = actionId === a.id;

  return (
    <div className={`rq-assign-card${a.override_used ? ' has-override' : ''}`}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700 }}>
          {a.team_label || a.team_id}
        </span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--rq-ink-3)' }}>
          {a.zone_label || a.zone_id}
        </span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--rq-ink-3)', marginLeft: 'auto' }}>
          {eventAge(a.created_at)}
        </span>
      </div>

      {/* Pressure bar */}
      {pressure && (
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
            <div className="rq-pressure-lbl">Crit/High</div>
          </div>
          <div className="rq-pressure-cell">
            <div className="rq-pressure-val">{pressure.oldest_unresolved_age || '--'}</div>
            <div className="rq-pressure-lbl">Oldest</div>
          </div>
          <div className="rq-pressure-cell">
            <div className="rq-pressure-val">{pressure.time_since_assignment}</div>
            <div className="rq-pressure-lbl">Assigned</div>
          </div>
        </div>
      )}

      {/* Crew + gates + equipment chips */}
      <div className="rq-assign-chips">
        {a.assigned_user_ids.map(uid => (
          <span className="rq-assign-chip" key={uid}>{uid}</span>
        ))}
      </div>
      {a.gate_ids.length > 0 && (
        <div className="rq-assign-chips">
          {a.gate_ids.map(g => (
            <span className="rq-assign-chip" key={g}>{g}</span>
          ))}
        </div>
      )}
      {a.equipment_ids.length > 0 && (
        <div className="rq-assign-chips">
          {a.equipment_ids.map(eq => (
            <span className="rq-assign-chip" key={eq}>{eq}</span>
          ))}
        </div>
      )}

      {/* Attribution */}
      <div style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'var(--rq-ink-3)',
        marginTop: 6,
      }}>
        Assigned by {a.assigned_by_name || a.assigned_by} &middot; {a.shift_window}
      </div>

      {/* Recommendation / Override */}
      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        {a.recommendation_reason && (
          <span className="rq-rec-tag">Suggested: {a.recommendation_reason}</span>
        )}
        {a.override_used && (
          <span className="rq-override-tag">Override: {a.override_reason || 'no reason given'}</span>
        )}
      </div>

      {a.notes && (
        <div style={{ fontSize: 12, color: 'var(--rq-ink-2)', marginTop: 6, lineHeight: 1.4 }}>
          {a.notes}
        </div>
      )}

      {/* Actions */}
      <div className="rq-quick-actions" style={{ marginTop: 8 }}>
        <button className="rq-qbtn qb-resolve" disabled={isActing} onClick={onComplete}>
          {isActing ? '...' : 'Complete'}
        </button>
        <button className="rq-qbtn" disabled={isActing} onClick={onCancel}
          style={{ borderColor: 'var(--rq-red-dim)', color: 'var(--rq-red)' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
