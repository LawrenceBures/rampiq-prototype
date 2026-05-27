'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { AgentIdentity } from '@/lib/rampiq-types';
import { detectPlatform } from '@/lib/rampiq-types';

const GATES = ['52A', '52B', '52C', '52D', '52E', '52F', '52G', '52H', '52I'];

export default function LtDispatchPage() {
  const [identity, setId] = useState<AgentIdentity | null>(null);
  const [destGate, setDestGate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [dispatchTime, setDispatchTime] = useState('');

  useEffect(() => {
    (async () => {
      const { getIdentity } = await import('@/lib/identity');
      setId(getIdentity());
    })();
  }, []);

  async function handleDispatch() {
    if (!identity || !destGate) return;
    setSubmitting(true);

    const { postEvent } = await import('@/lib/store');
    const { isOnline, queueEvent } = await import('@/lib/offline-queue');

    const submission = {
      event_type: 'LT_DISPATCH',
      severity: 'LOW' as const,
      station: identity.station,
      gate_id: destGate,
      qr_target_type: 'DISPATCH' as const,
      qr_target_id: 'LAX-DISPATCH-BAGROOM',
      notes: notes || undefined,
      reported_by: identity.user_id,
      role_type: identity.role_type,
      shift_window: identity.shift_window,
      device_id: identity.device_id,
      source_platform: detectPlatform(),
      details_json: {
        destination_gate: destGate,
      },
    } as const;

    try {
      if (isOnline()) {
        await postEvent(submission);
      } else {
        await queueEvent(submission);
      }
      setDispatchTime(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }));
      setSubmitted(true);
    } catch {
      await queueEvent(submission);
      setDispatchTime(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }));
      setSubmitted(true);
    }
    setSubmitting(false);
  }

  if (submitted) {
    return (
      <div className="rq-success">
        <div className="rq-success-icon">{'\u2713'}</div>
        <div className="rq-success-title">Dispatched</div>
        <div className="rq-success-msg">
          {identity?.display_name} dispatched to gate {destGate} at {dispatchTime}
        </div>
        <div style={{ marginTop: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--rq-ink-3)' }}>
          Scan the gate QR on arrival to log travel time
        </div>
        <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
          <Link href="/prototype/rampiq/mobile/scan" className="rq-btn-secondary"
            style={{ padding: '12px 20px', textDecoration: 'none', textAlign: 'center' }}>
            Go to Scanner
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
        <div className="rq-gate-id" style={{ fontSize: 20 }}>LT Dispatch</div>
        <div className="rq-gate-meta">
          Bag Room &middot; <b>{identity?.display_name || '...'}</b>
        </div>
      </div>

      {/* Runner info */}
      <div className="rq-eyebrow">Runner</div>
      <div style={{ padding: '0 16px 12px' }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 600 }}>
          {identity?.display_name || 'Loading...'}
        </div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--rq-ink-3)', marginTop: 2 }}>
          {identity?.role_type.replace(/_/g, ' ')} &middot; {identity?.shift_window}
        </div>
      </div>

      {/* Destination gate */}
      <div className="rq-eyebrow">Destination Gate</div>
      <div style={{ padding: '0 16px 12px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {GATES.map(g => (
            <button key={g} className={`rq-gate-btn${destGate === g ? '' : ''}`}
              onClick={() => setDestGate(g)}
              style={{
                borderColor: destGate === g ? 'var(--rq-accent)' : undefined,
                background: destGate === g ? 'rgba(201,255,58,.06)' : undefined,
              }}>
              <span className="rq-gate-btn-id">{g}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="rq-eyebrow">Notes</div>
      <div className="rq-field">
        <textarea className="rq-textarea" value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Bag count, priority, etc." style={{ minHeight: 50 }} />
      </div>

      {/* Dispatch */}
      <div style={{ padding: '0 16px 16px' }}>
        <button className="rq-btn-primary" onClick={handleDispatch}
          disabled={submitting || !identity || !destGate}>
          {submitting ? 'Dispatching...' : `Dispatch to ${destGate || '...'}`}
        </button>
      </div>

      <div className="rq-quiet">SOI &middot; LT Dispatch</div>
    </>
  );
}
