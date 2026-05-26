'use client';

import { useState, useEffect } from 'react';
import { useLiveEvents, useRealtimeIncidents, useRecoveryActions } from '@/lib/store';
import { deriveDashboardState } from '@/lib/derived-operational-state';
import { analyzeOperationalPatterns } from '@/lib/operational-patterns';
import { deriveWorkforceCoordination } from '@/lib/workforce-coordination';
import { deriveOperationalOutcomes } from '@/lib/outcome-measurement';
import { deriveRecommendations } from '@/lib/recommendation-engine';
import { deriveInstitutionalMemory } from '@/lib/institutional-memory';
import { deriveWorkforceIntelligence } from '@/lib/workforce-intelligence';
import { deriveShiftContext, FIXTURE_OPERATORS } from '@/lib/auth-identity';
import type { AuthenticatedOperator } from '@/lib/auth-identity';
import { emitWorkforceAudit } from '@/lib/governance-audit';
import { deriveAnticipatoryState } from '@/lib/anticipatory-cognition';
import { generateOperationalNarratives } from '@/lib/operational-narrative';
import { deriveOrganizationalResilience } from '@/lib/organizational-resilience';
import { deriveConnectionHealth } from '@/lib/production-resilience';
import { ElapsedTime } from '@/components/rampiq';

// ============================================================
// ENTERPRISE OPERATIONAL INTELLIGENCE WORKSPACE
// ============================================================
// Separate from frontline coordination.
// For: station leadership, ops directors, enterprise operations.
// All data from the same operational truth pipeline.
// All access governance-audited.

type Section = 'health' | 'stability' | 'resilience' | 'replay' | 'workforce' | 'recommendations';

