// RampIQ — Canonical event card.
// Presentation-only. No data fetching. No side effects.
// Extracted from dashboard page for console layout reuse.

import { SeverityIndicator, OperationalStatus, ElapsedTime } from './index';
import { formatTime, durationLabel, STATUS_LABELS } from '@/lib/rampiq-types';
import type { RampiqEvent, Severity, OperationalStatus as OpStatus } from '@/lib/rampiq-types';
import { isOpen, agingClass } from '@/lib/derived-operational-state';

interface EventCardProps {
  event: RampiqEvent;
  showAging?: boolean;
  isExpanded?: boolean;
  isUpdating?: boolean;
  isNew?: boolean;
  onToggleExpand?: () => void;
  onStatusChange?: (eventId: string, status: OpStatus, ev: React.MouseEvent) => void;
}

function DItem({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div style={{ padding: '2px 0' }}>
      <span style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
        color: 'var(--rq-ink-4)', letterSpacing: '.06em', textTransform: 'uppercase' as const,
      }}>
        {label}
      </span>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--rq-ink-2)' }}>
        {children ?? value ?? '—'}
      </div>
    </div>
  );
}

function sevClass(sev: Severity): string {
  return `sev-${sev.toLowerCase()}`;
}

export function EventCard({
  event: e,
  showAging = false,
  isExpanded = false,
  isUpdating = false,
  isNew = false,
  onToggleExpand,
  onStatusChange,
}: EventCardProps) {
  const classes = [
    'rq-evt',
    sevClass(e.severity as Severity),
    showAging ? agingClass(e) : '',
    isNew ? 'is-new' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={classes} onClick={onToggleExpand}>
      {/* Row 1: type + location + age */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600,
          color: 'var(--rq-ink)',
        }}>
          {e.event_type.replace(/_/g, ' ')}
        </span>
        {e.gate_id && (
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--rq-ink-3)' }}>
            {e.gate_id}
          </span>
        )}
        {e.equipment_id && (
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--rq-ink-3)' }}>
            {e.equipment_id}
          </span>
        )}
        <span style={{ marginLeft: 'auto' }}>
          <ElapsedTime since={e.created_at} format="relative" showAgeColor={isOpen(e)} />
        </span>
      </div>

      {/* Row 2: status + reporter + severity */}
      <div style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
        color: 'var(--rq-ink-3)', marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <OperationalStatus
          status={e.operational_status}
          label={STATUS_LABELS[e.operational_status as OpStatus]}
          variant="pill"
        />
        <SeverityIndicator severity={e.severity as Severity} variant="badge" />
        <span>{e.reported_by}</span>
        <span>{e.shift_window}</span>
        {e.event_duration_seconds != null && (
          <span style={{ color: 'var(--rq-ink-4)' }}>{durationLabel(e.event_duration_seconds)}</span>
        )}
      </div>

      {/* Notes */}
      {e.notes && (
        <div style={{ fontSize: 12, color: 'var(--rq-ink-2)', marginTop: 5, lineHeight: 1.4 }}>
          {e.notes}
        </div>
      )}

      {/* Quick actions */}
      {isOpen(e) && onStatusChange && (
        <div className="rq-quick-actions">
          {e.operational_status === 'OPEN' && (
            <button className="rq-qbtn qb-ack" disabled={isUpdating}
              onClick={(ev) => onStatusChange(e.id, 'ACKNOWLEDGED', ev)}>
              Ack
            </button>
          )}
          {(e.operational_status === 'OPEN' || e.operational_status === 'ACKNOWLEDGED') && (
            <button className="rq-qbtn qb-prog" disabled={isUpdating}
              onClick={(ev) => onStatusChange(e.id, 'IN_PROGRESS', ev)}>
              In Prog
            </button>
          )}
          <button className="rq-qbtn qb-resolve" disabled={isUpdating}
            onClick={(ev) => onStatusChange(e.id, 'RESOLVED', ev)}>
            {isUpdating ? '...' : 'Resolve'}
          </button>
        </div>
      )}

      {/* Expanded detail */}
      {isExpanded && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--rq-line)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 12px' }}>
            <DItem label="Severity">
              <SeverityIndicator severity={e.severity as Severity} variant="pill" />
            </DItem>
            <DItem label="Status">
              <OperationalStatus
                status={e.operational_status}
                label={STATUS_LABELS[e.operational_status as OpStatus]}
                variant="pill"
              />
            </DItem>
            <DItem label="Reporter" value={`${e.reported_by} (${e.role_type.replace(/_/g, ' ')})`} />
            <DItem label="Shift" value={e.shift_window} />
            <DItem label="Device" value={e.device_id} />
            <DItem label="Platform" value={e.source_platform} />
            <DItem label="Target" value={`${e.qr_target_type} · ${e.qr_target_id}`} />
            <DItem label="Reported" value={formatTime(e.created_at)} />
            {e.resolved_at && <DItem label="Resolved at" value={formatTime(e.resolved_at)} />}
            {e.resolved_by && <DItem label="Resolved by" value={e.resolved_by} />}
            {e.event_duration_seconds != null && <DItem label="Duration" value={durationLabel(e.event_duration_seconds)} />}
          </div>
        </div>
      )}
    </div>
  );
}
