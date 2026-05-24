'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import type {
  AgentIdentity, Severity, QrTarget,
  EquipOperationalStatus, EquipIssueType,
} from '@/lib/rampiq-types';
import {
  EQUIP_STATUS_LABELS, EQUIP_ISSUE_LABELS,
  detectPlatform,
} from '@/lib/rampiq-types';

export default function EquipmentSignalPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const equipmentId = typeof params.equipmentId === 'string' ? params.equipmentId : '';
  const targetQr = searchParams.get('target') || '';

  const [target, setTarget] = useState<QrTarget | null>(null);
  const [identity, setId] = useState<AgentIdentity | null>(null);
  const [status, setStatus] = useState<EquipOperationalStatus>('OPERATIONAL');
  const [issueType, setIssueType] = useState<EquipIssueType | ''>('');
  const [severity, setSeverity] = useState<Severity>('MEDIUM');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    (async () => {
      const { getIdentity } = await import('@/lib/identity');
      setId(getIdentity());
      if (targetQr) {
        const { resolveQrTarget } = await import('@/lib/store');
        const t = await resolveQrTarget(targetQr);
        setTarget(t);
      }
    })();
  }, [targetQr]);

  async function handleSubmit() {
    if (!identity || !target) return;
    setSubmitting(true);

    const { postEvent } = await import('@/lib/store');
    const { isOnline, queueEvent } = await import('@/lib/offline-queue');

    const submission = {
      event_type: 'EQUIP_STATUS',
      severity,
      station: identity.station,
      equipment_id: target.equipment_id || equipmentId,
      qr_target_type: target.target_type,
      qr_target_id: target.id,
      notes: notes || undefined,
      reported_by: identity.user_id,
      role_type: identity.role_type,
      shift_window: identity.shift_window,
      device_id: identity.device_id,
      source_platform: detectPlatform(),
      details_json: {
        operational_status: status,
        issue_type: issueType || null,
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

  if (submitted) {
    return (
      <div className="rq-success">
        <div className="rq-success-icon">{'\u2713'}</div>
        <div className="rq-success-title">Signal Recorded</div>
        <div className="rq-success-msg">
          {target?.label || equipmentId} — {EQUIP_STATUS_LABELS[status]}
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

      <div className="rq-equip-header">
        <div className="rq-equip-id">{target?.label || equipmentId}</div>
        <div className="rq-equip-type">
          Equipment Signal &middot; {target?.equipment_kind || 'GSE'}
        </div>
      </div>

      {/* Operational Status */}
      <div className="rq-eyebrow">Operational Status</div>
      <div className="rq-severity">
        {(['OPERATIONAL', 'LIMITED', 'GROUNDED'] as EquipOperationalStatus[]).map(s => (
          <button key={s} className={`rq-sev-opt${status === s ? (' ' + (s === 'OPERATIONAL' ? 'active-watch' : s === 'LIMITED' ? 'active-attn' : 'active-oos')) : ''}`}
            onClick={() => setStatus(s)} style={{
            color: status === s ? (s === 'OPERATIONAL' ? 'var(--rq-green)' : s === 'LIMITED' ? 'var(--rq-amber)' : 'var(--rq-red)') : undefined,
            background: status === s ? (s === 'OPERATIONAL' ? 'rgba(62,213,152,.06)' : s === 'LIMITED' ? 'rgba(245,177,61,.06)' : 'rgba(255,92,92,.06)') : undefined,
          }}>
            {EQUIP_STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Issue Type — only when not operational */}
      {status !== 'OPERATIONAL' && (
        <>
          <div className="rq-eyebrow">Issue Type</div>
          <div className="rq-field">
            <select className="rq-select" value={issueType}
              onChange={e => setIssueType(e.target.value as EquipIssueType)}>
              <option value="">Select issue...</option>
              {(Object.entries(EQUIP_ISSUE_LABELS) as [EquipIssueType, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </>
      )}

      {/* Severity — only when not operational */}
      {status !== 'OPERATIONAL' && (
        <>
          <div className="rq-eyebrow">Severity</div>
          <div className="rq-severity" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as Severity[]).map(s => (
              <button key={s} className={`rq-sev-opt${severity === s ? (' ' + (s === 'LOW' ? 'active-watch' : s === 'MEDIUM' ? 'active-attn' : 'active-oos')) : ''}`}
                onClick={() => setSeverity(s)}>
                {s}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Notes */}
      <div className="rq-eyebrow">Notes</div>
      <div className="rq-field">
        <textarea className="rq-textarea" value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Describe the condition..." />
      </div>

      {/* Photo placeholder */}
      <div className="rq-photo-placeholder">
        <div className="rq-photo-icon">{'\uD83D\uDCF7'}</div>
        <div className="rq-photo-text">Photo capture (coming soon)</div>
      </div>

      {/* Submit */}
      <div style={{ padding: '0 16px 16px' }}>
        <button className="rq-btn-primary" onClick={handleSubmit}
          disabled={submitting || !identity}>
          {submitting ? 'Submitting...' : 'Submit Signal'}
        </button>
      </div>

      <div style={{ padding: '0 16px 8px' }}>
        <Link href={`/prototype/rampiq/mobile/report?target=${targetQr}`}
          className="rq-btn-secondary"
          style={{ display: 'block', textDecoration: 'none', textAlign: 'center', fontSize: 10 }}>
          Report Other Event
        </Link>
      </div>

      <div className="rq-quiet">RampIQ &middot; Equipment Signal</div>
    </>
  );
}
