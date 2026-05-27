'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ROLE_LABELS } from '@/lib/soi-types';
import type { UserLite, ShiftStatusRecord, CrewAssignment } from '@/lib/soi-types';

type SortKey = 'name' | 'role' | 'shift_end' | 'availability' | 'workload' | 'cert';

function timeStr(t: string | null): string {
  if (!t) return '--';
  return t.substring(0, 5); // HH:MM
}

function isApproachingOff(shiftEnd: string | null): boolean {
  if (!shiftEnd) return false;
  const now = new Date();
  const [h, m] = shiftEnd.split(':').map(Number);
  const end = new Date(now);
  end.setHours(h, m, 0, 0);
  const diff = end.getTime() - now.getTime();
  return diff > 0 && diff < 3600000; // within 1 hour
}

function isOvertime(shiftEnd: string | null): boolean {
  if (!shiftEnd) return false;
  const now = new Date();
  const [h, m] = shiftEnd.split(':').map(Number);
  const end = new Date(now);
  end.setHours(h, m, 0, 0);
  return now.getTime() > end.getTime();
}

function statusColor(user: UserLite, shiftStatus: ShiftStatusRecord | undefined, assignment: CrewAssignment | undefined): string {
  if (!shiftStatus?.on_shift) return 'var(--rq-ink-4)';
  if (isOvertime(user.shift_end)) return 'var(--rq-red)';
  if (assignment) return 'var(--rq-blue)';
  if (isApproachingOff(user.shift_end)) return 'var(--rq-amber)';
  return 'var(--rq-green)';
}

function statusLabel(user: UserLite, shiftStatus: ShiftStatusRecord | undefined, assignment: CrewAssignment | undefined): string {
  if (!shiftStatus?.on_shift) return 'Off shift';
  if (isOvertime(user.shift_end)) return 'Overtime';
  if (assignment) return `Assigned: ${assignment.gate_ids.join(', ')}`;
  if (isApproachingOff(user.shift_end)) return 'Approaching off';
  return 'Available';
}

