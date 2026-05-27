'use client';

import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';

const QR_CODES = [
  { payload: 'LAX-GATE-52A',        label: '52A · Alpha',       type: 'Gate' },
  { payload: 'LAX-GATE-52B',        label: '52B · Bravo',       type: 'Gate' },
  { payload: 'LAX-GATE-52C',        label: '52C · Charlie',     type: 'Gate' },
  { payload: 'LAX-GATE-52D',        label: '52D · Delta',       type: 'Gate' },
  { payload: 'LAX-GATE-52E',        label: '52E · Echo',        type: 'Gate' },
  { payload: 'LAX-GATE-52F',        label: '52F · Foxtrot',     type: 'Gate' },
  { payload: 'LAX-GATE-52G',        label: '52G · Golf',        type: 'Gate' },
  { payload: 'LAX-GATE-52H',        label: '52H · Hotel',       type: 'Gate' },
  { payload: 'LAX-GATE-52I',        label: '52I · India',       type: 'Gate' },
  { payload: 'LAX-EQUIP-TUG-042',   label: 'Tug #42',           type: 'Equipment' },
  { payload: 'LAX-EQUIP-BELT-007',  label: 'Belt Loader #7',    type: 'Equipment' },
  { payload: 'LAX-EQUIP-GPU-031',   label: 'GPU #31',           type: 'Equipment' },
  { payload: 'LAX-EQUIP-LAV-003',   label: 'Lav Truck #3',      type: 'Equipment' },
  { payload: 'LAX-CHECK-RAMPCTL',      label: 'Ramp Control',      type: 'Checkpoint' },
  { payload: 'LAX-DISPATCH-BAGROOM',  label: 'Bag Room Dispatch', type: 'Dispatch' },
];

export default function QrAdminPage() {
  return (
    <>
      <Link href="/prototype/soi" className="rq-back">&larr; Back</Link>

      <div className="rq-gate-header">
        <div className="rq-gate-id" style={{ fontSize: 22 }}>
          QR Codes
        </div>
        <div className="rq-gate-meta">
          Admin &middot; Print or scan from phone
        </div>
      </div>

      <div className="rq-eyebrow">Test QR codes &middot; <b>{QR_CODES.length}</b></div>

      {QR_CODES.map((qr) => (
        <div
          key={qr.payload}
          style={{
            margin: '0 16px 14px',
            padding: 20,
            border: '1px solid var(--rq-line)',
            background: 'var(--rq-bg-1)',
            textAlign: 'center',
          }}
        >
          <div style={{
            display: 'inline-block',
            padding: 12,
            background: '#fff',
            marginBottom: 12,
          }}>
            <QRCodeSVG
              value={qr.payload}
              size={180}
              level="M"
              bgColor="#ffffff"
              fgColor="#000000"
            />
          </div>

          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--rq-ink)',
            marginBottom: 4,
          }}>
            {qr.label}
          </div>

          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            color: 'var(--rq-ink-3)',
            letterSpacing: '.1em',
            textTransform: 'uppercase' as const,
            marginBottom: 4,
          }}>
            {qr.type}
          </div>

          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9,
            color: 'var(--rq-ink-4)',
            letterSpacing: '.08em',
            wordBreak: 'break-all',
          }}>
            {qr.payload}
          </div>
        </div>
      ))}

      <div className="rq-explainer">
        <div className="rq-explainer-h">How to test</div>
        <div className="rq-explainer-msg">
          Open <b>/prototype/soi/mobile/scan</b> on a phone or use desktop webcam.
          Point camera at any QR code above to verify scanning workflow.
        </div>
      </div>

      <div className="rq-quiet">SOI &middot; QR Admin</div>
    </>
  );
}
