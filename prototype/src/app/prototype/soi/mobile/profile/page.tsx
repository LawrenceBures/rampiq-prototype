'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getIdentity } from '@/lib/identity';
import { useAgentProfile, useOperationalMetrics, updateShiftStatus, fetchEvents } from '@/lib/store';
import {
  eventAge, durationLabel,
  CERT_STATUS_LABELS,
  ROLE_LABELS,
} from '@/lib/soi-types';
import type { AgentIdentity, SoiEvent, ShiftWindow } from '@/lib/soi-types';

export default function AgentProfilePage() {
  const [identity, setId] = useState<AgentIdentity | null>(null);
  const [recentEvents, setRecentEvents] = useState<SoiEvent[]>([]);
  const [shiftUpdating, setShiftUpdating] = useState(false);

  useEffect(() => {
    setId(getIdentity());
  }, []);

  const profile = useAgentProfile(identity?.user_id ?? null);
  const metrics = useOperationalMetrics(identity?.user_id ?? null);

  // Fetch recent events for this agent
  useEffect(() => {
    if (!identity) return;
    fetchEvents().then(events => {
      setRecentEvents(events.filter(e => e.reported_by === identity.user_id).slice(0, 5));
    });
  }, [identity]);

  async function toggleShift() {
    if (!profile?.shiftStatus || !identity) return;
    setShiftUpdating(true);
    const newOnShift = !profile.shiftStatus.on_shift;
    await updateShiftStatus(identity.user_id, newOnShift, identity.shift_window as ShiftWindow);
    // Reload profile
    window.location.reload();
  }

  if (!identity) {
    return (
      <>
        <Link href="/prototype/soi/mobile" className="rq-back">&larr; Back</Link>
        <div className="rq-quiet" style={{ padding: '32px 16px' }}>Select identity first</div>
      </>
    );
  }

  if (!profile) {
    return (
      <>
        <Link href="/prototype/soi/mobile" className="rq-back">&larr; Back</Link>
        <div className="rq-quiet" style={{ padding: '32px 16px' }}>Loading profile...</div>
      </>
    );
  }

  const certActive = profile.certifications.filter(c => c.status === 'ACTIVE').length;
  const certTotal = profile.certifications.length;

  return (
    <>
      <Link href="/prototype/soi/mobile" className="rq-back">&larr; Back</Link>

      {/* Header */}
      <div className="rq-gate-header">
        <div className="rq-gate-id" style={{ fontSize: 20 }}>{profile.user.display_name || profile.user.id}</div>
        <div className="rq-gate-meta">
          {profile.user.station} &middot; <b>{profile.user.display_name || profile.user.id}</b> &middot; {ROLE_LABELS[profile.user.role_type] || profile.user.role_type}
        </div>
      </div>

      {/* Shift Status */}
      <div className="rq-eyebrow">Shift Status</div>
      <div style={{ padding: '0 16px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="rq-shift-badge">
          <div className={`rq-shift-dot ${profile.shiftStatus?.on_shift ? 'on' : 'off'}`} />
          {profile.shiftStatus?.on_shift ? 'On Shift' : 'Off Shift'}
          {profile.shiftStatus?.shift_window && <> &middot; {profile.shiftStatus.shift_window}</>}
        </div>
        <button
          className="rq-btn-secondary"
          style={{ width: 'auto', padding: '8px 14px', fontSize: 9, marginLeft: 'auto' }}
          onClick={toggleShift}
          disabled={shiftUpdating}
        >
          {shiftUpdating ? '...' : profile.shiftStatus?.on_shift ? 'End Shift' : 'Start Shift'}
        </button>
      </div>

      {/* Certifications */}
      <div className="rq-eyebrow">Certifications ({certActive}/{certTotal})</div>
      {profile.certifications.length === 0 && (
        <div className="rq-quiet">No certifications on record</div>
      )}
      {profile.certifications.map(c => (
        <div className="rq-cert-row" key={c.id}>
          <span className="rq-cert-name">{c.cert_label || c.cert_code}</span>
          <span className={`rq-pill ${c.status === 'ACTIVE' ? 'rq-pill-ready' : 'rq-pill-risk'}`}>
            {CERT_STATUS_LABELS[c.status]}
          </span>
          {c.expires_at && (
            <span className="rq-cert-meta">{c.expires_at}</span>
          )}
        </div>
      ))}

      {/* Equipment Qualifications */}
      <div className="rq-eyebrow">Equipment Qualifications ({profile.equipmentQuals.length})</div>
      {profile.equipmentQuals.length === 0 && (
        <div className="rq-quiet">No equipment qualifications</div>
      )}
      {profile.equipmentQuals.map(q => (
        <div className="rq-cert-row" key={q.id}>
          <span className="rq-cert-name">{q.equip_label || q.equip_code}</span>
          <span className={`rq-pill ${q.status === 'ACTIVE' ? 'rq-pill-ready' : 'rq-pill-risk'}`}>
            {q.status}
          </span>
        </div>
      ))}

      {/* Team & Zone */}
      <div className="rq-eyebrow">Team & Zone</div>
      {profile.team ? (
        <div style={{ padding: '0 16px 8px' }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 600 }}>
            {profile.team.label}
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--rq-ink-3)', marginTop: 2 }}>
            {profile.team.shift} shift &middot; Lead: {profile.team.lead_user_id}
          </div>
        </div>
      ) : (
        <div className="rq-quiet">No team assigned</div>
      )}
      {profile.zoneAssignments.map(z => (
        <div key={`${z.zone_id}-${z.shift}`} style={{ padding: '0 16px 8px' }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--rq-ink-2)' }}>
            {z.zone_label || z.zone_id} &middot; {z.shift}
          </div>
        </div>
      ))}

      {/* Operational Activity */}
      <div className="rq-eyebrow">Operational Activity</div>
      {metrics ? (
        <>
          <div className="rq-kpis rq-kpis-4" style={{ margin: '0 16px', border: '1px solid var(--rq-line)' }}>
            <div className="rq-kpi">
              <div className="rq-kpi-lbl">Total Events</div>
              <div className="rq-kpi-val">{metrics.total_events}</div>
            </div>
            <div className="rq-kpi">
              <div className="rq-kpi-lbl">Last 7d</div>
              <div className="rq-kpi-val">{metrics.events_last_7d}</div>
            </div>
            <div className="rq-kpi">
              <div className="rq-kpi-lbl">Avg Recovery</div>
              <div className="rq-kpi-val">{durationLabel(metrics.avg_resolution_seconds)}</div>
            </div>
            <div className="rq-kpi">
              <div className="rq-kpi-lbl">Response</div>
              <div className="rq-kpi-val">{metrics.response_rate}%</div>
            </div>
          </div>
        </>
      ) : (
        <div className="rq-quiet">Computing metrics...</div>
      )}

      {/* Recent Events */}
      <div className="rq-eyebrow">Recent Activity</div>
      {recentEvents.length === 0 && (
        <div className="rq-quiet">No events yet</div>
      )}
      {recentEvents.map(e => (
        <div key={e.id} style={{
          margin: '0 16px 4px', padding: '8px 10px',
          border: '1px solid var(--rq-line)', background: 'var(--rq-bg-1)',
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600 }}>
              {e.event_type.replace(/_/g, ' ')}
            </span>
            {e.gate_id && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'var(--rq-ink-3)' }}>{e.gate_id}</span>}
            {e.equipment_id && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'var(--rq-ink-3)' }}>{e.equipment_id}</span>}
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'var(--rq-ink-3)', marginLeft: 'auto' }}>
              {eventAge(e.created_at)}
            </span>
          </div>
        </div>
      ))}

      <div style={{ height: 20 }} />
      <div className="rq-quiet">SOI &middot; Operational Readiness</div>
    </>
  );
}
