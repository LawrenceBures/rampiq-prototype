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
  useLiveEvents,
} from '@/lib/store';
import {
  eventAge, durationLabel,
  ASSIGNMENT_STATUS_LABELS,
} from '@/lib/rampiq-types';
import type { ShiftWindow, Team, Zone, CrewAssignment, AssignmentOutcome } from '@/lib/rampiq-types';

export default function CrewAssignmentsPage() {
  const [shift, setShift] = useState<ShiftWindow>('AM');
  const { assignments, loading, refresh } = useCrewAssignments(shift);
  const { events } = useLiveEvents(5000);
  const [teams, setTeams] = useState<Team[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [outcomes, setOutcomes] = useState<Map<string, AssignmentOutcome>>(new Map());

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
    const completed = assignments.filter(a => a.status === 'COMPLETED');
    if (completed.length === 0) return;
    Promise.all(completed.map(a => computeAssignmentOutcome(a))).then(results => {
      const map = new Map<string, AssignmentOutcome>();
      results.forEach(r => map.set(r.assignment_id, r));
      setOutcomes(map);
    });
  }, [assignments]);

  // Update available gates when zone changes
  const selectedZone = zones.find(z => z.id === formZone);
  useEffect(() => {
    if (selectedZone) setFormGates(selectedZone.gate_ids);
    else setFormGates([]);
  }, [formZone]);

  // KPIs
  const active = assignments.filter(a => a.status === 'ACTIVE');
  const completed = assignments.filter(a => a.status === 'COMPLETED');
  const overridesToday = assignments.filter(a => a.override_used).length;
  const openEvents = events.filter(e => e.operational_status !== 'RESOLVED' && e.operational_status !== 'CANCELLED');

  async function handleCreate() {
    if (!formTeam || !formZone) return;
    setSubmitting(true);

    // Snapshot team members
    const members = await fetchTeamMembers(formTeam);
    const userIds = members.map(m => m.user_id);

    const equipIds = formEquipment.trim() ? formEquipment.split(',').map(s => s.trim()).filter(Boolean) : [];

    await createCrewAssignment({
      team_id: formTeam,
      assigned_user_ids: userIds,
      zone_id: formZone,
      gate_ids: formGates,
      equipment_ids: equipIds,
      assigned_by: 'CM', // TODO: use actual identity
      shift_window: shift,
      override_used: formOverride,
      override_reason: formOverride ? formOverrideReason : undefined,
      override_by: formOverride ? 'CM' : undefined,
      notes: formNotes || undefined,
    });

    // Reset form
    setFormTeam('');
    setFormZone('');
    setFormGates([]);
    setFormEquipment('');
    setFormNotes('');
    setFormOverride(false);
    setFormOverrideReason('');
    setSubmitting(false);
    refresh();
  }

  async function handleComplete(id: string) {
    setActionId(id);
    await completeCrewAssignment(id, 'CM');
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
        <div className="rq-gate-id" style={{ fontSize: 20 }}>Crew Assignments</div>
        <div className="rq-gate-meta">
          LAX &middot; <b>Crew Chief</b> &middot; Operational Decision Trail
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
          <div className={`rq-kpi-val${overridesToday > 0 ? ' rq-v-a' : ''}`}>{overridesToday}</div>
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

      {/* Active Assignments */}
      <div className="rq-eyebrow">Active Assignments</div>
      {loading && <div className="rq-quiet">Loading...</div>}
      {!loading && active.length === 0 && (
        <div className="rq-quiet">No active assignments for {shift} shift</div>
      )}
      {active.map(a => (
        <AssignmentCard key={a.id} a={a} actionId={actionId}
          onComplete={() => handleComplete(a.id)}
          onCancel={() => handleCancel(a.id)} />
      ))}

      {/* New Assignment Form */}
      <div className="rq-eyebrow">New Assignment</div>
      <div style={{ padding: '0 16px 14px' }}>
        <div className="rq-field" style={{ padding: 0, marginBottom: 10 }}>
          <label className="rq-label">Team</label>
          <select className="rq-select" value={formTeam} onChange={e => setFormTeam(e.target.value)}>
            <option value="">Select team...</option>
            {teams.map(t => (
              <option key={t.id} value={t.id}>{t.label} ({t.shift})</option>
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

        {/* Override controls */}
        <div style={{
          padding: '10px', border: '1px dashed var(--rq-line-2)', marginBottom: 10,
          background: formOverride ? 'rgba(245,177,61,.03)' : 'transparent',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
            onClick={() => setFormOverride(!formOverride)}>
            <div style={{
              width: 16, height: 16, border: `1.5px solid ${formOverride ? 'var(--rq-amber)' : 'var(--rq-ink-4)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, color: 'var(--rq-amber)',
              background: formOverride ? 'rgba(245,177,61,.08)' : 'transparent',
            }}>
              {formOverride ? '\u2713' : ''}
            </div>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--rq-ink-2)' }}>
              Override recommendation
            </span>
          </div>
          {formOverride && (
            <div style={{ marginTop: 8 }}>
              <label className="rq-label">Override reason</label>
              <textarea className="rq-textarea" value={formOverrideReason}
                onChange={e => setFormOverrideReason(e.target.value)}
                placeholder="Why are you overriding the recommendation?"
                style={{ minHeight: 40 }} />
            </div>
          )}
        </div>

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
// Assignment Card Component
// ============================================================

function AssignmentCard({ a, actionId, onComplete, onCancel }: {
  a: CrewAssignment;
  actionId: string | null;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const isActing = actionId === a.id;

  return (
    <div className={`rq-assign-card${a.override_used ? ' has-override' : ''}`}>
      {/* Header: team + zone + age */}
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

      {/* Crew members + gates + equipment */}
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

      {/* Recommendation / Override indicators */}
      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        {a.recommendation_reason && (
          <span className="rq-rec-tag">Recommended: {a.recommendation_reason}</span>
        )}
        {a.override_used && (
          <span className="rq-override-tag">Override: {a.override_reason || 'no reason given'}</span>
        )}
      </div>

      {/* Notes */}
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
