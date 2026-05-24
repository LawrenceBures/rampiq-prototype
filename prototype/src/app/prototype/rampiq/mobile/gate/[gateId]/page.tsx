'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import type { AgentIdentity, QrTarget, RampiqEvent } from '@/lib/rampiq-types';
import { detectPlatform, eventAge } from '@/lib/rampiq-types';

const CHECKLIST = {
  equipment: [
    { key: 'belt_loader', label: 'Belt loader positioned' },
    { key: 'cones', label: 'Cones placed' },
    { key: 'chocks', label: 'Chocks available' },
    { key: 'headsets', label: 'Headsets available' },
    { key: 'pushback', label: 'Pushback equipment ready' },
    { key: 'gpu', label: 'GPU positioned' },
    { key: 'lav', label: 'LAV requested if needed' },
  ],
  staffing: [
    { key: 'ramp_agents', label: 'Ramp agents assigned' },
    { key: 'regional_cabin', label: 'Regional cabin notified' },
    { key: 'lt_notified', label: 'LT notified' },
    { key: 'crew_chief', label: 'Crew chief aware' },
    { key: 'time_confirmed', label: 'Arrival/departure time confirmed' },
  ],
  conditions: [
    { key: 'gate_clear', label: 'Gate clear' },
    { key: 'fod_check', label: 'FOD check complete' },
    { key: 'safety_area', label: 'Safety area clear' },
    { key: 'weather', label: 'Weather concern noted' },
  ],
};

const ALL_ITEMS = [...CHECKLIST.equipment, ...CHECKLIST.staffing, ...CHECKLIST.conditions];