export default function WorkforcePoolPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserLite[]>([]);
  const [shiftStatuses, setShiftStatuses] = useState<ShiftStatusRecord[]>([]);
  const [assignments, setAssignments] = useState<CrewAssignment[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortKey>('availability');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { fetchUsers, fetchAllShiftStatuses, fetchCrewAssignments } = await import('@/lib/store');
      const [u, s, a] = await Promise.all([
        fetchUsers(),
        fetchAllShiftStatuses(),
        fetchCrewAssignments(),
      ]);
      setUsers(u);
      setShiftStatuses(s);
      setAssignments(a.filter(a2 => !['COMPLETE', 'CANCELLED'].includes(a2.status)));
      setLoading(false);
    })();
  }, []);

  const shiftMap = new Map(shiftStatuses.map(s => [s.user_id, s]));
  const assignMap = new Map<string, CrewAssignment>();
  assignments.forEach(a => {
    a.assigned_user_ids.forEach(uid => {
      if (!assignMap.has(uid)) assignMap.set(uid, a);
    });
  });

  // Sort
  const sorted = [...users].sort((a, b) => {
    switch (sortBy) {
      case 'name': return (a.display_name || a.id).localeCompare(b.display_name || b.id);
      case 'role': return a.role_type.localeCompare(b.role_type);
      case 'shift_end': return (a.shift_end || '99:99').localeCompare(b.shift_end || '99:99');
      case 'availability': {
        const aAvail = !assignMap.has(a.id) && shiftMap.get(a.id)?.on_shift ? 0 : 1;
        const bAvail = !assignMap.has(b.id) && shiftMap.get(b.id)?.on_shift ? 0 : 1;
        return aAvail - bAvail;
      }
      case 'cert': {
        const aCert = a.pushback_certified ? 0 : 1;
        const bCert = b.pushback_certified ? 0 : 1;
        return aCert - bCert;
      }
      default: return 0;
    }
  });

  function toggleSelect(userId: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(userId)) { next.delete(userId); }
      else if (next.size < 4) { next.add(userId); }
      return next;
    });
  }

  function handleBuildTeam() {
    const ids = Array.from(selected).join(',');
    router.push(`/prototype/soi/operations/team-builder?members=${ids}`);
  }

  return (
    <div className="rq-ops-board">
      <Link href="/prototype/soi" className="rq-back">&larr; Back</Link>

      <div className="rq-gate-header">
        <div className="rq-gate-id" style={{ fontSize: 20 }}>Workforce Pool</div>
        <div className="rq-gate-meta">
          LAX Eagle &middot; <b>Crew Chief</b> &middot; Live Labor
        </div>
      </div>

      {/* Sort controls */}
      <div className="rq-filters">
        {([
          ['availability', 'Available'],
          ['name', 'Name'],
          ['role', 'Role'],
          ['shift_end', 'Off Time'],
          ['cert', 'Pushback'],
        ] as [SortKey, string][]).map(([key, label]) => (
          <button key={key} className={`rq-chip${sortBy === key ? ' active' : ''}`}
            onClick={() => setSortBy(key)}>
            {label}
          </button>
        ))}
      </div>

      {/* Selection bar */}
      {selected.size > 0 && (
        <div style={{
          padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8,
          borderBottom: '1px solid var(--rq-line)', background: 'var(--rq-bg-2)',
        }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--rq-accent)' }}>
            {selected.size}/4 selected
          </span>
          <button className="rq-btn-primary" onClick={handleBuildTeam}
            style={{ marginLeft: 'auto', width: 'auto', padding: '8px 16px', fontSize: 10 }}>
            Build Team
          </button>
        </div>
      )}

      {/* Crew list */}
      {loading && <div className="rq-quiet">Loading workforce...</div>}

      {sorted.map(user => {
        const shift = shiftMap.get(user.id);
        const assignment = assignMap.get(user.id);
        const color = statusColor(user, shift, assignment);
        const label = statusLabel(user, shift, assignment);
        const isSelected = selected.has(user.id);

        return (
          <div key={user.id}
            onClick={() => toggleSelect(user.id)}
            style={{
              margin: '0 16px 4px', padding: '10px 12px',
              border: `1px solid ${isSelected ? 'var(--rq-accent)' : 'var(--rq-line)'}`,
              borderLeft: `3px solid ${color}`,
              background: isSelected ? 'rgba(201,255,58,.04)' : 'var(--rq-bg-1)',
              cursor: 'pointer', transition: 'background .12s',
            }}>
            {/* Row 1: name + role + status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, width: 40 }}>
                {user.id}
              </span>
              <span style={{ fontSize: 13, fontWeight: 500 }}>
                {user.display_name || user.id}
              </span>
              <span style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 8,
                padding: '2px 5px', border: `1px solid ${color}`, color,
                letterSpacing: '.06em', textTransform: 'uppercase' as const,
                marginLeft: 'auto',
              }}>
                {label}
              </span>
            </div>

            {/* Row 2: role + shift + lunch + break */}
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
              color: 'var(--rq-ink-3)', marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap',
            }}>
              <span>{ROLE_LABELS[user.role_type]}</span>
              <span>&middot;</span>
              <span>Off {timeStr(user.shift_end)}</span>
              <span>&middot;</span>
              <span>Lunch {timeStr(user.lunch_start)}–{timeStr(user.lunch_end)}</span>
              <span>&middot;</span>
              <span>Break {timeStr(user.break_start)}–{timeStr(user.break_end)}</span>
            </div>

            {/* Row 3: certs + extension */}
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
              color: 'var(--rq-ink-4)', marginTop: 3, display: 'flex', gap: 8,
            }}>
              <span style={{ color: user.pushback_certified ? 'var(--rq-green)' : 'var(--rq-ink-4)' }}>
                Pushback: {user.pushback_certified ? 'cert' : 'no'}
              </span>
              {user.pushback_recert_date && (
                <span>recert {user.pushback_recert_date}</span>
              )}
              <span>&middot;</span>
              <span>{user.extension_eligible ? 'ext eligible' : 'no ext'}</span>
            </div>
          </div>
        );
      })}

      <div style={{ height: 20 }} />
      <div className="rq-quiet">SOI &middot; Workforce Pool</div>
    </div>
  );
}
