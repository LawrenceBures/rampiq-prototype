'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { resolveQrTarget, postEvent, useEventTypes, getEventTypesForTarget } from '@/lib/store';
import { getIdentity } from '@/lib/identity';
import { isOnline, queueEvent } from '@/lib/offline-queue';
import { detectPlatform } from '@/lib/rampiq-types';
import type { QrTarget, EventType, Severity, AgentIdentity } from '@/lib/rampiq-types';

function ReportForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetId = searchParams.get('target') || '';

  const allEventTypes = useEventTypes();
  const [target, setTarget] = useState<QrTarget | null>(null);
  const [identity, setIdentityState] = useState<AgentIdentity | null>(null);
  const [loading, setLoading] = useState(true);

  // Form state
  const [selectedType, setSelectedType] = useState<string>('');
  const [severity, setSeverity] = useState<Severity>('MEDIUM');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');

  // Load target + identity
  useEffect(() => {
    const id = getIdentity();
    if (!id) {
      router.replace('/prototype/rampiq/mobile');
      return;
    }
    setIdentityState(id);

    if (targetId) {
      resolveQrTarget(targetId).then(t => {
        setTarget(t);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, [targetId, router]);

  // Get applicable event types for this target
  const applicableTypes = target
    ? getEventTypesForTarget(allEventTypes, target.target_type)
    : allEventTypes;

  // When an event type is selected, set default severity
  function handleTypeSelect(code: string) {
    setSelectedType(code);
    const et = allEventTypes.find(t => t.code === code);
    if (et) setSeverity(et.default_severity);
  }

  // Submit
  async function handleSubmit() {
    if (!selectedType || !target || !identity) return;
    setSubmitting(true);
    setError('');

    const submission = {
      event_type: selectedType,
      severity,
      station: identity.station,
      gate_id: target.gate_id || undefined,
      flight_id: target.flight_id || undefined,
      equipment_id: target.equipment_id || undefined,
      qr_target_type: target.target_type,
      qr_target_id: target.id,
      notes: notes || undefined,
      reported_by: identity.user_id,
      role_type: identity.role_type,
      shift_window: identity.shift_window,
      device_id: identity.device_id,
      source_platform: detectPlatform(),
    } as const;

    try {
      if (!isOnline()) {
        await queueEvent(submission);
        setConfirmation(`Queued: ${allEventTypes.find(t => t.code === selectedType)?.label || selectedType} at ${target.label} — will sync when online`);
      } else {
        await postEvent(submission);
        setConfirmation(`Reported: ${allEventTypes.find(t => t.code === selectedType)?.label || selectedType} at ${target.label}`);
      }
    } catch (err) {
      // Try to queue offline
      try {
        await queueEvent(submission);
        setConfirmation(`Queued: ${allEventTypes.find(t => t.code === selectedType)?.label || selectedType} at ${target.label} — will sync when online`);
      } catch (qErr) {
        setError(qErr instanceof Error ? qErr.message : String(qErr));
      }
    }
    setSubmitting(false);
  }

  // Confirmation shown
  if (confirmation) {
    return (
      <>
        <div style={{
          margin: '40px 16px', padding: '24px', textAlign: 'center',
          border: '1px solid var(--rq-green-dim)',
          background: 'rgba(62,213,152,.04)',
        }}>
          <div style={{
            width: 48, height: 48, margin: '0 auto 14px',
            border: '2px solid var(--rq-green)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, color: 'var(--rq-green)',
          }}>
            &#10003;
          </div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700,
            color: 'var(--rq-green)', letterSpacing: '.1em', textTransform: 'uppercase' as const,
            marginBottom: 8,
          }}>
            Submitted
          </div>
          <div style={{ fontSize: 13, color: 'var(--rq-ink-2)', lineHeight: 1.5 }}>
            {confirmation}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button
              className="rq-btn-primary"
              onClick={() => router.push('/prototype/rampiq/mobile/scan')}
              style={{ flex: 1 }}
            >
              Scan Another
            </button>
            <button
              className="rq-btn-secondary"
              onClick={() => router.push('/prototype/rampiq/mobile')}
              style={{ flex: 1 }}
            >
              Done
            </button>
          </div>
        </div>
      </>
    );
  }

  if (loading) {
    return (
      <div className="rq-quiet" style={{ padding: '40px 16px' }}>Resolving QR target...</div>
    );
  }

  if (!target) {
    return (
      <>
        <Link href="/prototype/rampiq/mobile/scan" className="rq-back">&larr; Back to Scan</Link>
        <div style={{
          margin: '24px 16px', padding: '14px',
          border: '1px solid var(--rq-amber-dim)', background: 'rgba(245,177,61,.04)',
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
          color: 'var(--rq-amber)',
        }}>
          QR target not found: {targetId}
        </div>
      </>
    );
  }

  const severities: Severity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const sevColors: Record<Severity, string> = {
    LOW: 'var(--rq-ink-3)',
    MEDIUM: 'var(--rq-amber)',
    HIGH: 'var(--rq-red)',
    CRITICAL: 'var(--rq-red)',
  };

  return (
    <>
      <Link href="/prototype/rampiq/mobile/scan" className="rq-back">&larr; Back to Scan</Link>

      {/* Target context header */}
      <div className="rq-gate-header">
        <div className="rq-gate-id" style={{ fontSize: 22 }}>{target.label}</div>
        <div className="rq-gate-meta">
          {target.target_type}
          {target.equipment_kind && <> &middot; {target.equipment_kind.replace(/_/g, ' ')}</>}
          {target.gate_id && <> &middot; Gate {target.gate_id}</>}
        </div>
      </div>

      {/* Event type selector */}
      <div className="rq-eyebrow">What happened?</div>
      <div style={{ padding: '0 16px', marginBottom: 14 }}>
        {applicableTypes.map(et => (
          <button
            key={et.code}
            onClick={() => handleTypeSelect(et.code)}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '14px 14px', marginBottom: 6,
              background: selectedType === et.code ? 'rgba(201,255,58,.06)' : 'var(--rq-bg-1)',
              border: selectedType === et.code ? '1px solid var(--rq-accent)' : '1px solid var(--rq-line)',
              color: selectedType === et.code ? 'var(--rq-ink)' : 'var(--rq-ink-2)',
              cursor: 'pointer', transition: 'all .15s',
              fontFamily: "'Inter Tight', sans-serif", fontSize: 14, fontWeight: 500,
            }}
          >
            {et.label}
            <span style={{
              display: 'block', marginTop: 2,
              fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
              color: 'var(--rq-ink-3)', letterSpacing: '.1em', textTransform: 'uppercase' as const,
            }}>
              Default: {et.default_severity}
            </span>
          </button>
        ))}
      </div>

      {/* Severity selector */}
      {selectedType && (
        <>
          <div className="rq-eyebrow">Severity</div>
          <div className="rq-severity" style={{ gridTemplateColumns: `repeat(${severities.length}, 1fr)` }}>
            {severities.map(s => (
              <button
                key={s}
                className={`rq-sev-opt${severity === s ? ` active-${s === 'LOW' ? 'watch' : s === 'MEDIUM' ? 'watch' : 'oos'}` : ''}`}
                style={severity === s ? { color: sevColors[s], background: `${sevColors[s]}11` } : {}}
                onClick={() => setSeverity(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Notes */}
      {selectedType && (
        <>
          <div className="rq-eyebrow">Notes (optional)</div>
          <div className="rq-field">
            <textarea
              className="rq-textarea"
              placeholder="Additional details..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </>
      )}

      {/* Error */}
      {error && (
        <div style={{
          margin: '0 16px 14px', padding: '12px',
          border: '1px solid var(--rq-red-dim)', background: 'rgba(255,92,92,.04)',
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--rq-red)',
        }}>
          {error}
        </div>
      )}

      {/* Submit */}
      {selectedType && (
        <div style={{ padding: '0 16px 24px' }}>
          <button
            className="rq-btn-primary"
            onClick={handleSubmit}
            disabled={submitting || !selectedType}
          >
            {submitting ? 'Submitting...' : 'Submit Signal'}
          </button>
        </div>
      )}

      <div className="rq-quiet">SOI &middot; Signal Report</div>
    </>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={<div className="rq-quiet" style={{ padding: '40px 16px' }}>Loading...</div>}>
      <ReportForm />
    </Suspense>
  );
}