export default function EnterpriseWorkspace() {
  const { events, lastUpdated } = useLiveEvents(5000);
  const { incidents } = useRealtimeIncidents('LAX');
  const { actions: recoveryActions } = useRecoveryActions(null);
  const [section, setSection] = useState<Section>('health');
  const [operator] = useState<AuthenticatedOperator>(
    FIXTURE_OPERATORS.find(o => o.viewerRole === 'ops_director') ?? FIXTURE_OPERATORS[0]
  );
  const [auditLogged, setAuditLogged] = useState(false);

  // Governance: log enterprise workspace access
  useEffect(() => {
    if (!auditLogged) {
      emitWorkforceAudit({
        viewerId: operator.userId, viewerRole: operator.role,
        accessType: 'analytics_accessed',
      });
      setAuditLogged(true);
    }
  }, [auditLogged, operator]);

  // ── Derivation pipeline (same as frontline) ──
  const ds = deriveDashboardState(events);
  const { summary } = ds;
  const patterns = analyzeOperationalPatterns(events, incidents, recoveryActions);
  const workforce = deriveWorkforceCoordination(incidents, recoveryActions, events);
  const outcomes = deriveOperationalOutcomes(incidents, recoveryActions, events);
  const recommendations = deriveRecommendations(incidents, incidents, recoveryActions, events);
  const institutional = deriveInstitutionalMemory(incidents, recoveryActions, events);
  const workforceIntel = deriveWorkforceIntelligence(incidents, recoveryActions, events);
  const shiftCtx = deriveShiftContext(operator.userId, operator.shiftWindow, incidents, events);
  const anticipatory = deriveAnticipatoryState(incidents, recoveryActions, events);
  const narratives = generateOperationalNarratives(incidents, recoveryActions, events, anticipatory.stability, shiftCtx);
  const resilience = deriveOrganizationalResilience(incidents, recoveryActions, events);
  const connectionHealth = deriveConnectionHealth(lastUpdated, null);

  const mono: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 16px' }}>
      {/* Header */}
      <div style={{ padding: '12px 0', borderBottom: '1px solid var(--rq-line)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ ...mono, fontSize: 14, fontWeight: 700, color: 'var(--rq-accent)', letterSpacing: '.12em' }}>
          LAX
        </span>
        <span style={{ ...mono, fontSize: 10, color: 'var(--rq-ink-3)', textTransform: 'uppercase' }}>
          Enterprise Operations · {operator.displayName}
        </span>
        <div className="rq-pulse" />
        <span style={{
          ...mono, fontSize: 8, marginLeft: 'auto',
          color: connectionHealth.state === 'connected' ? 'var(--rq-green)' : connectionHealth.state === 'degraded' ? 'var(--rq-amber)' : 'var(--rq-red)',
        }}>
          {connectionHealth.statusText}
        </span>
      </div>

      {/* Section tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--rq-line)', margin: '0 0 12px' }}>
        {([
          { key: 'health' as const, label: 'Operational Health' },
          { key: 'stability' as const, label: 'Stability' },
          { key: 'resilience' as const, label: 'Resilience' },
          { key: 'replay' as const, label: 'Investigation' },
          { key: 'workforce' as const, label: 'Workforce' },
          { key: 'recommendations' as const, label: 'Intelligence' },
        ]).map(tab => (
          <button key={tab.key} type="button" onClick={() => setSection(tab.key)}
            style={{
              ...mono, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase',
              padding: '10px 16px', cursor: 'pointer', background: 'transparent', border: 'none',
              borderBottom: section === tab.key ? '2px solid var(--rq-accent)' : '2px solid transparent',
              color: section === tab.key ? 'var(--rq-accent)' : 'var(--rq-ink-3)',
              fontWeight: section === tab.key ? 700 : 400,
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── OPERATIONAL HEALTH ── */}
      {section === 'health' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {/* Pressure overview */}
          <MetricCard label="Active Pressure" value={`${summary.openCount} open`}
            detail={`${summary.critHighCount} critical/high · oldest ${summary.oldestOpen ? Math.round((Date.now() - new Date(summary.oldestOpen.created_at).getTime()) / 60_000) + 'm' : '—'}`}
            color={summary.critHighCount > 0 ? 'var(--rq-red)' : summary.openCount > 0 ? 'var(--rq-amber)' : 'var(--rq-green)'} />
          <MetricCard label="Incidents" value={`${incidents.length} active`}
            detail={`${incidents.filter(i => i.severity === 'CRITICAL').length} critical · ${incidents.filter(i => !i.resolved_at).length} unresolved`}
            color={incidents.filter(i => i.severity === 'CRITICAL').length > 0 ? 'var(--rq-red)' : 'var(--rq-amber)'} />
          <MetricCard label="Coordination Load"
            value={`${workforce.summary.needsSupportCount} need support`}
            detail={`${workforce.summary.saturatedCount} elevated · ${workforce.summary.stalledCoordinations} stalled · ${workforce.ownershipGaps.length} gaps`}
            color={workforce.summary.needsSupportCount > 0 ? 'var(--rq-red)' : 'var(--rq-amber)'} />

          {/* Pressure trend */}
          <MetricCard label="Pressure Trend" value={patterns.trends.pressureLabel || 'stable'}
            detail={`Peak: ${patterns.trends.peakBucketScore} · Sustained high: ${patterns.trends.sustainedHighMinutes}m`}
            color={patterns.trends.pressureState === 'rising' || patterns.trends.pressureState === 'deteriorating' ? 'var(--rq-red)' : 'var(--rq-ink-3)'} />
          <MetricCard label="Recovery Effectiveness"
            value={outcomes.aggregate.recoverySuccessRate !== null ? `${Math.round(outcomes.aggregate.recoverySuccessRate * 100)}%` : '—'}
            detail={outcomes.aggregate.avgTotalResolution !== null ? `Avg resolution: ${outcomes.aggregate.avgTotalResolution}m` : 'No resolved incidents'}
            color={outcomes.aggregate.recoverySuccessRate !== null && outcomes.aggregate.recoverySuccessRate >= 0.6 ? 'var(--rq-green)' : 'var(--rq-amber)'} />
          <MetricCard label="Shift Context"
            value={`${shiftCtx.inheritedIncidentCount} inherited`}
            detail={`${institutional.shiftHandoff?.openEscalations ?? 0} pending escalations · ${institutional.historyDepthHours}h history`}
            color={shiftCtx.inheritedIncidentCount > 0 ? 'var(--rq-amber)' : 'var(--rq-green)'} />

          {/* Escalation signals */}
          <div style={{ gridColumn: '1 / -1' }}>
            {/* Operational narratives */}
            <SectionHeader>Operational Summary</SectionHeader>
            {narratives.length === 0 && <EmptyState>No operational narratives</EmptyState>}
            {narratives.map((nar, i) => (
              <div key={i} style={{
                ...mono, fontSize: 10, padding: '5px 10px', marginBottom: 4,
                borderLeft: `2px solid ${nar.type === 'pressure_evolution' ? 'var(--rq-amber)' : nar.type === 'escalation_chain' ? 'var(--rq-red)' : 'var(--rq-blue)'}`,
                color: 'var(--rq-ink-2)', lineHeight: 1.4,
              }}>
                {nar.text}
                <div style={{ fontSize: 8, color: 'var(--rq-ink-4)', marginTop: 2 }}>
                  {nar.type.replace(/_/g, ' ')} · {nar.qualifier} · {nar.evidenceCount} data points
                </div>
              </div>
            ))}

            <SectionHeader>Active Escalation Signals</SectionHeader>
            {workforce.escalations.length === 0 && <EmptyState>No active escalation signals</EmptyState>}
            {workforce.escalations.slice(0, 6).map((esc, i) => (
              <div key={i} style={{
                ...mono, fontSize: 10, padding: '4px 10px', marginBottom: 4,
                borderLeft: `2px solid ${esc.severity === 'critical' ? 'var(--rq-red)' : 'var(--rq-amber)'}`,
                color: 'var(--rq-ink-2)',
              }}>
                <span style={{ color: esc.severity === 'critical' ? 'var(--rq-red)' : 'var(--rq-amber)', fontWeight: 600 }}>
                  {esc.severity.toUpperCase()}
                </span>
                {' '}{esc.title}
                <div style={{ fontSize: 9, color: 'var(--rq-ink-4)', marginTop: 1 }}>{esc.explanation}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── STABILITY ── */}
      {section === 'stability' && (
        <div>
          {/* Stability index */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <MetricCard label="Operational Stability" value={anticipatory.stability.direction}
              detail={anticipatory.stability.narrative}
              color={anticipatory.stability.direction === 'acute' ? 'var(--rq-red)' : anticipatory.stability.direction === 'destabilizing' ? 'var(--rq-amber)' : 'var(--rq-green)'} />
            <MetricCard label="Pressure Index" value={`${anticipatory.stability.overallPressure}/100`}
              detail={`${anticipatory.stability.durationMin}m since oldest unresolved · ${anticipatory.stability.components.filter(c => c.trend === 'degrading').length} degrading components`}
              color={anticipatory.stability.overallPressure >= 60 ? 'var(--rq-red)' : anticipatory.stability.overallPressure >= 30 ? 'var(--rq-amber)' : 'var(--rq-green)'} />
          </div>

          {/* Stability components */}
          <SectionHeader>Stability Components</SectionHeader>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {anticipatory.stability.components.map((comp, i) => (
              <div key={i} style={{
                ...mono, fontSize: 10, padding: '8px 10px', background: 'var(--rq-bg-1)',
                borderLeft: `2px solid ${comp.trend === 'degrading' ? 'var(--rq-red)' : comp.trend === 'improving' ? 'var(--rq-green)' : 'var(--rq-ink-3)'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600, color: 'var(--rq-ink)' }}>{comp.name}</span>
                  <span style={{ color: comp.trend === 'degrading' ? 'var(--rq-red)' : comp.trend === 'improving' ? 'var(--rq-green)' : 'var(--rq-ink-3)' }}>
                    {comp.pressure}/100 {comp.trend === 'degrading' ? '▲' : comp.trend === 'improving' ? '▼' : '—'}
                  </span>
                </div>
                <div style={{ fontSize: 9, color: 'var(--rq-ink-4)', marginTop: 2 }}>{comp.factors.join(' · ')}</div>
              </div>
            ))}
          </div>

          {/* Destabilization signals */}
          <SectionHeader>Destabilization Signals</SectionHeader>
          {anticipatory.destabilizationSignals.length === 0 && <EmptyState>No destabilization signals detected</EmptyState>}
          {anticipatory.destabilizationSignals.map((sig, i) => (
            <div key={i} style={{
              ...mono, fontSize: 10, padding: '6px 10px', marginBottom: 6,
              borderLeft: `2px solid ${sig.urgency === 'acute' ? 'var(--rq-red)' : sig.urgency === 'developing' ? 'var(--rq-amber)' : 'var(--rq-ink-3)'}`,
              background: 'var(--rq-bg-1)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600, color: 'var(--rq-ink)' }}>{sig.condition}</span>
                <span style={{
                  fontSize: 8, padding: '1px 5px', borderRadius: 2, textTransform: 'uppercase', letterSpacing: '.06em',
                  color: sig.urgency === 'acute' ? 'var(--rq-red)' : 'var(--rq-amber)',
                  background: sig.urgency === 'acute' ? 'rgba(255,92,92,.08)' : 'rgba(232,161,58,.08)',
                }}>
                  {sig.urgency}
                </span>
              </div>
              <div style={{ fontSize: 9, color: 'var(--rq-ink-3)', marginTop: 2 }}>{sig.evidence}</div>
              {sig.historicalContext && <div style={{ fontSize: 9, color: 'var(--rq-ink-4)', marginTop: 1, fontStyle: 'italic' }}>{sig.historicalContext}</div>}
            </div>
          ))}

          {/* Early recommendations */}
          <SectionHeader>Early Stabilization Recommendations</SectionHeader>
          {anticipatory.earlyRecommendations.length === 0 && <EmptyState>No early recommendations</EmptyState>}
          {anticipatory.earlyRecommendations.map((rec, i) => (
            <div key={i} style={{
              ...mono, fontSize: 10, padding: '8px 10px', marginBottom: 8,
              background: 'rgba(90,169,255,.04)', border: '1px solid rgba(90,169,255,.12)',
              borderLeft: '2px solid var(--rq-blue)',
            }}>
              <div style={{ fontWeight: 600, color: 'var(--rq-ink)', marginBottom: 3 }}>{rec.suggestion}</div>
              <div style={{ fontSize: 9, color: 'var(--rq-ink-3)', marginBottom: 2 }}>{rec.rationale}</div>
              <div style={{ fontSize: 9, color: 'var(--rq-ink-4)' }}>Historical: {rec.historicalBasis}</div>
              <div style={{ fontSize: 8, color: 'var(--rq-ink-4)', marginTop: 2, fontStyle: 'italic' }}>Limitation: {rec.limitation}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── RESILIENCE ── */}
      {section === 'resilience' && (
        <div>
          {/* Organizational resilience overview */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <MetricCard label="Organizational Resilience" value={resilience.overallState}
              detail={resilience.narrative}
              color={resilience.overallState === 'degraded' ? 'var(--rq-red)' : resilience.overallState === 'strained' ? 'var(--rq-amber)' : 'var(--rq-green)'} />
            <MetricCard label="Operational Debt" value={`${resilience.debt.debtScore} (${resilience.debt.trend})`}
              detail={resilience.debt.narrative}
              color={resilience.debt.trend === 'accumulating' ? 'var(--rq-red)' : resilience.debt.trend === 'reducing' ? 'var(--rq-green)' : 'var(--rq-ink-3)'} />
          </div>

          {/* Resilience dimensions */}
          <SectionHeader>Resilience Dimensions</SectionHeader>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
            {resilience.indicators.map((ind, i) => (
              <div key={i} style={{
                ...mono, fontSize: 10, padding: '8px 10px', background: 'var(--rq-bg-1)',
                borderLeft: `2px solid ${ind.state === 'weakening' ? 'var(--rq-red)' : ind.state === 'strengthening' ? 'var(--rq-green)' : 'var(--rq-ink-3)'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600, color: 'var(--rq-ink)' }}>{ind.dimension.replace(/_/g, ' ')}</span>
                  <span style={{ color: ind.state === 'weakening' ? 'var(--rq-red)' : ind.state === 'strengthening' ? 'var(--rq-green)' : 'var(--rq-ink-3)', textTransform: 'uppercase', fontSize: 8 }}>
                    {ind.state}
                  </span>
                </div>
                <div style={{ fontSize: 9, color: 'var(--rq-ink-3)', marginTop: 2 }}>{ind.evidence}</div>
                <div style={{ fontSize: 9, color: 'var(--rq-ink-4)', marginTop: 1, fontStyle: 'italic' }}>{ind.trend}</div>
              </div>
            ))}
          </div>

          {/* Recovery structure effectiveness */}
          {resilience.recoveryStructures.length > 0 && (
            <>
              <SectionHeader>Recovery Structure Effectiveness</SectionHeader>
              {resilience.recoveryStructures.map((rs, i) => (
                <div key={i} style={{
                  ...mono, fontSize: 10, padding: '4px 10px', marginBottom: 4,
                  borderLeft: `2px solid ${rs.successRate >= 0.6 ? 'var(--rq-green)' : rs.successRate >= 0.3 ? 'var(--rq-amber)' : 'var(--rq-red)'}`,
                  color: 'var(--rq-ink-2)',
                }}>
                  <span style={{ fontWeight: 600 }}>{rs.pattern}</span>
                  <span style={{ marginLeft: 8, color: 'var(--rq-ink-4)' }}>
                    {rs.occurrences}× · {Math.round(rs.successRate * 100)}% success
                    {rs.avgStabilizationMin !== null ? ` · avg ${rs.avgStabilizationMin}m` : ''}
                  </span>
                </div>
              ))}
            </>
          )}

          <SectionHeader>Recurring Operational Conditions</SectionHeader>
          {institutional.recurringConditions.length === 0 && <EmptyState>No recurring conditions detected</EmptyState>}
          {institutional.recurringConditions.map((cond, i) => (
            <div key={i} style={{
              ...mono, fontSize: 10, padding: '6px 10px', marginBottom: 6,
              borderLeft: `2px solid ${cond.significance === 'systemic' ? 'var(--rq-red)' : cond.significance === 'persistent' ? 'var(--rq-amber)' : 'var(--rq-ink-3)'}`,
              background: 'var(--rq-bg-1)',
            }}>
              <div style={{ fontWeight: 600, color: 'var(--rq-ink)' }}>{cond.condition}</div>
              <div style={{ fontSize: 9, color: 'var(--rq-ink-3)', marginTop: 2 }}>
                {cond.occurrences} occurrences · {cond.significance} · {cond.incidentIds.length} incidents
              </div>
            </div>
          ))}

          <SectionHeader>Pattern Insights</SectionHeader>
          {patterns.insights.slice(0, 8).map((ins, i) => (
            <div key={i} style={{
              ...mono, fontSize: 10, padding: '4px 10px', marginBottom: 4,
              borderLeft: `2px solid ${ins.severity === 'alert' ? 'var(--rq-red)' : 'var(--rq-amber)'}`,
              color: 'var(--rq-ink-2)',
            }}>
              <span style={{ fontSize: 7, color: 'var(--rq-ink-4)', marginRight: 6 }}>{ins.category.toUpperCase()}</span>
              {ins.title}
              <div style={{ fontSize: 9, color: 'var(--rq-ink-4)', marginTop: 1 }}>{ins.explanation}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── INVESTIGATION ── */}
      {section === 'replay' && (
        <div>
          <SectionHeader>Operational Investigation</SectionHeader>
          <div style={{ ...mono, fontSize: 10, color: 'var(--rq-ink-3)', padding: '8px 0' }}>
            Replay investigation is available on the <a href="/prototype/rampiq/dashboard" style={{ color: 'var(--rq-blue)' }}>Operations Console</a>.
            Use the Replay button to step through operational history with full lifecycle reconstruction.
          </div>

          <SectionHeader>Shift Handoff Summary</SectionHeader>
          {institutional.shiftHandoff ? (
            <div style={{ ...mono, fontSize: 10, color: 'var(--rq-ink-2)', padding: '4px 0' }}>
              {institutional.shiftHandoff.handoffNotes.map((note, i) => (
                <div key={i} style={{ padding: '3px 0', borderBottom: '1px solid var(--rq-line)' }}>· {note}</div>
              ))}
              <div style={{ fontSize: 9, color: 'var(--rq-ink-4)', marginTop: 6 }}>
                {institutional.shiftHandoff.unresolvedIncidents.length} unresolved incidents ·
                {' '}{institutional.shiftHandoff.activeRecoveryActions.length} active recovery actions ·
                {' '}pressure: {institutional.shiftHandoff.pressureAtHandoff}
              </div>
            </div>
          ) : <EmptyState>No active handoff context</EmptyState>}

          <SectionHeader>Outcome History</SectionHeader>
          {outcomes.pressureDeltas.slice(0, 8).map((delta, i) => (
            <div key={i} style={{
              ...mono, fontSize: 10, padding: '3px 10px', marginBottom: 2,
              borderLeft: `2px solid ${delta.outcome === 'improved' ? 'var(--rq-green)' : delta.outcome === 'worsened' ? 'var(--rq-red)' : 'var(--rq-ink-3)'}`,
              color: 'var(--rq-ink-3)',
            }}>
              {delta.actionType} → {delta.outcome}
              <span style={{ marginLeft: 8, fontSize: 9, color: 'var(--rq-ink-4)' }}>
                {delta.incidentsAtAction}→{delta.incidentsAt30m ?? '?'} incidents
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── WORKFORCE (governed, contextualized) ── */}
      {section === 'workforce' && (
        <div>
          <div style={{ ...mono, fontSize: 8, color: 'var(--rq-ink-4)', padding: '0 0 8px', letterSpacing: '.06em' }}>
            GOVERNANCE: All access to this surface is audited. Metrics include mandatory operational context.
          </div>

          <SectionHeader>System-Level Coordination Patterns</SectionHeader>
          {workforceIntel.systemPatterns.map((pattern, i) => (
            <div key={i} style={{
              ...mono, fontSize: 10, padding: '6px 10px', marginBottom: 6, background: 'var(--rq-bg-1)',
              borderLeft: '2px solid var(--rq-blue)',
            }}>
              <div style={{ color: 'var(--rq-ink)' }}>{pattern.observation}</div>
              <div style={{ fontSize: 9, color: 'var(--rq-ink-4)', marginTop: 2 }}>{pattern.contextNarrative}</div>
            </div>
          ))}

          <SectionHeader>Operator Coordination Context</SectionHeader>
          {workforceIntel.operators.map(op => (
            <div key={op.operatorId} style={{
              ...mono, fontSize: 10, padding: '6px 10px', marginBottom: 6, background: 'var(--rq-bg-1)',
              borderLeft: '2px solid var(--rq-ink-3)',
            }}>
              <div style={{ fontWeight: 600, color: 'var(--rq-ink)' }}>
                {op.operatorId} · {op.incidentsCoordinated} incidents coordinated
              </div>
              <div style={{ fontSize: 9, color: 'var(--rq-ink-4)', marginTop: 2 }}>
                Avg concurrent: {op.aggregateContext.avgActiveIncidents} ·
                Escalations: {op.aggregateContext.totalEscalationsHandled} ·
                Reassignments: {op.aggregateContext.totalReassignmentsParticipated}
              </div>
              {op.insights.slice(0, 3).map((ins, i) => (
                <div key={i} style={{
                  fontSize: 9, color: 'var(--rq-ink-3)', padding: '3px 0', marginTop: 2,
                  borderTop: '1px solid var(--rq-line)',
                }}>
                  <div>{ins.observation}</div>
                  <div style={{ color: 'var(--rq-ink-4)', fontStyle: 'italic' }}>{ins.contextNarrative}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ── INTELLIGENCE ── */}
      {section === 'recommendations' && (
        <div>
          <SectionHeader>Active Recommendations</SectionHeader>
          {recommendations.length === 0 && <EmptyState>No active recommendations</EmptyState>}
          {recommendations.map(rec => (
            <div key={rec.id} style={{
              ...mono, fontSize: 10, padding: '8px 10px', marginBottom: 8,
              background: 'rgba(90,169,255,.04)', border: '1px solid rgba(90,169,255,.15)',
              borderLeft: '2px solid var(--rq-blue)',
            }}>
              <div style={{ fontSize: 8, color: 'var(--rq-blue)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 3 }}>
                {rec.type === 'historical_similarity' ? 'operational memory suggests' : 'zone pressure analysis'}
              </div>
              <div style={{ fontWeight: 600, color: 'var(--rq-ink)' }}>{rec.title}</div>
              <div style={{ fontSize: 9, color: 'var(--rq-ink-3)', marginTop: 3, lineHeight: 1.3 }}>{rec.explanation}</div>
              {rec.suggestedActions.length > 0 && (
                <div style={{ fontSize: 9, color: 'var(--rq-ink-2)', marginTop: 4 }}>
                  {rec.suggestedActions.map((a, i) => <div key={i}>· {a}</div>)}
                </div>
              )}
              <div style={{ fontSize: 8, color: 'var(--rq-ink-4)', marginTop: 4 }}>{rec.confidenceNarrative}</div>
            </div>
          ))}

          <SectionHeader>Outcome Measurement</SectionHeader>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <MetricCard label="Avg Resolution" value={outcomes.aggregate.avgTotalResolution !== null ? `${outcomes.aggregate.avgTotalResolution}m` : '—'} detail="" color="var(--rq-ink-3)" />
            <MetricCard label="Recovery Rate" value={outcomes.aggregate.recoverySuccessRate !== null ? `${Math.round(outcomes.aggregate.recoverySuccessRate * 100)}%` : '—'} detail="" color={outcomes.aggregate.recoverySuccessRate !== null && outcomes.aggregate.recoverySuccessRate >= 0.6 ? 'var(--rq-green)' : 'var(--rq-amber)'} />
            <MetricCard label="Escalation Rate" value={outcomes.aggregate.escalationRate !== null ? `${Math.round(outcomes.aggregate.escalationRate * 100)}%` : '—'} detail="" color="var(--rq-ink-3)" />
          </div>
        </div>
      )}

      <div style={{ ...mono, fontSize: 8, color: 'var(--rq-ink-4)', padding: '16px 0', textAlign: 'center' }}>
        RampIQ · Enterprise Operational Intelligence
      </div>
    </div>
  );
}

// ── Shared UI components ──

function MetricCard({ label, value, detail, color }: { label: string; value: string; detail: string; color: string }) {
  return (
    <div style={{
      padding: '10px 12px', background: 'var(--rq-bg-1)', border: '1px solid var(--rq-line)',
      fontFamily: "'JetBrains Mono', monospace",
    }}>
      <div style={{ fontSize: 8, color: 'var(--rq-ink-4)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
      {detail && <div style={{ fontSize: 9, color: 'var(--rq-ink-3)', marginTop: 3 }}>{detail}</div>}
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
      color: 'var(--rq-ink-4)', letterSpacing: '.1em', textTransform: 'uppercase',
      padding: '10px 0 6px', borderBottom: '1px solid var(--rq-line)', marginBottom: 8,
    }}>
      {children}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
      color: 'var(--rq-ink-4)', padding: '12px 0',
    }}>
      {children}
    </div>
  );
}