export default function GateReadinessPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const gateId = typeof params.gateId === 'string' ? params.gateId : '';
  const targetQr = searchParams.get('target') || '';

  const [target, setTarget] = useState<QrTarget | null>(null);
  const [identity, setId] = useState<AgentIdentity | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [activeDispatch, setActiveDispatch] = useState<RampiqEvent | null>(null);
  const [arrivalSubmitted, setArrivalSubmitted] = useState(false);

  useEffect(() => {
    (async () => {
      const { getIdentity } = await import('@/lib/identity');
      const id = getIdentity();
      setId(id);

      if (targetQr) {
        const { resolveQrTarget } = await import('@/lib/store');
        const t = await resolveQrTarget(targetQr);
        setTarget(t);
      }

      // Check for active LT dispatch (runner arriving at gate)
      if (id) {
        const { fetchActiveDispatch } = await import('@/lib/store');
        const dispatch = await fetchActiveDispatch(id.user_id);
        if (dispatch) setActiveDispatch(dispatch);
      }
    })();
  }, [targetQr]);

  function toggleItem(key: string) {
    setChecked(prev => ({ ...prev, [key]: !prev[key] }));
  }

  const checkedCount = Object.values(checked).filter(Boolean).length;
  const totalCount = ALL_ITEMS.length;

  async function handleSubmit() {
    if (!identity || !target) return;
    setSubmitting(true);

    const { postEvent } = await import('@/lib/store');
    const { isOnline, queueEvent } = await import('@/lib/offline-queue');

    const submission = {
      event_type: 'GATE_READINESS',
      severity: 'LOW' as const,
      station: identity.station,
      gate_id: target.gate_id || gateId,
      qr_target_type: target.target_type,
      qr_target_id: target.id,
      reported_by: identity.user_id,
      role_type: identity.role_type,
      shift_window: identity.shift_window,
      device_id: identity.device_id,
      source_platform: detectPlatform(),
      details_json: {
        checklist: checked,
        items_checked: checkedCount,
        items_total: totalCount,
      },
    } as const;

    try {
      if (isOnline()) {
        await postEvent(submission);
      } else {
        await queueEvent(submission);
      }
      setSubmitted(true);
    } catch {
      await queueEvent(submission);
      setSubmitted(true);
    }
    setSubmitting(false);
  }

  async function handleArrival() {
    if (!identity || !activeDispatch) return;
    setSubmitting(true);

    const { postEvent } = await import('@/lib/store');
    const { isOnline, queueEvent } = await import('@/lib/offline-queue');

    const dispatchTime = new Date(activeDispatch.created_at).getTime();
    const travelSeconds = Math.floor((Date.now() - dispatchTime) / 1000);

    const submission = {
      event_type: 'LT_ARRIVAL',
      severity: 'LOW' as const,
      station: identity.station,
      gate_id: target?.gate_id || gateId,
      qr_target_type: 'GATE' as const,
      qr_target_id: targetQr || `LAX-GATE-${gateId}`,
      reported_by: identity.user_id,
      role_type: identity.role_type,
      shift_window: identity.shift_window,
      device_id: identity.device_id,
      source_platform: detectPlatform(),
      details_json: {
        dispatch_event_id: activeDispatch.id,
        travel_seconds: travelSeconds,
        destination_gate: gateId,
      },
    } as const;

    try {
      if (isOnline()) {
        await postEvent(submission);
      } else {
        await queueEvent(submission);
      }
      setArrivalSubmitted(true);
      setActiveDispatch(null);
    } catch {
      await queueEvent(submission);
      setArrivalSubmitted(true);
      setActiveDispatch(null);
    }
    setSubmitting(false);
  }

  if (submitted) {
    return (
      <div className="rq-success">
        <div className="rq-success-icon">{'\u2713'}</div>
        <div className="rq-success-title">Readiness Recorded</div>
        <div className="rq-success-msg">
          Gate {gateId} &middot; {checkedCount}/{totalCount} items checked
        </div>
        <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
          <Link href="/prototype/rampiq/mobile/scan" className="rq-btn-secondary"
            style={{ padding: '12px 20px', textDecoration: 'none', textAlign: 'center' }}>
            Scan Another
          </Link>
          <Link href="/prototype/rampiq/mobile" className="rq-btn-secondary"
            style={{ padding: '12px 20px', textDecoration: 'none', textAlign: 'center' }}>
            Done
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <Link href="/prototype/rampiq/mobile" className="rq-back">&larr; Back</Link>

      <div className="rq-gate-header">
        <div className="rq-gate-id">Gate {gateId}</div>
        <div className="rq-gate-meta">
          Operational Readiness &middot; {checkedCount}/{totalCount} checked
        </div>
      </div>

      {/* LT Arrival banner — if runner has active dispatch */}
      {activeDispatch && !arrivalSubmitted && (
        <div className="rq-attn" style={{ borderColor: 'var(--rq-blue)', margin: '0 0 0' }}>
          <div className="rq-attn-row">
            <span className="rq-attn-tag" style={{ color: 'var(--rq-blue)' }}>LT ARRIVAL</span>
            <span className="rq-attn-time">dispatched {eventAge(activeDispatch.created_at)}</span>
          </div>
          <div className="rq-attn-msg" style={{ marginBottom: 8 }}>
            Confirm arrival at gate {gateId}
          </div>
          <button className="rq-btn-primary" onClick={handleArrival} disabled={submitting}
            style={{ background: 'var(--rq-blue)', borderColor: 'var(--rq-blue)', fontSize: 11, padding: 12 }}>
            {submitting ? 'Recording...' : 'Confirm Arrived'}
          </button>
        </div>
      )}
      {arrivalSubmitted && (
        <div style={{ margin: '14px 16px 0', padding: 10, border: '1px solid var(--rq-green-dim)', background: 'rgba(62,213,152,.04)' }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--rq-green)' }}>
            Arrival recorded at gate {gateId}
          </span>
        </div>
      )}

      {/* Equipment Readiness */}
      <div className="rq-eyebrow">Equipment Readiness</div>
      <div className="rq-checklist">
        {CHECKLIST.equipment.map(item => (
          <div key={item.key} className={`rq-check${checked[item.key] ? ' done' : ''}`}
            onClick={() => toggleItem(item.key)}>
            <div className={`rq-check-box${checked[item.key] ? ' done' : ''}`}>
              {checked[item.key] ? '\u2713' : ''}
            </div>
            <div className="rq-check-info">
              <div className="rq-check-name">{item.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Staffing Readiness */}
      <div className="rq-eyebrow">Staffing Readiness</div>
      <div className="rq-checklist">
        {CHECKLIST.staffing.map(item => (
          <div key={item.key} className={`rq-check${checked[item.key] ? ' done' : ''}`}
            onClick={() => toggleItem(item.key)}>
            <div className={`rq-check-box${checked[item.key] ? ' done' : ''}`}>
              {checked[item.key] ? '\u2713' : ''}
            </div>
            <div className="rq-check-info">
              <div className="rq-check-name">{item.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Operational Conditions */}
      <div className="rq-eyebrow">Operational Conditions</div>
      <div className="rq-checklist">
        {CHECKLIST.conditions.map(item => (
          <div key={item.key} className={`rq-check${checked[item.key] ? ' done' : ''}`}
            onClick={() => toggleItem(item.key)}>
            <div className={`rq-check-box${checked[item.key] ? ' done' : ''}`}>
              {checked[item.key] ? '\u2713' : ''}
            </div>
            <div className="rq-check-info">
              <div className="rq-check-name">{item.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Submit */}
      <div style={{ padding: '16px' }}>
        <button className="rq-btn-primary" onClick={handleSubmit}
          disabled={submitting || !identity}>
          {submitting ? 'Submitting...' : `Submit Readiness (${checkedCount}/${totalCount})`}
        </button>
      </div>

      {/* Report issue link */}
      <div style={{ padding: '0 16px 8px' }}>
        <Link href={`/prototype/rampiq/mobile/report?target=${targetQr}`}
          className="rq-btn-secondary"
          style={{ display: 'block', textDecoration: 'none', textAlign: 'center', fontSize: 10 }}>
          Report Event
        </Link>
      </div>

      <div className="rq-quiet">RampIQ &middot; Gate Readiness</div>
    </>
  );
}
