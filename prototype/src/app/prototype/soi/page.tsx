'use client';

import Link from 'next/link';

export default function SOILanding() {
  return (
    <div className="rq-device" style={{ margin: '0 auto' }}>
      <header className="rq-topbar">
        <div className="rq-topbar-row">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="SOI" style={{ width: 28, height: 28, borderRadius: 6 }} />
          <span className="rq-brand-text" style={{ fontSize: 11, letterSpacing: '.06em' }}>
            Systems Operational Intelligence
          </span>
          <div className="rq-topbar-meta">
            <span>LAX</span>
            <span>&middot;</span>
            <span className="rq-pulse" />
          </div>
        </div>
      </header>

      <div className="rq-gate-header">
        <div className="rq-gate-id">SOI</div>
        <div className="rq-gate-meta">
          LAX Eagle &middot; <b>Operational State</b>
        </div>
      </div>

      <div className="rq-eyebrow">Select surface</div>

      <Link href="/prototype/soi/mobile" className="rq-module">
        <div className="rq-module-icon">AG</div>
        <div>
          <div className="rq-module-name">Agent Mobile</div>
          <div className="rq-module-desc">Tasks &middot; QR scan &middot; operational updates</div>
        </div>
        <span className="rq-module-arrow">&rsaquo;</span>
      </Link>

      <Link href="/prototype/soi/operations/dispatch" className="rq-module">
        <div className="rq-module-icon">CC</div>
        <div>
          <div className="rq-module-name">Crew Chief Dispatch</div>
          <div className="rq-module-desc">Assignment &middot; orchestration &middot; gate readiness</div>
        </div>
        <span className="rq-module-arrow">&rsaquo;</span>
      </Link>

      <Link href="/prototype/soi/dashboard" className="rq-module">
        <div className="rq-module-icon">OM</div>
        <div>
          <div className="rq-module-name">Operations Monitor</div>
          <div className="rq-module-desc">Live events &middot; resolution &middot; patterns</div>
        </div>
        <span className="rq-module-arrow">&rsaquo;</span>
      </Link>

      <Link href="/prototype/soi/operations/flights" className="rq-module">
        <div className="rq-module-icon">FL</div>
        <div>
          <div className="rq-module-name">Flight Ops</div>
          <div className="rq-module-desc">Gate demand &middot; turn windows &middot; assignment planning</div>
        </div>
        <span className="rq-module-arrow">&rsaquo;</span>
      </Link>

      <Link href="/prototype/soi/operations/workforce-pool" className="rq-module">
        <div className="rq-module-icon">WP</div>
        <div>
          <div className="rq-module-name">Workforce Pool</div>
          <div className="rq-module-desc">Live labor &middot; availability &middot; team builder</div>
        </div>
        <span className="rq-module-arrow">&rsaquo;</span>
      </Link>

      <Link href="/prototype/soi/workforce" className="rq-module">
        <div className="rq-module-icon">OR</div>
        <div>
          <div className="rq-module-name">Operational Readiness</div>
          <div className="rq-module-desc">Certifications &middot; equipment coverage</div>
        </div>
        <span className="rq-module-arrow">&rsaquo;</span>
      </Link>

      <div className="rq-explainer">
        <div className="rq-explainer-h">Operational flow</div>
        <div className="rq-explainer-msg">
          Crew Chief dispatches assignments from Dispatch board.
          Agents receive tasks on mobile, acknowledge, scan gates, complete readiness.
          Operations Monitor shows live operational state.
        </div>
      </div>

      <div className="rq-quiet">
        SOI &middot; Eagle Operations
      </div>
    </div>
  );
}
