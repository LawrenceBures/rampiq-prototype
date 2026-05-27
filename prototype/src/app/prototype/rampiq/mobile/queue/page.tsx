'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getPendingEvents, syncQueue, isOnline } from '@/lib/offline-queue';
import type { QueuedEvent } from '@/lib/offline-queue';
import { formatDateTime } from '@/lib/rampiq-types';

export default function QueuePage() {
  const [pending, setPending] = useState<QueuedEvent[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ synced: number; failed: number } | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(isOnline());
    getPendingEvents().then(setPending).catch(() => {});

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    const result = await syncQueue();
    setSyncResult(result);
    const remaining = await getPendingEvents();
    setPending(remaining);
    setSyncing(false);
  }

  // Auto-sync when coming back online
  useEffect(() => {
    if (online && pending.length > 0) {
      handleSync();
    }
  }, [online]);

  return (
    <>
      <Link href="/prototype/rampiq/mobile" className="rq-back">&larr; Back</Link>

      <div className="rq-gate-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="rq-gate-id" style={{ fontSize: 20 }}>Pending Queue</div>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: online ? 'var(--rq-green)' : 'var(--rq-amber)',
            boxShadow: online ? '0 0 6px var(--rq-green)' : '0 0 6px var(--rq-amber)',
          }} />
        </div>
        <div className="rq-gate-meta">
          {pending.length} event{pending.length !== 1 ? 's' : ''} waiting to sync
          {!online && <> &middot; <span style={{ color: 'var(--rq-amber)' }}>OFFLINE</span></>}
        </div>
      </div>

      {/* Sync result */}
      {syncResult && (
        <div style={{
          margin: '14px 16px 0', padding: '12px',
          border: `1px solid ${syncResult.failed > 0 ? 'var(--rq-amber-dim)' : 'var(--rq-green-dim)'}`,
          background: syncResult.failed > 0 ? 'rgba(245,177,61,.04)' : 'rgba(62,213,152,.04)',
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
          color: syncResult.failed > 0 ? 'var(--rq-amber)' : 'var(--rq-green)',
        }}>
          Synced: {syncResult.synced} &middot; Failed: {syncResult.failed}
        </div>
      )}

      {/* Sync button */}
      <div style={{ padding: '14px 16px' }}>
        <button
          className="rq-btn-primary"
          onClick={handleSync}
          disabled={syncing || pending.length === 0}
        >
          {syncing ? 'Syncing...' : 'Retry Sync'}
        </button>
      </div>

      {/* Pending events */}
      {pending.length === 0 ? (
        <div className="rq-quiet" style={{ padding: '24px 16px' }}>No pending events</div>
      ) : (
        <>
          <div className="rq-eyebrow">Queued events</div>
          {pending.map((entry, i) => (
            <div key={entry.local_id || i} style={{
              margin: '0 16px 8px', padding: '12px',
              border: '1px solid var(--rq-line)', background: 'var(--rq-bg-1)',
            }}>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                fontWeight: 600, color: 'var(--rq-ink)',
              }}>
                {entry.submission.event_type.replace(/_/g, ' ')}
              </div>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                color: 'var(--rq-ink-3)', marginTop: 4,
              }}>
                {entry.submission.qr_target_id} &middot; {formatDateTime(entry.queued_at)}
                {entry.attempts > 0 && <> &middot; {entry.attempts} attempt{entry.attempts !== 1 ? 's' : ''}</>}
              </div>
              {entry.last_error && (
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                  color: 'var(--rq-red)', marginTop: 4,
                }}>
                  {entry.last_error}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      <div className="rq-quiet">SOI &middot; Offline Queue</div>
    </>
  );
}
