'use client';

// SOI Phase 1 — Agent identity management.
// Persists selected identity to localStorage so agents don't re-identify each page load.

import type { AgentIdentity } from '@/lib/soi-types';

// Storage key migrated: rampiq_agent_identity → soi_agent_identity
const IDENTITY_KEY = 'soi_agent_identity';
const LEGACY_KEY = 'rampiq_agent_identity';

export function getIdentity(): AgentIdentity | null {
  if (typeof window === 'undefined') return null;
  try {
    // Try new key first, fall back to legacy for migration
    let raw = localStorage.getItem(IDENTITY_KEY);
    if (!raw) {
      raw = localStorage.getItem(LEGACY_KEY);
      if (raw) localStorage.setItem(IDENTITY_KEY, raw); // migrate
    }
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function setIdentity(identity: AgentIdentity): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
}

export function clearIdentity(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(IDENTITY_KEY);
}

export function hasIdentity(): boolean {
  return getIdentity() !== null;
}
