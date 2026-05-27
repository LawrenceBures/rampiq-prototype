'use client';

// SOI Phase 1 — Scan Input Handler (hardware abstraction layer).
// Accepts decoded strings from jsQR camera OR Zebra DataWedge keystrokes.
// Downstream code sees only: { decoded_value, source, timestamp }.

import type { ScanEvent, ScanSource } from '@/lib/soi-types';

type ScanCallback = (event: ScanEvent) => void;

let _callback: ScanCallback | null = null;

export function onScanDecoded(cb: ScanCallback): void {
  _callback = cb;
}

export function clearScanCallback(): void {
  _callback = null;
}

// Called by jsQR camera loop or manual entry
export function fireScanEvent(decodedValue: string, source: ScanSource): void {
  if (_callback) {
    _callback({
      decoded_value: decodedValue,
      source,
      timestamp: Date.now(),
    });
  }
}

// ============================================================
// ZEBRA DATAWEDGE — hidden input handler
// ============================================================
// DataWedge injects keystrokes into focused input.
// We watch for a complete QR value followed by Enter (carriage return).

let _datawedgeBuffer = '';
let _datawedgeTimer: ReturnType<typeof setTimeout> | null = null;

export function handleDatawedgeKeystroke(key: string): void {
  if (key === 'Enter') {
    const value = _datawedgeBuffer.trim();
    if (value) {
      fireScanEvent(value, 'datawedge_keystroke');
    }
    _datawedgeBuffer = '';
    if (_datawedgeTimer) clearTimeout(_datawedgeTimer);
    _datawedgeTimer = null;
    return;
  }

  _datawedgeBuffer += key;

  // Safety: clear buffer if no Enter within 500ms (not a scan)
  if (_datawedgeTimer) clearTimeout(_datawedgeTimer);
  _datawedgeTimer = setTimeout(() => {
    _datawedgeBuffer = '';
  }, 500);
}
