// SOI — Incident detail panel for right rail.
// Presentation + controlled state. No data fetching.
// Renders incident card, event timeline, recovery actions.

import { ElapsedTime, IncidentCard } from './index';
import type { Incident, RecoveryAction } from '@/lib/lifecycle-types';
import type { SoiEvent, Severity } from '@/lib/soi-types';
import type { IncidentStatus, RecoveryActionStatus } from '@/lib/operational-states';
import { RECOVERY_ACTION_STATUS_LABELS, validTransitions } from '@/lib/operational-states';

interface IncidentDetailPanelProps {
  incident: Incident;
  incidentEvents: SoiEvent[];
  recoveryActions: RecoveryAction[];
  isTransitioning: boolean;
  onTransition: (incidentId: string, newStatus: IncidentStatus) => void;
  onBack: () => void;
  // Recovery action handlers
  onCreateRecoveryAction: (title: string, actionType: string, assignedTo: string, description: string) => void;
  onRecoveryTransition: (actionId: string, newStatus: RecoveryActionStatus) => void;
  raTransitioning: string | null;
  raSubmitting: boolean;
  showRecoveryForm: boolean;
  onToggleRecoveryForm: () => void;
}

const mono: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
};

export function IncidentDetailPanel({
  incident,
  incidentEvents,
  recoveryActions,
  isTransitioning,
  onTransition,
  onBack,
  onCreateRecoveryAction,
  onRecoveryTransition,
  raTransitioning,
  raSubmitting,
  showRecoveryForm,
  onToggleRecoveryForm,
}: IncidentDetailPanelProps) {
  return (
    <>
      <div className="rq-rail-header">
        <span>Incident Detail</span>
        <button type="button" onClick={onBack}
          style={{ background: 'none', border: 'none', color: 'var(--rq-ink-3)',
            cursor: 'pointer', ...mono, fontSize: 9 }}>
          back
        </button>
      </div>

      <div style={{ padding: '0 8px' }}>
        <IncidentCard
          incident={incident}
          isTransitioning={isTransitioning}
          onTransition={onTransition}
          isSelected
        />
      </div>

      {/* Lifecycle event timeline */}
      {incidentEvents.length > 0 && (
        <div style={{ padding: '6px 12px' }}>
          <div className="rq-rail-header" style={{ padding: '4px 0' }}>Event Timeline</div>
          {incidentEvents.map(ev => {
            // Visual markers for ownership/escalation events
            const isOwnership = ev.event_type.includes('reassigned') || ev.event_type.includes('handoff') || ev.event_type.includes('ownership');
            const isEscalation = ev.event_type.includes('escalation');
            const isRecovery = ev.event_type.includes('recovery_action');
            const markerColor = isEscalation ? 'var(--rq-red)' : isOwnership ? 'var(--rq-blue)' : isRecovery ? 'var(--rq-amber)' : undefined;
            return (
              <div key={ev.id} style={{
                ...mono, fontSize: 10,
                color: 'var(--rq-ink-3)', padding: '3px 0',
                borderBottom: '1px solid var(--rq-line)',
                borderLeft: markerColor ? `2px solid ${markerColor}` : undefined,
                paddingLeft: markerColor ? 6 : 0,
                display: 'flex', justifyContent: 'space-between', gap: 8,
              }}>
                <span style={{ color: markerColor ?? (ev.state_after ? 'var(--rq-ink-2)' : 'var(--rq-ink-3)') }}>
                  {ev.event_type.replace(/_/g, ' ')}
                </span>
                <ElapsedTime since={ev.created_at} format="relative" />
              </div>
            );
          })}
        </div>
      )}

      {/* Recovery Actions */}
      <RecoveryActionsSection
        actions={recoveryActions}
        showForm={showRecoveryForm}
        onToggleForm={onToggleRecoveryForm}
        onCreate={onCreateRecoveryAction}
        onTransition={onRecoveryTransition}
        transitioning={raTransitioning}
        submitting={raSubmitting}
      />

      {/* Compact metadata */}
      <div style={{
        padding: '6px 12px', ...mono,
        fontSize: 8, color: 'var(--rq-ink-4)', display: 'flex', gap: 8, flexWrap: 'wrap',
      }}>
        <span>id: {incident.id.slice(0, 8)}</span>
        <span>corr: {incident.correlation_id.slice(0, 8)}</span>
        <span>by: {incident.created_by}</span>
      </div>
    </>
  );
}

// ── Recovery Actions sub-section ──

interface RecoveryActionsSectionProps {
  actions: RecoveryAction[];
  showForm: boolean;
  onToggleForm: () => void;
  onCreate: (title: string, actionType: string, assignedTo: string, description: string) => void;
  onTransition: (actionId: string, newStatus: RecoveryActionStatus) => void;
  transitioning: string | null;
  submitting: boolean;
}

