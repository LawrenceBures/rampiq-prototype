'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { AgentIdentity, ShiftWindow, RoleType, CrewAssignment } from '@/lib/soi-types';
import { ASSIGNMENT_STATUS_LABELS, eventAge } from '@/lib/soi-types';
import type { Incident, RecoveryAction } from '@/lib/lifecycle-types';
import { INCIDENT_STATUS_LABELS, RECOVERY_ACTION_STATUS_LABELS } from '@/lib/operational-states';
import type { IncidentStatus, RecoveryActionStatus } from '@/lib/operational-states';

export default function AgentMobile() {
  const [identity, setId] = useState<AgentIdentity | null>(null);
  const [users, setUsers] = useState<{ id: string; display_name: string | null; role_type: string; default_shift: string | null; station: string }[]>([]);
  const [tasks, setTasks] = useState<CrewAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);
  const [queueDepth, setQueueDepth] = useState(0);
  const [acknowledging, setAcknowledging] = useState<string | null>(null);
  const [stationIncidents, setStationIncidents] = useState<Incident[]>([]);
  const [assignedActions, setAssignedActions] = useState<(RecoveryAction & { incidentTitle?: string })[]>([]);
  const [raTransitioning, setRaTransitioning] = useState<string | null>(null);

  // Load identity + users
  useEffect(() => {
    (async () => {
      const { getIdentity } = await import('@/lib/identity');
      const id = getIdentity();
      setId(id);

      const { isOnline, getQueueDepth } = await import('@/lib/offline-queue');
      setOnline(isOnline());
      try { setQueueDepth(await getQueueDepth()); } catch {}

      const { fetchUsers, fetchAgentTasks } = await import('@/lib/store');
      const u = await fetchUsers();
      setUsers(u);

      // Load tasks for this agent
      if (id) {
        const t = await fetchAgentTasks(id.user_id);
        setTasks(t);
      }

      // Load active incidents for awareness
      const { fetchActiveIncidents, fetchRecoveryActions: fetchRA } = await import('@/lib/lifecycle-commands');
      const incs = await fetchActiveIncidents('LAX');
      setStationIncidents(incs);

      // Load recovery actions assigned to this agent's role
      if (id) {
        const allActions: (RecoveryAction & { incidentTitle?: string })[] = [];
        for (const inc of incs) {
          const actions = await fetchRA(inc.id);
          for (const a of actions) {
            // Match by role_type or user_id
            if (a.assigned_to === id.role_type || a.assigned_to === id.user_id) {
              if (!['COMPLETE', 'WITHDRAWN', 'ESCALATED'].includes(a.status)) {
                allActions.push({ ...a, incidentTitle: inc.title });
              }
            }
          }
        }
        setAssignedActions(allActions);
      }

      setLoading(false);
    })();

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  async function handleSelectUser(userId: string) {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    const newIdentity: AgentIdentity = {
      user_id: user.id,
      display_name: user.display_name || user.id,
      role_type: user.role_type as RoleType,
      shift_window: (user.default_shift || 'AM') as ShiftWindow,
      device_id: `WEB-${user.id}`,
      station: user.station,
    };
    const { setIdentity } = await import('@/lib/identity');
    setIdentity(newIdentity);
    setId(newIdentity);

    // Load tasks for this user
    const { fetchAgentTasks } = await import('@/lib/store');
    const t = await fetchAgentTasks(newIdentity.user_id);
    setTasks(t);

    // Load recovery actions assigned to this agent's role
    const { fetchActiveIncidents, fetchRecoveryActions: fetchRA } = await import('@/lib/lifecycle-commands');
    const incs = await fetchActiveIncidents(newIdentity.station);
    setStationIncidents(incs);
    const allActions: (RecoveryAction & { incidentTitle?: string })[] = [];
    for (const inc of incs) {
      const actions = await fetchRA(inc.id);
      for (const a of actions) {
        if (a.assigned_to === newIdentity.role_type || a.assigned_to === newIdentity.user_id) {
          if (!['COMPLETE', 'WITHDRAWN', 'ESCALATED'].includes(a.status)) {
            allActions.push({ ...a, incidentTitle: inc.title });
          }
        }
      }
    }
    setAssignedActions(allActions);
  }

  async function handleRecoveryTransition(actionId: string, newStatus: RecoveryActionStatus) {
    setRaTransitioning(actionId);
    const { transitionRecoveryAction } = await import('@/lib/lifecycle-commands');
    await transitionRecoveryAction({
      action_id: actionId,
      new_status: newStatus,
      actor_id: identity?.user_id ?? 'MOBILE',
      actor_role: identity?.role_type ?? 'RAMP_AGENT',
    });
    // Remove from local list
    setAssignedActions(prev => prev.filter(a => a.id !== actionId));
    setRaTransitioning(null);
  }

  async function handleSignOut() {
    const { clearIdentity } = await import('@/lib/identity');
    clearIdentity();
    setId(null);
    setTasks([]);
  }

  async function handleAcknowledge(assignmentId: string) {
    if (!identity) return;
    setAcknowledging(assignmentId);
    const { acknowledgeAssignment } = await import('@/lib/store');
    await acknowledgeAssignment(assignmentId, identity.user_id);
    // Refresh tasks
    const { fetchAgentTasks } = await import('@/lib/store');
    setTasks(await fetchAgentTasks(identity.user_id));
    setAcknowledging(null);
  }

  // Identity selection
  if (!identity) {
    return (
      <>
        <div className="rq-gate-header">
          <div className="rq-gate-id" style={{ fontSize: 20 }}>Shift Start</div>
          <div className="rq-gate-meta">LAX Eagle &middot; <b>Select Identity</b></div>
        </div>

        <div className="rq-eyebrow">Who are you?</div>

        {loading && <div className="rq-quiet" style={{ padding: '16px' }}>Loading...</div>}

        <div style={{ padding: '0 16px' }}>
          {users.map(u => (
            <button key={u.id} className="rq-module"
              style={{ width: '100%', textAlign: 'left', margin: '0 0 8px', border: '1px solid var(--rq-line)', cursor: 'pointer' }}
              onClick={() => handleSelectUser(u.id)}>
              <div className="rq-module-icon" style={{ width: 36, height: 36, fontSize: 12 }}>{u.id}</div>
              <div>
                <div className="rq-module-name" style={{ fontSize: 13 }}>{u.display_name || u.id}</div>
                <div className="rq-module-desc">{u.role_type.replace(/_/g, ' ')} &middot; {u.default_shift || 'AM'}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="rq-quiet">SOI &middot; Eagle Operations</div>
      </>
    );
  }

  // Signed in — task-driven home
  return (
    <>
      <div className="rq-gate-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="rq-gate-id" style={{ fontSize: 20 }}>{identity.display_name}</div>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: online ? 'var(--rq-green)' : 'var(--rq-amber)',
            boxShadow: online ? '0 0 6px var(--rq-green)' : '0 0 6px var(--rq-amber)',
          }} />
        </div>
        <div className="rq-gate-meta">
          LAX Eagle &middot; <b>{identity.role_type.replace(/_/g, ' ')}</b> &middot; {identity.shift_window}
          {queueDepth > 0 && <> &middot; <span style={{ color: 'var(--rq-amber)' }}>{queueDepth} pending</span></>}
        </div>
      </div>

      {/* Incident awareness banner */}
      {stationIncidents.length > 0 && (
        <div style={{
          margin: '0 16px 8px', padding: '6px 10px',
          border: '1px solid var(--rq-red)', borderLeft: '3px solid var(--rq-red)',
          background: 'rgba(255,92,92,.04)',
        }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700,
            color: 'var(--rq-red)', letterSpacing: '.08em', textTransform: 'uppercase',
            marginBottom: 3,
          }}>
            {stationIncidents.length} Active Incident{stationIncidents.length !== 1 ? 's' : ''}
          </div>
          {stationIncidents.slice(0, 3).map(inc => (
            <div key={inc.id} style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              color: 'var(--rq-ink-2)', padding: '2px 0',
              display: 'flex', gap: 6, alignItems: 'center',
            }}>
              <span style={{
                color: inc.severity === 'CRITICAL' || inc.severity === 'HIGH' ? 'var(--rq-red)' : 'var(--rq-amber)',
                fontWeight: 600, fontSize: 8,
              }}>
                {inc.severity}
              </span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {inc.title}
              </span>
              <span style={{ fontSize: 9, color: 'var(--rq-ink-4)' }}>
                {inc.gate_id || ''}
              </span>
            </div>
          ))}
          {stationIncidents.length > 3 && (
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'var(--rq-ink-4)', marginTop: 2 }}>
              +{stationIncidents.length - 3} more
            </div>
          )}
        </div>
      )}

      {/* Assigned Recovery Actions */}
      {assignedActions.length > 0 && (
        <>
          <div className="rq-eyebrow">
            Assigned Actions
            <span style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
              color: 'var(--rq-accent)', fontWeight: 700, marginLeft: 8,
            }}>
              {assignedActions.length}
            </span>
          </div>
          {assignedActions.map(ra => {
            const statusColor = ra.status === 'ACTIVE' ? 'var(--rq-green)'
              : ra.status === 'ACKNOWLEDGED' ? 'var(--rq-amber)'
              : ra.status === 'BLOCKED' ? 'var(--rq-red)'
              : 'var(--rq-ink-3)';
            const transitioning = raTransitioning === ra.id;
            return (
              <div key={ra.id} style={{
                margin: '0 16px 6px', padding: '10px 12px',
                border: '1px solid var(--rq-line)',
                borderLeft: `3px solid ${statusColor}`,
                background: 'var(--rq-bg-1)',
              }}>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 600,
                  color: 'var(--rq-ink)',
                }}>
                  {ra.title}
                </div>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                  color: 'var(--rq-ink-3)', marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap',
                }}>
                  <span style={{ color: statusColor, fontWeight: 600 }}>
                    {RECOVERY_ACTION_STATUS_LABELS[ra.status]}
                  </span>
                  {ra.action_type && <span>{ra.action_type}</span>}
                  <span style={{ color: 'var(--rq-ink-4)' }}>{eventAge(ra.created_at)}</span>
                </div>
                {ra.incidentTitle && (
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                    color: 'var(--rq-ink-4)', marginTop: 2,
                  }}>
                    Incident: {ra.incidentTitle}
                  </div>
                )}
                {ra.description && (
                  <div style={{ fontSize: 12, color: 'var(--rq-ink-2)', marginTop: 4, lineHeight: 1.3 }}>
                    {ra.description}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  {ra.status === 'PROPOSED' && (
                    <button className="rq-qbtn qb-ack" disabled={transitioning}
                      style={{ flex: 1, padding: '10px', fontSize: 11 }}
                      onClick={() => handleRecoveryTransition(ra.id, 'ACKNOWLEDGED')}>
                      {transitioning ? '...' : 'Acknowledge'}
                    </button>
                  )}
                  {ra.status === 'ACKNOWLEDGED' && (
                    <button className="rq-qbtn qb-prog" disabled={transitioning}
                      style={{ flex: 1, padding: '10px', fontSize: 11 }}
                      onClick={() => handleRecoveryTransition(ra.id, 'ACTIVE')}>
                      {transitioning ? '...' : 'Start'}
                    </button>
                  )}
                  {ra.status === 'ACTIVE' && (
                    <>
                      <button className="rq-qbtn qb-resolve" disabled={transitioning}
                        style={{ flex: 1, padding: '10px', fontSize: 11 }}
                        onClick={() => handleRecoveryTransition(ra.id, 'COMPLETE')}>
                        {transitioning ? '...' : 'Complete'}
                      </button>
                      <button className="rq-qbtn qb-ack" disabled={transitioning}
                        style={{ flex: 1, padding: '10px', fontSize: 11 }}
                        onClick={() => handleRecoveryTransition(ra.id, 'BLOCKED')}>
                        {transitioning ? '...' : 'Blocked'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* Active Tasks — primary section */}
      {tasks.length > 0 && (
        <>
          <div className="rq-eyebrow">Active Tasks</div>
          {tasks.map(task => (
            <div key={task.id} className="rq-assign-card" style={{
              borderLeftColor: task.status === 'ASSIGNED' ? 'var(--rq-amber)' :
                task.status === 'ACKNOWLEDGED' ? 'var(--rq-blue)' :
                task.status === 'IN_PROGRESS' ? 'var(--rq-accent)' :
                task.status === 'ISSUE_REPORTED' ? 'var(--rq-red)' : 'var(--rq-green)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700 }}>
                  {task.gate_ids.join(', ')}
                </span>
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 8,
                  padding: '2px 6px', letterSpacing: '.08em', textTransform: 'uppercase' as const,
                  border: '1px solid var(--rq-line)',
                  color: task.status === 'ASSIGNED' ? 'var(--rq-amber)' : 'var(--rq-ink-3)',
                }}>
                  {ASSIGNMENT_STATUS_LABELS[task.status] || task.status}
                </span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'var(--rq-ink-3)', marginLeft: 'auto' }}>
                  {eventAge(task.created_at)}
                </span>
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--rq-ink-3)', marginTop: 4 }}>
                {task.team_label} &middot; {task.equipment_ids.join(', ') || 'no equipment'}
              </div>
              {task.notes && (
                <div style={{ fontSize: 12, color: 'var(--rq-ink-2)', marginTop: 4 }}>{task.notes}</div>
              )}

              {/* Actions based on status */}
              <div className="rq-quick-actions" style={{ marginTop: 8 }}>
                {task.status === 'ASSIGNED' && (
                  <button className="rq-qbtn qb-ack"
                    disabled={acknowledging === task.id}
                    onClick={() => handleAcknowledge(task.id)}>
                    {acknowledging === task.id ? '...' : 'Acknowledge'}
                  </button>
                )}
                {(task.status === 'ACKNOWLEDGED' || task.status === 'EN_ROUTE') && (
                  <Link href={`/prototype/soi/mobile/gate/${task.gate_ids[0]}?target=LAX-GATE-${task.gate_ids[0]}`}
                    className="rq-qbtn qb-prog"
                    style={{ textDecoration: 'none', textAlign: 'center' }}>
                    Go to Gate
                  </Link>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      {tasks.length === 0 && (
        <div className="rq-quiet" style={{ padding: '16px' }}>No active tasks</div>
      )}

      {/* Quick Actions */}
      <div className="rq-eyebrow">Scan</div>

      <Link href="/prototype/soi/mobile/scan" className="rq-module" style={{ margin: '0 16px 8px' }}>
        <div className="rq-module-icon" style={{ width: 36, height: 36, fontSize: 12 }}>QR</div>
        <div>
          <div className="rq-module-name" style={{ fontSize: 13 }}>Scan Gate / Equipment</div>
          <div className="rq-module-desc">Readiness check &middot; equipment signal &middot; LT arrival</div>
        </div>
        <span className="rq-module-arrow">&rsaquo;</span>
      </Link>

      {/* Offline queue */}
      {queueDepth > 0 && (
        <Link href="/prototype/soi/mobile/queue" className="rq-module" style={{ margin: '0 16px 8px' }}>
          <div className="rq-module-icon" style={{ width: 36, height: 36, fontSize: 12, borderColor: 'var(--rq-amber)', color: 'var(--rq-amber)' }}>
            {queueDepth}
          </div>
          <div>
            <div className="rq-module-name" style={{ fontSize: 13 }}>Pending Sync</div>
            <div className="rq-module-desc">Tap to retry</div>
          </div>
          <span className="rq-module-arrow">&rsaquo;</span>
        </Link>
      )}

      {/* Sign out */}
      <div style={{ padding: '16px' }}>
        <button className="rq-btn-secondary" onClick={handleSignOut} style={{ fontSize: 10 }}>
          Change Identity
        </button>
      </div>

      <div className="rq-quiet">SOI &middot; Eagle Operations</div>
    </>
  );
}
