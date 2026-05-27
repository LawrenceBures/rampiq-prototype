// SOI — Compact operational metrics strip.
// Presentation-only. No data fetching. No side effects.
// Single dense row: KPIs + severity breakdown inline.

import { ElapsedTime } from './index';
import { ageMinutes } from '@/lib/derived-operational-state';
import type { EventSummary } from '@/lib/derived-operational-state';

interface KpiStripProps {
  summary: EventSummary;
}

const mono: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontVariantNumeric: 'tabular-nums',
};

function Metric({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
      <span style={{ ...mono, fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--rq-ink-4)' }}>
        {label}
      </span>
      <span style={{ ...mono, fontSize: 14, fontWeight: 700, color: color ?? 'var(--rq-ink)' }}>
        {value}
      </span>
    </div>
  );
}

function SevDot({ count, color }: { count: number; color: string }) {
  return (
    <span style={{
      ...mono, fontSize: 11, fontWeight: 600,
      color: count > 0 ? color : 'var(--rq-ink-4)',
    }}>
      {count}
    </span>
  );
}

export function KpiStrip({ summary }: KpiStripProps) {
  const s = summary.severity;
  const oldestAge = summary.oldestOpen ? ageMinutes(summary.oldestOpen.created_at) : 0;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16, padding: '6px 16px',
      borderBottom: '1px solid var(--rq-line)', flexWrap: 'wrap',
    }}>
      <Metric label="Open" value={summary.openCount} color={summary.openCount > 0 ? 'var(--rq-amber)' : undefined} />
      <Metric label="Crit+Hi" value={summary.critHighCount} color={summary.critHighCount > 0 ? 'var(--rq-red)' : undefined} />
      <Metric label="Resolved" value={summary.resolvedCount} color={summary.resolvedCount > 0 ? 'var(--rq-green)' : undefined} />
      <Metric
        label="Oldest"
        value={summary.oldestOpen ? <ElapsedTime since={summary.oldestOpen.created_at} format="relative" /> : '--'}
        color={oldestAge > 15 ? 'var(--rq-red)' : undefined}
      />

      {/* Severity mini-counters */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto',
        borderLeft: '1px solid var(--rq-line)', paddingLeft: 12,
      }}>
        <span style={{ ...mono, fontSize: 7, color: 'var(--rq-ink-4)', letterSpacing: '.1em', textTransform: 'uppercase' }}>sev</span>
        <SevDot count={s.CRITICAL} color="var(--rq-red)" />
        <SevDot count={s.HIGH} color="var(--rq-red)" />
        <SevDot count={s.MEDIUM} color="var(--rq-amber)" />
        <SevDot count={s.LOW} color="var(--rq-ink-3)" />
      </div>
    </div>
  );
}
