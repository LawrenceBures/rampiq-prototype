'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import type { AgentIdentity, QrTarget, SoiEvent } from '@/lib/soi-types';
import { detectPlatform, eventAge } from '@/lib/soi-types';
import type { Incident, RecoveryAction } from '@/lib/lifecycle-types';
import { INCIDENT_STATUS_LABELS, RECOVERY_ACTION_STATUS_LABELS } from '@/lib/operational-states';
import type { IncidentStatus, RecoveryActionStatus } from '@/lib/operational-states';

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
  const [activeDispatch, setActiveDispatch] = useState<SoiEvent | null>(null);
  const [arrivalSubmitted, setArrivalSubmitted] = useState(false);

  // ── Incident awareness ──
  const [gateIncidents, setGateIncidents] = useState<Incident[]>([]);
  const [gateRecoveryActions, setGateRecoveryActions] = useState<RecoveryAction[]>([]);
  const [raTransitioning, setRaTransitioning] = useState<string | null>(null);

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

      // Load incidents affecting this gate
      const { fetchActiveIncidents, fetchRecoveryActions: fetchRA } = await import('@/lib/lifecycle-commands');
      const allIncidents = await fetchActiveIncidents('LAX');
      const gateIncs = allIncidents.filter(i => i.gate_id === gateId);
      setGateIncidents(gateIncs);

      // Load recovery actions for gate incidents
      const allActions: RecoveryAction[] = [];
      for (const inc of gateIncs) {
        const actions = await fetchRA(inc.id);
        allActions.push(...actions.filter(a =>
          !['COMPLETE', 'WITHDRAWN', 'ESCALATED'].includes(a.status)
        ));
      }
      setGateRecoveryActions(allActions);
    })();

    // Mobile realtime: lightweight 10s poll for operational updates
    const pollInterval = setInterval(async () => {
      const { fetchActiveIncidents, fetchRecoveryActions: fetchRA2 } = await import('@/lib/lifecycle-commands');
      const refreshedIncidents = await fetchActiveIncidents('LAX');
      const refreshedGateIncs = refreshedIncidents.filter(i => i.gate_id === gateId);
      setGateIncidents(refreshedGateIncs);
      const refreshedActions: RecoveryAction[] = [];
      for (const inc of refreshedGateIncs) {
        const actions = await fetchRA2(inc.id);
        refreshedActions.push(...actions.filter(a => !['COMPLETE', 'WITHDRAWN', 'ESCALATED'].includes(a.status)));
      }
      setGateRecoveryActions(refreshedActions);
    }, 10_000);

    return () => clearInterval(pollInterval);
  }, [targetQr, gateId]);

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

  async function handleRecoveryTransition(actionId: string, newStatus: RecoveryActionStatus) {
    setRaTransitioning(actionId);
    const { transitionRecoveryAction } = await import('@/lib/lifecycle-commands');
    await transitionRecoveryAction({
      action_id: actionId,
      new_status: newStatus,
      actor_id: identity?.user_id ?? 'MOBILE',
      actor_role: identity?.role_type ?? 'RAMP_AGENT',
    });
    // Refresh recovery actions
    const { fetchRecoveryActions: fetchRA } = await import('@/lib/lifecycle-commands');
    const allActions: RecoveryAction[] = [];
    for (const inc of gateIncidents) {
      const actions = await fetchRA(inc.id);
      allActions.push(...actions.filter(a =>
        !['COMPLETE', 'WITHDRAWN', 'ESCALATED'].includes(a.status)
      ));
    }
    setGateRecoveryActions(allActions);
    setRaTransitioning(null);
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
          <Link href="/prototype/soi/mobile/scan" className="rq-btn-secondary"
            style={{ padding: '12px 20px', textDecoration: 'none', textAlign: 'center' }}>
            Scan Another
          </Link>
          <Link href="/prototype/soi/mobile" className="rq-btn-secondary"
            style={{ padding: '12px 20px', textDecoration: 'none', textAlign: 'center' }}>
            Done
          </Link>
        </div>
      </div>
    );
  }

  const sevColor = (sev: string) =>
    sev === 'CRITICAL' ? 'var(--rq-red)' : sev === 'HIGH' ? 'var(--rq-red)' :
    sev === 'MEDIUM' ? 'var(--rq-amber)' : 'var(--rq-ink-3)';

  return (
    <>
      <Link href="/prototype/soi/mobile" className="rq-back">&larr; Back</Link>

      <div className="rq-gate-header">
        <div className="rq-gate-id">Gate {gateId}</div>
        <div className="rq-gate-meta">
          Operational Readiness &middot; {checkedCount}/{totalCount} checked
        </div>
      </div>

      {/* ── Active incidents at this gate ── */}
      {gateIncidents.length > 0 && (
        <div style={{
          margin: '0 16px 8px', padding: '8px 10px',
          border: '1px solid var(--rq-red)', borderLeft: '3px solid var(--rq-red)',
          background: 'rgba(255,92,92,.04)',
        }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700,
            color: 'var(--rq-red)', letterSpacing: '.08em', textTransform: 'uppercase',
            marginBottom: 4,
          }}>
            {gateIncidents.length} Active Incident{gateIncidents.length !== 1 ? 's' : ''}
          </div>
          {gateIncidents.map(inc => (
            <div key={inc.id} style={{
              padding: '4px 0', borderBottom: '1px solid var(--rq-line)',
            }}>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600,
                color: 'var(--rq-ink)',
              }}>
                {inc.title}
              </div>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                color: 'var(--rq-ink-3)', marginTop: 2, display: 'flex', gap: 6,
              }}>
                <span style={{
                  padding: '1px 6px', borderRadius: 2, fontSize: 9, fontWeight: 600,
                  color: sevColor(inc.severity),
                  background: `color-mix(in srgb, ${sevColor(inc.severity)} 10%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${sevColor(inc.severity)} 25%, transparent)`,
                }}>
                  {inc.severity}
                </span>
                <span style={{
                  padding: '1px 6px', borderRadius: 2, fontSize: 9,
                  color: 'var(--rq-ink-2)',
                  background: 'var(--rq-bg-2)',
                }}>
                  {INCIDENT_STATUS_LABELS[inc.status as IncidentStatus]}
                </span>
                <span style={{ fontSize: 9, color: 'var(--rq-ink-4)' }}>
                  {eventAge(inc.opened_at)}
                </span>
              </div>
              {inc.description && (
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                  color: 'var(--rq-ink-3)', marginTop: 3, lineHeight: 1.3,
                }}>
                  {inc.description}
                </div>
              )}
            </div>
          ))}

          {/* Recovery actions assigned to field agents */}
          {gateRecoveryActions.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                color: 'var(--rq-ink-4)', letterSpacing: '.08em', textTransform: 'uppercase',
                marginBottom: 4,
              }}>
                Your Recovery Actions
              </div>
              {gateRecoveryActions.map(ra => {
                const statusColor = ra.status === 'ACTIVE' ? 'var(--rq-green)'
                  : ra.status === 'BLOCKED' ? 'var(--rq-red)'
                  : ra.status === 'ACKNOWLEDGED' ? 'var(--rq-amber)'
                  : 'var(--rq-ink-3)';
                const transitioning = raTransitioning === ra.id;

                return (
                  <div key={ra.id} style={{
                    padding: '5px 0', borderBottom: '1px solid var(--rq-line)',
                  }}>
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600,
                      color: 'var(--rq-ink)',
                    }}>
                      {ra.title}
                    </div>
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                      color: 'var(--rq-ink-4)', marginTop: 1, display: 'flex', gap: 6,
                    }}>
                      <span style={{ color: statusColor, fontWeight: 600 }}>
                        {RECOVERY_ACTION_STATUS_LABELS[ra.status]}
                      </span>
                      {ra.action_type && <span>{ra.action_type}</span>}
                      {ra.assigned_to && <span>&rarr; {ra.assigned_to}</span>}
                    </div>
                    {ra.description && (
                      <div style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                        color: 'var(--rq-ink-3)', marginTop: 2,
                      }}>
                        {ra.description}
                      </div>
                    )}
                    {/* Mobile-friendly transition buttons */}
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      {ra.status === 'PROPOSED' && (
                        <button className="rq-qbtn qb-ack" disabled={transitioning}
                          style={{ flex: 1, padding: '8px', fontSize: 10 }}
                          onClick={() => handleRecoveryTransition(ra.id, 'ACKNOWLEDGED')}>
                          {transitioning ? '...' : 'Acknowledge'}
                        </button>
                      )}
                      {ra.status === 'ACKNOWLEDGED' && (
                        <button className="rq-qbtn qb-prog" disabled={transitioning}
                          style={{ flex: 1, padding: '8px', fontSize: 10 }}
                          onClick={() => handleRecoveryTransition(ra.id, 'ACTIVE')}>
                          {transitioning ? '...' : 'Start'}
                        </button>
                      )}
                      {ra.status === 'ACTIVE' && (
                        <>
                          <button className="rq-qbtn qb-resolve" disabled={transitioning}
                            style={{ flex: 1, padding: '8px', fontSize: 10 }}
                            onClick={() => handleRecoveryTransition(ra.id, 'COMPLETE')}>
                            {transitioning ? '...' : 'Complete'}
                          </button>
                          <button className="rq-qbtn qb-ack" disabled={transitioning}
                            style={{ flex: 1, padding: '8px', fontSize: 10 }}
                            onClick={() => handleRecoveryTransition(ra.id, 'BLOCKED')}>
                            {transitioning ? '...' : 'Blocked'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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
        <Link href={`/prototype/soi/mobile/report?target=${targetQr}`}
          className="rq-btn-secondary"
          style={{ display: 'block', textDecoration: 'none', textAlign: 'center', fontSize: 10 }}>
          Report Event
        </Link>
      </div>

      <div className="rq-quiet">SOI &middot; Gate Readiness</div>
    </>
  );
}
