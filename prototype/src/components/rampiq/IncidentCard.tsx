// SOI — Canonical incident lifecycle card.
// Presentation-only. No data fetching. No side effects.
// Extracted from dashboard page for console layout reuse.

import { SeverityIndicator, OperationalStatus, ElapsedTime } from './index';
import type { Incident } from '@/lib/lifecycle-types';
import type { Severity } from '@/lib/rampiq-types';
import { INCIDENT_STATUS_LABELS, validTransitions } from '@/lib/operational-states';
import type { IncidentStatus } from '@/lib/operational-states';

interface IncidentCardProps {
  incident: Incident;
  isTransitioning?: boolean;
  onTransition?: (incidentId: string, newStatus: IncidentStatus) => void;
  onClick?: () => void;
  isSelected?: boolean;
}

export function IncidentCard({
  incident: inc,
  isTransitioning = false,
  onTransition,
  onClick,
  isSelected = false,
}: IncidentCardProps) {
  const nextStatuses = validTransitions('incident', inc.status);

  return (
    <div
      className={`rq-evt sev-${inc.severity.toLowerCase()}`}
      style={{ cursor: onClick ? 'pointer' : 'default', outline: isSelected ? '1px solid var(--rq-accent)' : undefined }}
      onClick={onClick}
    >
      {/* Row 1: title + age */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600,
          color: 'var(--rq-ink)',
        }}>
          {inc.title}
        </span>
        <span style={{ marginLeft: 'auto' }}>
          <ElapsedTime since={inc.opened_at} format="relative" showAgeColor />
        </span>
      </div>

      {/* Row 2: status + severity + location */}
      <div style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
        color: 'var(--rq-ink-3)', marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <OperationalStatus
          status={inc.status}
          label={INCIDENT_STATUS_LABELS[inc.status as IncidentStatus]}
          variant="pill"
        />
        <SeverityIndicator severity={inc.severity as Severity} variant="badge" />
        {inc.zone_id && <span>{inc.zone_id}</span>}
        {inc.gate_id && <span>{inc.gate_id}</span>}
        {inc.assigned_to && <span>&rarr; {inc.assigned_to}</span>}
      </div>

      {/* Description */}
      {inc.description && (
        <div style={{ fontSize: 12, color: 'var(--rq-ink-2)', marginTop: 5, lineHeight: 1.4 }}>
          {inc.description}
        </div>
      )}

      {/* Transition buttons */}
      {nextStatuses.length > 0 && onTransition && (
        <div className="rq-quick-actions">
          {nextStatuses.map(ns => (
            <button
              key={ns}
              className={`rq-qbtn ${ns === 'RESOLVED' || ns === 'CLOSED' ? 'qb-resolve' : ns === 'CONFIRMED' ? 'qb-ack' : 'qb-prog'}`}
              disabled={isTransitioning}
              onClick={(ev) => { ev.stopPropagation(); onTransition(inc.id, ns as IncidentStatus); }}
            >
              {isTransitioning ? '...' : INCIDENT_STATUS_LABELS[ns as IncidentStatus]}
            </button>
          ))}
        </div>
      )}

      {/* Debug metadata */}
      <div style={{
        marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--rq-line)',
        fontFamily: "'JetBrains Mono', monospace", fontSize: 8,
        color: 'var(--rq-ink-4)', display: 'flex', gap: 8, flexWrap: 'wrap',
      }}>
        <span>id: {inc.id.slice(0, 8)}</span>
        <span>corr: {inc.correlation_id.slice(0, 8)}</span>
        <span>status: {inc.status}</span>
        <span>by: {inc.created_by}</span>
      </div>
    </div>
  );
}
