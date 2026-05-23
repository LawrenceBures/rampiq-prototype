'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { resolveQrTarget } from '@/lib/store';
import { fireScanEvent, onScanDecoded, clearScanCallback } from '@/lib/scan-input';
import { getIdentity } from '@/lib/identity';
import { isZebra } from '@/lib/rampiq-types';
import type { QrTarget, ScanEvent } from '@/lib/rampiq-types';

export default function ScanPage() {
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const [cameraState, setCameraState] = useState<'idle' | 'requesting' | 'active' | 'error'>('idle');
  const [cameraError, setCameraError] = useState('');
  const [unknownQr, setUnknownQr] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const zebraInputRef = useRef<HTMLInputElement | null>(null);

  const isZebraDevice = typeof navigator !== 'undefined' && isZebra();

  // Register scan callback
  useEffect(() => {
    // Check identity
    const identity = getIdentity();
    if (!identity) {
      router.replace('/prototype/rampiq/mobile');
      return;
    }

    onScanDecoded(async (event: ScanEvent) => {
      await handleScanResult(event.decoded_value);
    });

    // On Zebra, auto-focus hidden input
    if (isZebraDevice && zebraInputRef.current) {
      zebraInputRef.current.focus();
    }

    return () => {
      clearScanCallback();
      stopCamera();
    };
  }, []);

  // ============================================================
  // QR RESOLUTION
  // ============================================================

  async function handleScanResult(decodedValue: string) {
    // Stop scanning while we resolve
    stopScanning();

    const target = await resolveQrTarget(decodedValue);
    if (!target) {
      setUnknownQr(decodedValue);
      return;
    }

    // Navigate to report form with target context
    const params = new URLSearchParams({ target: decodedValue });
    router.push(`/prototype/rampiq/mobile/report?${params.toString()}`);
  }

  // ============================================================
  // CAMERA (jsQR path)
  // ============================================================

  async function openCamera() {
    setCameraError('');
    setUnknownQr(null);
    setCameraState('requesting');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;

      const v = videoRef.current;
      if (!v) throw new Error('Video element ref is null');

      v.srcObject = stream;
      v.playsInline = true;
      v.muted = true;
      v.setAttribute('playsinline', '');
      v.setAttribute('webkit-playsinline', '');
      await v.play();

      setCameraState('active');
      setScanning(true);
      startScanLoop();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setCameraError(msg);
      setCameraState('error');
    }
  }

  function startScanLoop() {
    let jsQR: typeof import('jsqr').default | null = null;

    import('jsqr').then(mod => {
      jsQR = mod.default;
    }).catch(() => {});

    scanTimerRef.current = setInterval(() => {
      if (!jsQR) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;
      if (video.readyState < 2 || video.videoWidth === 0) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      try {
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code && code.data) {
          fireScanEvent(code.data, 'camera_jsqr');
        }
      } catch { /* silent */ }
    }, 400);
  }

  function stopScanning() {
    if (scanTimerRef.current) {
      clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    setScanning(false);
  }

  function stopCamera() {
    stopScanning();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraState('idle');
  }

  // ============================================================
  // ZEBRA DATAWEDGE (hidden input path)
  // ============================================================

  function handleZebraInput(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value.trim();
    if (value) {
      fireScanEvent(value, 'datawedge_keystroke');
      e.target.value = '';
    }
  }

  function handleZebraKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      const value = (e.target as HTMLInputElement).value.trim();
      if (value) {
        fireScanEvent(value, 'datawedge_keystroke');
        (e.target as HTMLInputElement).value = '';
      }
    }
  }

  // ============================================================
  // MANUAL ENTRY
  // ============================================================

  function handleManualSubmit() {
    const value = manualInput.trim();
    if (!value) return;
    setManualInput('');
    fireScanEvent(value, 'manual_entry');
  }

  // ============================================================
  // RENDER
  // ============================================================

  const showOpenButton = !isZebraDevice && cameraState === 'idle' && !unknownQr;

  return (
    <>
      <Link href="/prototype/rampiq/mobile" className="rq-back">&larr; Back</Link>

      <div className="rq-gate-header">
        <div className="rq-gate-id" style={{ fontSize: 22 }}>Scan QR</div>
        <div className="rq-gate-meta">
          {isZebraDevice ? 'Press scan trigger' : 'Point camera at QR code'}
        </div>
      </div>

      {/* Zebra: hidden input always focused */}
      {isZebraDevice && (
        <div style={{ padding: '24px 16px', textAlign: 'center' }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
            color: 'var(--rq-ink-2)', letterSpacing: '.1em', textTransform: 'uppercase' as const,
          }}>
            Press hardware scan trigger
          </div>
          <input
            ref={zebraInputRef}
            type="text"
            style={{ position: 'absolute', left: -9999, opacity: 0 }}
            onChange={handleZebraInput}
            onKeyDown={handleZebraKeyDown}
            autoFocus
          />
        </div>
      )}

      {/* Camera viewport — always in DOM for ref, hidden when not active */}
      <div style={{
        margin: '0 16px 14px', background: '#000',
        border: '1px solid var(--rq-line)', overflow: 'hidden',
        position: 'relative',
        display: cameraState === 'active' ? 'block' : 'none',
      }}>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          style={{ width: '100%', display: 'block', maxHeight: 400 }}
        />
        {scanning && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'rgba(0,0,0,.6)', padding: '8px 12px', textAlign: 'center',
            fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
            color: 'var(--rq-green)', textTransform: 'uppercase' as const, letterSpacing: '.12em',
          }}>
            Scanning for QR code...
          </div>
        )}
      </div>
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Camera requesting */}
      {cameraState === 'requesting' && (
        <div style={{
          margin: '0 16px 14px', padding: '20px', textAlign: 'center',
          border: '1px solid var(--rq-line)', background: 'var(--rq-bg-1)',
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
          color: 'var(--rq-ink-3)', textTransform: 'uppercase' as const, letterSpacing: '.1em',
        }}>
          Requesting camera...
        </div>
      )}

      {/* Open camera button */}
      {showOpenButton && (
        <div style={{ padding: '0 16px 8px' }}>
          <button className="rq-btn-primary" onClick={openCamera}>Open Scanner</button>
        </div>
      )}

      {/* Camera active: stop button */}
      {cameraState === 'active' && (
        <div style={{ padding: '0 16px 8px' }}>
          <button className="rq-btn-secondary" onClick={stopCamera}>Stop Camera</button>
        </div>
      )}

      {/* Camera error */}
      {cameraState === 'error' && (
        <div style={{ padding: '0 16px 8px' }}>
          <div style={{
            padding: '12px', marginBottom: 8,
            border: '1px solid var(--rq-red-dim)', background: 'rgba(255,92,92,.04)',
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
            color: 'var(--rq-red)', wordBreak: 'break-word',
          }}>
            Camera error: {cameraError}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="rq-btn-secondary" onClick={() => setCameraState('idle')} style={{ flex: 1 }}>Dismiss</button>
            <button className="rq-btn-secondary" onClick={openCamera} style={{ flex: 1 }}>Retry</button>
          </div>
        </div>
      )}

      {/* Unknown QR */}
      {unknownQr && (
        <div style={{
          margin: '0 16px 14px', padding: '14px',
          border: '1px solid var(--rq-amber-dim)', background: 'rgba(245,177,61,.04)',
        }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
            color: 'var(--rq-amber)', letterSpacing: '.14em', textTransform: 'uppercase' as const,
            fontWeight: 700, marginBottom: 8,
          }}>
            Unknown QR Code
          </div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
            color: 'var(--rq-ink-2)', wordBreak: 'break-all', marginBottom: 12,
          }}>
            {unknownQr}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="rq-btn-secondary" onClick={() => { setUnknownQr(null); openCamera(); }} style={{ flex: 1 }}>
              Scan Again
            </button>
          </div>
        </div>
      )}

      {/* Manual entry */}
      <div className="rq-eyebrow">Manual entry</div>
      <div className="rq-field">
        <input
          type="text"
          className="rq-select"
          placeholder="e.g. LAX-GATE-G42B"
          value={manualInput}
          onChange={e => setManualInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleManualSubmit(); }}
        />
      </div>
      <div style={{ padding: '0 16px 8px' }}>
        <button className="rq-btn-secondary" onClick={handleManualSubmit} disabled={!manualInput.trim()}>
          Process QR Value
        </button>
      </div>

      {/* Reference */}
      <div className="rq-explainer">
        <div className="rq-explainer-h">Supported QR values</div>
        <div className="rq-explainer-msg" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>
          LAX-GATE-G42B &mdash; Gate<br />
          LAX-EQUIP-TUG-042 &mdash; Equipment<br />
          LAX-CHECK-RAMPCTL &mdash; Checkpoint
        </div>
      </div>

      <div className="rq-quiet">RampIQ &middot; QR Scan</div>
    </>
  );
}
