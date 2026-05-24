'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useOperationalReadiness, useUsers } from '@/lib/store';
import { durationLabel, ROLE_LABELS } from '@/lib/rampiq-types';
import type { ShiftWindow } from '@/lib/rampiq-types';

export default function WorkforceReadinessPage() {
  const [shift, setShift] = useState<ShiftWindow>('AM');
  const readiness = useOperationalReadiness('LAX', shift);
  const { users } = useUsers();

  return (
    <div className="rq-ops-board">
      <Link href="/prototype/rampiq" className="rq-back">&larr; Back</Link>

      {/* Header */}
      <div className="rq-gate-header">
        <div className="rq-gate-id" style={{ fontSize: 20 }}>Operational Readiness</div>
        <div className="rq-gate-meta">
          LAX &middot; <b>Workforce Visibility</b>
        </div>
      </div>

      {/* Shift filter */}
      <div className="rq-filters">
        {(['AM', 'PM', 'OVERNIGHT'] as ShiftWindow[]).map(s => (
          <button key={s} className={`rq-chip${shift === s ? ' active' : ''}`}
            onClick={() => setShift(s)}>
            {s}
          </button>
        ))}
      </div>

      {!readiness ? (
        <div className="rq-quiet" style={{ padding: '32px 16px' }}>Loading readiness data...</div>
      ) : (
        <>
          {/* KPIs */}
          <div className="rq-kpis rq-kpis-4">
            <div className="rq-kpi">
              <div className="rq-kpi-lbl">On Shift</div>
              <div className={`rq-kpi-val${readiness.total_on_shift > 0 ? ' rq-v-g' : ''}`}>
                {readiness.total_on_shift}
              </div>
            </div>
            <div className="rq-kpi">
              <div className="rq-kpi-lbl">Off Shift</div>
              <div className="rq-kpi-val">{readiness.total_off_shift}</div>
            </div>
            <div className="rq-kpi">
              <div className="rq-kpi-lbl">Cert Gaps</div>
              <div className={`rq-kpi-val${readiness.cert_gaps.length > 0 ? ' rq-v-r' : ''}`}>
                {readiness.cert_gaps.length}
              </div>
            </div>
            <div className="rq-kpi">
              <div className="rq-kpi-lbl">Teams</div>
              <div className="rq-kpi-val">{readiness.teams.length}</div>
            </div>
          </div>

          {/* Team Readiness */}
          {readiness.teams.length > 0 && (
            <>
              <div className="rq-eyebrow">Team Readiness</div>
              {readiness.teams.map(tr => (
                <div className="rq-team-card" key={tr.team.id}>
                  <div className="rq-team-header">
                    <span className="rq-team-name">{tr.team.label}</span>
                    <span className="rq-team-shift">{tr.team.shift} &middot; Lead: {tr.team.lead_user_id}</span>
                  </div>

                  {/* Cert status bar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'var(--rq-ink-3)', width: 60, flexShrink: 0 }}>
                      Cert status
                    </span>
                    <div className="rq-progress-track">
                      <div className="rq-progress-fill" style={{
                        width: `${tr.cert_compliance}%`,
                        background: tr.cert_compliance >= 90 ? 'var(--rq-green)' :
                          tr.cert_compliance >= 70 ? 'var(--rq-amber)' : 'var(--rq-red)',
                      }} />
                    </div>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, width: 32, textAlign: 'right',
                      color: tr.cert_compliance >= 90 ? 'var(--rq-green)' : tr.cert_compliance >= 70 ? 'var(--rq-amber)' : 'var(--rq-red)',
                    }}>
                      {tr.cert_compliance}%
                    </span>
                  </div>

                  {/* Members */}
                  {tr.members.map(m => (
                    <Link href={`/prototype/rampiq/workforce/agent/${m.id}`}
                      className="rq-roster-row" key={m.id}
                      style={{ padding: '6px 0', borderBottom: '1px solid var(--rq-line)' }}>
                      <span className="rq-roster-id">{m.id}</span>
                      <div className="rq-roster-info">
                        <div className="rq-roster-name">{m.display_name || m.id}</div>
                        <div className="rq-roster-meta">{ROLE_LABELS[m.role_type] || m.role_type}</div>
                      </div>
                      <div className="rq-shift-badge">
                        <div className={`rq-shift-dot ${m.on_shift ? 'on' : 'off'}`} />
                        {m.on_shift ? 'On' : 'Off'}
                      </div>
                    </Link>
                  ))}
                </div>
              ))}
            </>
          )}

          {/* Equipment Coverage */}
          {readiness.equip_coverage.length > 0 && (
            <>
              <div className="rq-eyebrow">Equipment Coverage</div>
              {readiness.equip_coverage.map(ec => {
                const max = Math.max(ec.qualified_total, 1);
                return (
                  <div className="rq-pat-row" key={ec.equip_code}>
                    <div className="rq-pat-label">{ec.equip_label}</div>
                    <div className="rq-pat-bar-track">
                      <div className="rq-pat-bar-fill" style={{
                        width: `${(ec.qualified_on_shift / max) * 100}%`,
                        background: ec.qualified_on_shift > 0 ? 'var(--rq-green)' : 'var(--rq-red)',
                      }} />
                    </div>
                    <div className="rq-pat-count" style={{
                      color: ec.qualified_on_shift > 0 ? 'var(--rq-green)' : 'var(--rq-red)',
                    }}>
                      {ec.qualified_on_shift}
                    </div>
                    <div className="rq-pat-avg">/ {ec.qualified_total}</div>
                  </div>
                );
              })}
              <div style={{ padding: '2px 16px' }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: 'var(--rq-ink-4)' }}>
                  On shift / total qualified
                </span>
              </div>
            </>
          )}

          {/* Certification Gaps */}
          {readiness.cert_gaps.length > 0 && (
            <>
              <div className="rq-eyebrow">Certification Gaps</div>
              {readiness.cert_gaps.map(cg => (
                <div key={cg.cert_code} className="rq-cert-row">
                  <span className="rq-cert-name">{cg.cert_label}</span>
                  <span className={`rq-pill ${cg.active_count < cg.required_count ? 'rq-pill-risk' : 'rq-pill-watch'}`}>
                    {cg.active_count}/{cg.required_count}
                  </span>
                  {cg.expiring_soon > 0 && (
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                      color: 'var(--rq-amber)',
                    }}>
                      {cg.expiring_soon} expiring
                    </span>
                  )}
                </div>
              ))}
            </>
          )}
          {readiness.cert_gaps.length === 0 && (
            <>
              <div className="rq-eyebrow">Certification Gaps</div>
              <div className="rq-quiet">No certification gaps</div>
            </>
          )}

          {/* Full Crew Roster */}
          <div className="rq-eyebrow">Crew Roster</div>
          {users.map(u => (
            <Link href={`/prototype/rampiq/workforce/agent/${u.id}`}
              className="rq-roster-row" key={u.id}>
              <span className="rq-roster-id">{u.id}</span>
              <div className="rq-roster-info">
                <div className="rq-roster-name">{u.display_name || u.id}</div>
                <div className="rq-roster-meta">
                  {ROLE_LABELS[u.role_type] || u.role_type} &middot; {u.station}
                </div>
              </div>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: 'var(--rq-ink-4)' }}>&rsaquo;</span>
            </Link>
          ))}
        </>
      )}

      <div style={{ height: 20 }} />
      <div className="rq-quiet">RampIQ &middot; Operational Readiness</div>
    </div>
  );
}
