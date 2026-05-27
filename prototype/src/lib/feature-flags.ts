/**
 * SOI Feature Flags
 *
 * Debug mode gates demo/dev controls that should not
 * appear in normal operation.
 */

export function isDebugMode(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    localStorage.getItem('soi_debug') === 'true' ||
    new URLSearchParams(window.location.search).has('debug')
  );
}
