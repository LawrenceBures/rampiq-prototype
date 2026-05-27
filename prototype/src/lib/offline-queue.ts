'use client';

// SOI Phase 1 — Offline event queue.
// Stores events in IndexedDB when offline, syncs when connection returns.

import type { EventSubmission } from './rampiq-types';
import { postEvent } from './store';

const DB_NAME = 'rampiq_offline';
const DB_VERSION = 1;
const STORE_NAME = 'pending_events';

// ============================================================
// IndexedDB helpers
// ============================================================

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'local_id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface QueuedEvent {
  local_id?: number;
  submission: EventSubmission;
  queued_at: string;
  attempts: number;
  last_error: string | null;
}

export async function queueEvent(submission: EventSubmission): Promise<QueuedEvent> {
  const entry: QueuedEvent = {
    submission: {
      ...submission,
      offline_created_at: submission.offline_created_at || new Date().toISOString(),
    },
    queued_at: new Date().toISOString(),
    attempts: 0,
    last_error: null,
  };

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.add(entry);
    req.onsuccess = () => {
      entry.local_id = req.result as number;
      resolve(entry);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getPendingEvents(): Promise<QueuedEvent[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as QueuedEvent[]);
    req.onerror = () => reject(req.error);
  });
}

export async function removeQueuedEvent(localId: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(localId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function updateQueuedEvent(entry: QueuedEvent): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(entry);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getQueueDepth(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ============================================================
// SYNC
// ============================================================

export async function syncQueue(): Promise<{ synced: number; failed: number }> {
  const pending = await getPendingEvents();
  let synced = 0;
  let failed = 0;

  for (const entry of pending) {
    try {
      await postEvent(entry.submission);
      await removeQueuedEvent(entry.local_id!);
      synced++;
    } catch (err) {
      failed++;
      entry.attempts++;
      entry.last_error = err instanceof Error ? err.message : String(err);
      await updateQueuedEvent(entry);
    }
  }

  return { synced, failed };
}

// ============================================================
// CONNECTIVITY
// ============================================================

export function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

export function onConnectivityChange(cb: (online: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onOnline = () => cb(true);
  const onOffline = () => cb(false);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };
}
