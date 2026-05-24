'use client';

import Link from 'next/link';

export default function RampIQLanding() {
  return (
    <>
      <div className="rq-gate-header">
        <div className="rq-gate-id">RampIQ</div>
        <div className="rq-gate-meta">
          LAX Eagle &middot; <b>Operational State</b>
        </div>
      </div>

      <div className="rq-eyebrow">Select surface</div>

      <Link href="/prototype/rampiq/mobile" className="rq-module">
        <div className="rq-module-icon">AG</div>
        <div>
          <div className="rq-module-name">Agent Mobile</div>
          <div className="rq-module-desc">Tasks &middot; QR scan &middot; operational updates</div>
        </div>
        <span className="rq-module-arrow">&rsaquo;</span>
      </Link>

      <Link href="/prototype/rampiq/operations/dispatch" className="rq-module">
        <div className="rq-module-icon">CC</div>
        <div>
          <div className="rq-module-name">Crew Chief Dispatch</div>
          <div className="rq-module-desc">Assignment &middot; orchestration &middot; gate readiness</div>
        </div>
        <span className="rq-module-arrow">&rsaquo;</span>
      </Link>

      <Link href="/prototype/rampiq/dashboard" className="rq-module">
        <div className="rq-module-icon">OM</div>
        <div>
          <div className="rq-module-name">Operations Monitor</div>
          <div className="rq-module-desc">Live events &middot; resolution &middot; patterns</div>
        </div>
        <span className="rq-module-arrow">&rsaquo;</span>
      </Link>

      <Link href="/prototype/rampiq/operations/workforce-pool" className="rq-module">
        <div className="rq-module-icon">WP</div>
        <div>
          <div className="rq-module-name">Workforce Pool</div>
          <div className="rq-module-desc">Live labor &middot; availability &middot; team builder</div>
        </div>
        <span className="rq-module-arrow">&rsaquo;</span>
      </Link>

      <Link href="/prototype/rampiq/workforce" className="rq-module">
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
        RampIQ &middot; Eagle Operations
      </div>
    </>
  );
}
