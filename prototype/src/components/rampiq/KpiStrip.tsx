// RampIQ — KPI strip + severity breakdown.
// Presentation-only. No data fetching. No side effects.
// Extracted from dashboard page for console layout reuse.

import { ElapsedTime } from './index';
import { ageMinutes } from '@/lib/derived-operational-state';
import type { EventSummary } from '@/lib/derived-operational-state';

interface KpiStripProps {
  summary: EventSummary;
}

export function KpiStrip({ summary }: KpiStripProps) {
  const sevCounts = summary.severity;

  return (
    <>
      {/* KPIs */}
      <div className="rq-kpis rq-kpis-4">
        <div className="rq-kpi">
          <div className="rq-kpi-lbl">Open</div>
          <div className={`rq-kpi-val${summary.openCount > 0 ? ' rq-v-a' : ''}`}>{summary.openCount}</div>
        </div>
        <div className="rq-kpi">
          <div className="rq-kpi-lbl">Crit+High</div>
          <div className={`rq-kpi-val${summary.critHighCount > 0 ? ' rq-v-r' : ''}`}>{summary.critHighCount}</div>
        </div>
        <div className="rq-kpi">
          <div className="rq-kpi-lbl">Resolved</div>
          <div className={`rq-kpi-val${summary.resolvedCount > 0 ? ' rq-v-g' : ''}`}>{summary.resolvedCount}</div>
        </div>
        <div className="rq-kpi">
          <div className="rq-kpi-lbl">Oldest Open</div>
          <div className={`rq-kpi-val${summary.oldestOpen && ageMinutes(summary.oldestOpen.created_at) > 15 ? ' rq-v-r' : ''}`}>
            {summary.oldestOpen
              ? <ElapsedTime since={summary.oldestOpen.created_at} format="relative" />
              : '--'
            }
          </div>
        </div>
      </div>

      {/* Severity breakdown */}
      <div className="rq-sev-counters">
        <div className="rq-sev-count">
          <div className="rq-sev-count-n" style={{ color: sevCounts.CRITICAL > 0 ? 'var(--rq-red)' : 'var(--rq-ink-4)' }}>{sevCounts.CRITICAL}</div>
          <div className="rq-sev-count-l">Critical</div>
        </div>
        <div className="rq-sev-count">
          <div className="rq-sev-count-n" style={{ color: sevCounts.HIGH > 0 ? 'var(--rq-red)' : 'var(--rq-ink-4)' }}>{sevCounts.HIGH}</div>
          <div className="rq-sev-count-l">High</div>
        </div>
        <div className="rq-sev-count">
          <div className="rq-sev-count-n" style={{ color: sevCounts.MEDIUM > 0 ? 'var(--rq-amber)' : 'var(--rq-ink-4)' }}>{sevCounts.MEDIUM}</div>
          <div className="rq-sev-count-l">Medium</div>
        </div>
        <div className="rq-sev-count">
          <div className="rq-sev-count-n" style={{ color: sevCounts.LOW > 0 ? 'var(--rq-ink-3)' : 'var(--rq-ink-4)' }}>{sevCounts.LOW}</div>
          <div className="rq-sev-count-l">Low</div>
        </div>
      </div>
    </>
  );
}
