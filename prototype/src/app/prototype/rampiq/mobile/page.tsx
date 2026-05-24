'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { AgentIdentity, ShiftWindow, RoleType, CrewAssignment } from '@/lib/rampiq-types';
import { ASSIGNMENT_STATUS_LABELS, eventAge } from '@/lib/rampiq-types';

export default function AgentMobile() {
  const [identity, setId] = useState<AgentIdentity | null>(null);
  const [users, setUsers] = useState<{ id: string; display_name: string | null; role_type: string; default_shift: string | null; station: string }[]>([]);
  const [tasks, setTasks] = useState<CrewAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);
  const [queueDepth, setQueueDepth] = useState(0);
  const [acknowledging, setAcknowledging] = useState<string | null>(null);

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

        <div className="rq-quiet">RampIQ &middot; Eagle Operations</div>
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
                  <Link href={`/prototype/rampiq/mobile/gate/${task.gate_ids[0]}?target=LAX-GATE-${task.gate_ids[0]}`}
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

      <Link href="/prototype/rampiq/mobile/scan" className="rq-module" style={{ margin: '0 16px 8px' }}>
        <div className="rq-module-icon" style={{ width: 36, height: 36, fontSize: 12 }}>QR</div>
        <div>
          <div className="rq-module-name" style={{ fontSize: 13 }}>Scan Gate / Equipment</div>
          <div className="rq-module-desc">Readiness check &middot; equipment signal &middot; LT arrival</div>
        </div>
        <span className="rq-module-arrow">&rsaquo;</span>
      </Link>

      {/* Offline queue */}
      {queueDepth > 0 && (
        <Link href="/prototype/rampiq/mobile/queue" className="rq-module" style={{ margin: '0 16px 8px' }}>
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

      <div className="rq-quiet">RampIQ &middot; Eagle Operations</div>
    </>
  );
}