function RecoveryActionsSection({
  actions, showForm, onToggleForm, onCreate, onTransition, transitioning, submitting,
}: RecoveryActionsSectionProps) {
  // Local form state — kept here to avoid polluting parent
  const [title, setTitle] = React.useState('');
  const [actionType, setActionType] = React.useState('');
  const [role, setRole] = React.useState('');
  const [desc, setDesc] = React.useState('');

  function handleSubmit() {
    if (!title.trim()) return;
    onCreate(title.trim(), actionType, role, desc.trim());
    setTitle('');
    setActionType('');
    setRole('');
    setDesc('');
  }

  return (
    <div style={{ padding: '4px 12px' }}>
      <div className="rq-rail-header" style={{ padding: '4px 0' }}>
        <span>Recovery Actions</span>
        <span style={{ ...mono, fontSize: 9, color: 'var(--rq-ink-4)' }}>{actions.length}</span>
      </div>

      <button type="button" onClick={onToggleForm}
        style={{
          width: '100%', padding: '4px 8px', marginBottom: 4,
          ...mono, fontSize: 9, letterSpacing: '.06em', textTransform: 'uppercase',
          background: 'var(--rq-bg-2)', border: '1px solid var(--rq-line)',
          color: 'var(--rq-ink-3)', cursor: 'pointer',
        }}
      >
        {showForm ? 'Cancel' : '+ Propose Action'}
      </button>

      {showForm && (
        <div style={{ padding: '6px 0', borderBottom: '1px solid var(--rq-line)', marginBottom: 4 }}>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Action title"
            style={{ width: '100%', padding: '5px 8px', marginBottom: 4,
              background: 'var(--rq-bg-2)', border: '1px solid var(--rq-line-2)',
              color: 'var(--rq-ink)', ...mono, fontSize: 11 }}
          />
          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <select value={actionType} onChange={e => setActionType(e.target.value)}
              style={{ flex: 1, padding: '4px 6px', background: 'var(--rq-bg-2)',
                border: '1px solid var(--rq-line-2)', color: 'var(--rq-ink)', ...mono, fontSize: 10 }}>
              <option value="">Type</option>
              <option value="DISPATCH">Dispatch</option>
              <option value="EQUIPMENT_SWAP">Equip Swap</option>
              <option value="PERSONNEL">Personnel</option>
              <option value="ESCALATION">Escalation</option>
              <option value="OTHER">Other</option>
            </select>
            <select value={role} onChange={e => setRole(e.target.value)}
              style={{ flex: 1, padding: '4px 6px', background: 'var(--rq-bg-2)',
                border: '1px solid var(--rq-line-2)', color: 'var(--rq-ink)', ...mono, fontSize: 10 }}>
              <option value="">Assign</option>
              <option value="CREW_CHIEF">Crew Chief</option>
              <option value="LT_RUNNER">LT / Runner</option>
              <option value="RAMP_AGENT">Ramp Agent</option>
              <option value="LAV_TECH">LAV Tech</option>
              <option value="OPS">Ops</option>
            </select>
          </div>
          <input type="text" value={desc} onChange={e => setDesc(e.target.value)}
            placeholder="Notes (optional)"
            style={{ width: '100%', padding: '5px 8px', marginBottom: 4,
              background: 'var(--rq-bg-2)', border: '1px solid var(--rq-line-2)',
              color: 'var(--rq-ink)', ...mono, fontSize: 10 }}
          />
          <button type="button" disabled={!title.trim() || submitting}
            onClick={handleSubmit} className="rq-qbtn qb-ack"
            style={{ width: '100%', padding: '5px', fontSize: 9 }}>
            {submitting ? 'Creating...' : 'Create Action'}
          </button>
        </div>
      )}

      {actions.length === 0 && !showForm && (
        <div style={{ ...mono, fontSize: 10, color: 'var(--rq-ink-4)', padding: '4px 0' }}>
          No recovery actions yet
        </div>
      )}

      {actions.map(ra => {
        const nextStatuses = validTransitions('recovery_action', ra.status);
        const isTransitioning = transitioning === ra.id;
        const statusColor = ra.status === 'ACTIVE' ? 'var(--rq-green)'
          : ra.status === 'BLOCKED' ? 'var(--rq-red)'
          : ra.status === 'COMPLETE' ? 'var(--rq-green)'
          : 'var(--rq-ink-3)';

        return (
          <div key={ra.id} style={{ padding: '5px 0', borderBottom: '1px solid var(--rq-line)' }}>
            <div style={{
              ...mono, fontSize: 11, fontWeight: 600,
              color: 'var(--rq-ink)', display: 'flex', justifyContent: 'space-between',
            }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>
                {ra.title}
              </span>
              <ElapsedTime since={ra.created_at} format="relative" />
            </div>
            <div style={{ ...mono, fontSize: 9, color: 'var(--rq-ink-4)', marginTop: 1, display: 'flex', gap: 6 }}>
              <span style={{ color: statusColor, fontWeight: 600 }}>
                {RECOVERY_ACTION_STATUS_LABELS[ra.status]}
              </span>
              {ra.action_type && <span>{ra.action_type}</span>}
              {ra.assigned_to && <span>&rarr; {ra.assigned_to}</span>}
            </div>
            {ra.description && (
              <div style={{ ...mono, fontSize: 10, color: 'var(--rq-ink-3)', marginTop: 2 }}>
                {ra.description}
              </div>
            )}
            {nextStatuses.length > 0 && (
              <div style={{ display: 'flex', gap: 3, marginTop: 3 }}>
                {nextStatuses.map(ns => (
                  <button key={ns} type="button"
                    className={`rq-qbtn ${ns === 'COMPLETE' ? 'qb-resolve' : ns === 'ACKNOWLEDGED' ? 'qb-ack' : ns === 'WITHDRAWN' || ns === 'ESCALATED' ? 'qb-resolve' : 'qb-prog'}`}
                    style={{ padding: '1px 6px', fontSize: 8 }}
                    disabled={isTransitioning}
                    onClick={() => onTransition(ra.id, ns as RecoveryActionStatus)}>
                    {isTransitioning ? '...' : RECOVERY_ACTION_STATUS_LABELS[ns as RecoveryActionStatus]}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Need React import for useState in RecoveryActionsSection
import React from 'react';
