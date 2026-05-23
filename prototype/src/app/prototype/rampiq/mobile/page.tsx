'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useUsers } from '@/lib/store';
import { getIdentity, setIdentity, clearIdentity } from '@/lib/identity';
import { getQueueDepth } from '@/lib/offline-queue';
import { isOnline } from '@/lib/offline-queue';
import type { AgentIdentity, ShiftWindow, RoleType } from '@/lib/rampiq-types';

export default function AgentMobile() {
  const users = useUsers();
  const [identity, setId] = useState<AgentIdentity | null>(null);
  const [queueDepth, setQueueDepth] = useState(0);
  const [online, setOnline] = useState(true);

  // Load identity on mount
  useEffect(() => {
    setId(getIdentity());
    setOnline(isOnline());
    getQueueDepth().then(setQueueDepth).catch(() => {});

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  function handleSelectUser(userId: string) {
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
    setIdentity(newIdentity);
    setId(newIdentity);
  }

  function handleSignOut() {
    clearIdentity();
    setId(null);
  }

  // Not signed in — show identity selection
  if (!identity) {
    return (
      <>
        <div className="rq-gate-header">
          <div className="rq-gate-id" style={{ fontSize: 20 }}>Shift Start</div>
          <div className="rq-gate-meta">LAX &middot; <b>Select Identity</b></div>
        </div>

        <div className="rq-eyebrow">Who are you?</div>

        <div style={{ padding: '0 16px' }}>
          {users.map(u => (
            <button
              key={u.id}
              className="rq-module"
              style={{ width: '100%', textAlign: 'left', margin: '0 0 8px', border: '1px solid var(--rq-line)', cursor: 'pointer' }}
              onClick={() => handleSelectUser(u.id)}
            >
              <div className="rq-module-icon" style={{ width: 36, height: 36, fontSize: 12 }}>{u.id}</div>
              <div>
                <div className="rq-module-name" style={{ fontSize: 13 }}>{u.display_name || u.id}</div>
                <div className="rq-module-desc">{u.role_type.replace(/_/g, ' ')} &middot; {u.default_shift || 'AM'}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="rq-quiet">RampIQ &middot; Phase 1</div>
      </>
    );
  }

  // Signed in — show scan-ready state
  return (
    <>
      <div className="rq-gate-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="rq-gate-id" style={{ fontSize: 20 }}>Agent Mobile</div>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: online ? 'var(--rq-green)' : 'var(--rq-amber)',
            boxShadow: online ? '0 0 6px var(--rq-green)' : '0 0 6px var(--rq-amber)',
          }} />
        </div>
        <div className="rq-gate-meta">
          LAX &middot; <b>{identity.display_name}</b> &middot; {identity.role_type.replace(/_/g, ' ')} &middot; {identity.shift_window}
          {queueDepth > 0 && <> &middot; <span style={{ color: 'var(--rq-amber)' }}>{queueDepth} pending</span></>}
        </div>
      </div>

      {/* Primary action: Scan QR */}
      <div style={{ padding: '16px' }}>
        <Link
          href="/prototype/rampiq/mobile/scan"
          className="rq-btn-primary"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, textDecoration: 'none', fontSize: 14 }}
        >
          Scan QR Code
        </Link>
      </div>

      {/* Offline queue */}
      {queueDepth > 0 && (
        <Link
          href="/prototype/rampiq/mobile/queue"
          className="rq-module"
          style={{ margin: '0 16px 8px' }}
        >
          <div className="rq-module-icon" style={{ width: 36, height: 36, fontSize: 12, borderColor: 'var(--rq-amber)', color: 'var(--rq-amber)' }}>
            {queueDepth}
          </div>
          <div>
            <div className="rq-module-name" style={{ fontSize: 13 }}>Pending Events</div>
            <div className="rq-module-desc">Tap to retry sync</div>
          </div>
          <span className="rq-module-arrow">&rsaquo;</span>
        </Link>
      )}

      {/* QR targets quick reference */}
      <div className="rq-eyebrow">Quick actions</div>

      <Link href="/prototype/rampiq/mobile/scan" className="rq-module" style={{ margin: '0 16px 8px' }}>
        <div className="rq-module-icon" style={{ width: 36, height: 36, fontSize: 12 }}>QR</div>
        <div>
          <div className="rq-module-name" style={{ fontSize: 13 }}>Scan Equipment / Gate</div>
          <div className="rq-module-desc">Camera scan or manual entry</div>
        </div>
        <span className="rq-module-arrow">&rsaquo;</span>
      </Link>

      <Link href="/prototype/rampiq/mobile/profile" className="rq-module" style={{ margin: '0 16px 8px' }}>
        <div className="rq-module-icon" style={{ width: 36, height: 36, fontSize: 12 }}>ID</div>
        <div>
          <div className="rq-module-name" style={{ fontSize: 13 }}>My Profile</div>
          <div className="rq-module-desc">Certs &middot; quals &middot; shift &middot; activity</div>
        </div>
        <span className="rq-module-arrow">&rsaquo;</span>
      </Link>

      {/* Sign out */}
      <div style={{ padding: '16px' }}>
        <button className="rq-btn-secondary" onClick={handleSignOut} style={{ fontSize: 10 }}>
          Change Identity
        </button>
      </div>

      <div className="rq-quiet">RampIQ &middot; Phase 1</div>
    </>
  );
}
