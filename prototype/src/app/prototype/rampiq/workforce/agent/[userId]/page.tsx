'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAgentProfile, useOperationalMetrics, fetchEvents } from '@/lib/store';
import {
  eventAge, durationLabel,
  CERT_STATUS_LABELS,
  ROLE_LABELS, STATUS_LABELS,
} from '@/lib/rampiq-types';
import type { RampiqEvent, OperationalStatus } from '@/lib/rampiq-types';
import { useParams } from 'next/navigation';

export default function AgentDetailPage() {
  const params = useParams();
  const userId = typeof params.userId === 'string' ? params.userId : null;
  const profile = useAgentProfile(userId);
  const metrics = useOperationalMetrics(userId);
  const [events, setEvents] = useState<RampiqEvent[]>([]);

  useEffect(() => {
    if (!userId) return;
    fetchEvents().then(all => {
      setEvents(all.filter(e => e.reported_by === userId));
    });
  }, [userId]);

  if (!userId) {
    return <div className="rq-quiet" style={{ padding: '32px 16px' }}>No agent specified</div>;
  }

  if (!profile) {
    return (
      <>
        <Link href="/prototype/rampiq/workforce" className="rq-back">&larr; Workforce</Link>
        <div className="rq-quiet" style={{ padding: '32px 16px' }}>Loading agent profile...</div>
      </>
    );
  }

  const certActive = profile.certifications.filter(c => c.status === 'ACTIVE').length;
  const certTotal = profile.certifications.length;

  return (
    <div className="rq-ops-board">
      <Link href="/prototype/rampiq/workforce" className="rq-back">&larr; Workforce</Link>

      {/* Header */}
      <div className="rq-gate-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="rq-gate-id" style={{ fontSize: 20 }}>{profile.user.display_name || profile.user.id}</div>
          <div className="rq-shift-badge">
            <div className={`rq-shift-dot ${profile.shiftStatus?.on_shift ? 'on' : 'off'}`} />
            {profile.shiftStatus?.on_shift ? 'On Shift' : 'Off Shift'}
          </div>
        </div>
        <div className="rq-gate-meta">
          {profile.user.station} &middot; <b>{ROLE_LABELS[profile.user.role_type] || profile.user.role_type}</b>
          {profile.team && <> &middot; {profile.team.label}</>}
          {profile.shiftStatus?.shift_window && <> &middot; {profile.shiftStatus.shift_window}</>}
        </div>
      </div>

      {/* Operational Metrics */}
      {metrics && (
        <div className="rq-kpis rq-kpis-4">
          <div className="rq-kpi">
            <div className="rq-kpi-lbl">Participation</div>
            <div className="rq-kpi-val">{metrics.total_events}</div>
          </div>
          <div className="rq-kpi">
            <div className="rq-kpi-lbl">Last 7d</div>
            <div className="rq-kpi-val">{metrics.events_last_7d}</div>
          </div>
          <div className="rq-kpi">
            <div className="rq-kpi-lbl">Recovery</div>
            <div className="rq-kpi-val">{durationLabel(metrics.avg_resolution_seconds)}</div>
          </div>
          <div className="rq-kpi">
            <div className="rq-kpi-lbl">Response</div>
            <div className="rq-kpi-val">{metrics.response_rate}%</div>
          </div>
        </div>
      )}

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

      {/* Zone Assignments */}
      {profile.zoneAssignments.length > 0 && (
        <>
          <div className="rq-eyebrow">Zone Assignments</div>
          {profile.zoneAssignments.map(z => (
            <div key={`${z.zone_id}-${z.shift}`} className="rq-cert-row">
              <span className="rq-cert-name">{z.zone_label || z.zone_id}</span>
              <span className="rq-cert-meta">{z.shift}</span>
            </div>
          ))}
        </>
      )}

      {/* Activity History */}
      <div className="rq-eyebrow">Operational Activity ({events.length} events)</div>
      {events.length === 0 && (
        <div className="rq-quiet">No operational events</div>
      )}
      {events.slice(0, 20).map(e => (
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
            <span style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 8,
              padding: '1px 4px',
              color: e.operational_status === 'RESOLVED' ? 'var(--rq-green)' : 'var(--rq-ink-3)',
              border: `1px solid ${e.operational_status === 'RESOLVED' ? 'var(--rq-green-dim)' : 'var(--rq-line)'}`,
            }}>
              {STATUS_LABELS[e.operational_status as OperationalStatus]}
            </span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'var(--rq-ink-3)', marginLeft: 'auto' }}>
              {eventAge(e.created_at)}
            </span>
          </div>
          {e.event_duration_seconds != null && (
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'var(--rq-ink-4)', marginTop: 2 }}>
              Recovery: {durationLabel(e.event_duration_seconds)}
            </div>
          )}
        </div>
      ))}
      {events.length > 20 && (
        <div className="rq-quiet">{events.length - 20} more events not shown</div>
      )}

      <div style={{ height: 20 }} />
      <div className="rq-quiet">RampIQ &middot; Operational Readiness</div>
    </div>
  );
}
