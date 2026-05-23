'use client';

import Link from 'next/link';

export default function RampIQLanding() {
  return (
    <>
      <div className="rq-gate-header">
        <div className="rq-gate-id">RampIQ</div>
        <div className="rq-gate-meta">
          Operational Memory System &middot; <b>LAX</b>
        </div>
      </div>

      <div className="rq-eyebrow">Select surface</div>

      <Link href="/prototype/rampiq/mobile" className="rq-module">
        <div className="rq-module-icon">AG</div>
        <div>
          <div className="rq-module-name">Agent Mobile</div>
          <div className="rq-module-desc">Scan QR &middot; report signals &middot; capture events</div>
        </div>
        <span className="rq-module-arrow">&rsaquo;</span>
      </Link>

      <Link href="/prototype/rampiq/dashboard" className="rq-module">
        <div className="rq-module-icon">MG</div>
        <div>
          <div className="rq-module-name">Manager Dashboard</div>
          <div className="rq-module-desc">Live events &middot; resolution &middot; patterns</div>
        </div>
        <span className="rq-module-arrow">&rsaquo;</span>
      </Link>

      <Link href="/prototype/rampiq/workforce" className="rq-module">
        <div className="rq-module-icon">OR</div>
        <div>
          <div className="rq-module-name">Operational Readiness</div>
          <div className="rq-module-desc">Workforce &middot; certifications &middot; equipment coverage</div>
        </div>
        <span className="rq-module-arrow">&rsaquo;</span>
      </Link>

      <div className="rq-explainer">
        <div className="rq-explainer-h">How to demo</div>
        <div className="rq-explainer-msg">
          Open Manager Dashboard on a laptop. Open Agent Mobile on a phone.
          Scan a QR code, submit a signal. Watch the dashboard update in real time.
          Manager can acknowledge and resolve events.
        </div>
      </div>

      <div className="rq-quiet">
        RampIQ &middot; Phase 1
      </div>
    </>
  );
}
