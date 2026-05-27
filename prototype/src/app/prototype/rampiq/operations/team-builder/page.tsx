'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ROLE_LABELS } from '@/lib/rampiq-types';
import type { UserLite, UserCertification, UserEquipmentQual } from '@/lib/rampiq-types';

// Next.js 16 requires useSearchParams in a Suspense boundary
export default function TeamBuilderWrapper() {
  return (
    <Suspense fallback={<div className="rq-quiet" style={{ padding: '32px 16px' }}>Loading...</div>}>
      <TeamBuilderPage />
    </Suspense>
  );
}

interface Advisory {
  level: 'info' | 'warn' | 'critical';
  message: string;
}

function timeStr(t: string | null): string {
  if (!t) return '--';
  return t.substring(0, 5);
}

function TeamBuilderPage() {
  const searchParams = useSearchParams();
  const memberIds = (searchParams.get('members') || '').split(',').filter(Boolean);

  const [members, setMembers] = useState<UserLite[]>([]);
  const [certs, setCerts] = useState<Map<string, UserCertification[]>>(new Map());
  const [quals, setQuals] = useState<Map<string, UserEquipmentQual[]>>(new Map());
  const [advisories, setAdvisories] = useState<Advisory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (memberIds.length === 0) return;

    (async () => {
      const { fetchUsers, fetchUserCertifications, fetchUserEquipmentQuals } = await import('@/lib/store');
      const allUsers = await fetchUsers();
      const selected = allUsers.filter(u => memberIds.includes(u.id));
      setMembers(selected);

      // Load certs and quals for each member
      const certMap = new Map<string, UserCertification[]>();
      const qualMap = new Map<string, UserEquipmentQual[]>();
      await Promise.all(selected.map(async (u) => {
        const [c, q] = await Promise.all([
          fetchUserCertifications(u.id),
          fetchUserEquipmentQuals(u.id),
        ]);
        certMap.set(u.id, c);
        qualMap.set(u.id, q);
      }));
      setCerts(certMap);
      setQuals(qualMap);

      // Compute advisories
      const advs: Advisory[] = [];
      const now = new Date();

      for (const u of selected) {
        // Shift end warning
        if (u.shift_end) {
          const [h, m] = u.shift_end.split(':').map(Number);
          const end = new Date(now);
          end.setHours(h, m, 0, 0);
          const diff = end.getTime() - now.getTime();
          if (diff < 0) {
            advs.push({ level: 'critical', message: `${u.id} is past scheduled off time (${u.shift_end}).` });
          } else if (diff < 3600000) {
            advs.push({ level: 'warn', message: `${u.id} scheduled off at ${u.shift_end}. ${Math.round(diff / 60000)} min remaining.` });
          }
        }

        // Extension eligibility
        if (!u.extension_eligible) {
          advs.push({ level: 'warn', message: `${u.id} is not extension eligible.` });
        }

        // Pushback cert
        if (!u.pushback_certified) {
          advs.push({ level: 'info', message: `${u.id} is not pushback certified.` });
        }

        // Pushback recert approaching
        if (u.pushback_recert_date) {
          const recert = new Date(u.pushback_recert_date);
          const daysUntil = Math.floor((recert.getTime() - now.getTime()) / 86400000);
          if (daysUntil < 0) {
            advs.push({ level: 'critical', message: `${u.id} pushback cert expired ${Math.abs(daysUntil)} days ago.` });
          } else if (daysUntil < 30) {
            advs.push({ level: 'warn', message: `${u.id} pushback cert expires in ${daysUntil} days.` });
          }
        }

        // Cert gaps
        const userCerts = certMap.get(u.id) || [];
        const expired = userCerts.filter(c => c.status === 'EXPIRED');
        if (expired.length > 0) {
          advs.push({ level: 'critical', message: `${u.id} has ${expired.length} expired cert(s): ${expired.map(c => c.cert_label || c.cert_code).join(', ')}.` });
        }
      }

      // Role mix check
      const hasPushback = selected.some(u => u.pushback_certified);
      if (!hasPushback) {
        advs.push({ level: 'warn', message: 'No pushback-certified agent in this team.' });
      }

      const hasLT = selected.some(u => u.role_type === 'LT_RUNNER');
      if (!hasLT) {
        advs.push({ level: 'info', message: 'No LT / Runner in selection. Bag delivery will require separate dispatch.' });
      }

      // Belt loader coverage
      const hasBeltLoader = Array.from(qualMap.values()).flat().some(q => q.equip_code === 'BELT_LOADER' && q.status === 'ACTIVE');
      if (!hasBeltLoader) {
        advs.push({ level: 'warn', message: 'No belt loader certified agent in selection.' });
      }

      setAdvisories(advs);
      setLoading(false);
    })();
  }, []);

  if (memberIds.length === 0) {
    return (
      <>
        <Link href="/prototype/rampiq/operations/workforce-pool" className="rq-back">&larr; Workforce Pool</Link>
        <div className="rq-quiet" style={{ padding: '32px 16px' }}>No team members selected. Go back to Workforce Pool.</div>
      </>
    );
  }

  // Role mix
  const roleCounts: Record<string, number> = {};
  members.forEach(m => { roleCounts[ROLE_LABELS[m.role_type] || m.role_type] = (roleCounts[ROLE_LABELS[m.role_type] || m.role_type] || 0) + 1; });

  return (
    <div className="rq-ops-board">
      <Link href="/prototype/rampiq/operations/workforce-pool" className="rq-back">&larr; Workforce Pool</Link>

      <div className="rq-gate-header">
        <div className="rq-gate-id" style={{ fontSize: 20 }}>Team Builder</div>
        <div className="rq-gate-meta">
          {members.length} agents &middot; <b>{Object.entries(roleCounts).map(([r, n]) => `${n} ${r}`).join(', ')}</b>
        </div>
      </div>

      {loading && <div className="rq-quiet">Loading team data...</div>}

      {/* Advisories */}
      {advisories.length > 0 && (
        <>
          <div className="rq-eyebrow">Operational Advisories</div>
          {advisories.map((adv, i) => (
            <div key={i} style={{
              margin: '0 16px 4px', padding: '8px 12px',
              border: `1px solid ${adv.level === 'critical' ? 'var(--rq-red-dim)' : adv.level === 'warn' ? 'var(--rq-amber-dim)' : 'var(--rq-line)'}`,
              borderLeft: `3px solid ${adv.level === 'critical' ? 'var(--rq-red)' : adv.level === 'warn' ? 'var(--rq-amber)' : 'var(--rq-blue)'}`,
              background: adv.level === 'critical' ? 'rgba(255,92,92,.03)' : adv.level === 'warn' ? 'rgba(245,177,61,.03)' : 'var(--rq-bg-1)',
            }}>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                color: adv.level === 'critical' ? 'var(--rq-red)' : adv.level === 'warn' ? 'var(--rq-amber)' : 'var(--rq-ink-2)',
              }}>
                {adv.message}
              </div>
            </div>
          ))}
        </>
      )}

      {advisories.length === 0 && !loading && (
        <>
          <div className="rq-eyebrow">Operational Advisories</div>
          <div className="rq-quiet">No advisories — team composition looks clear</div>
        </>
      )}

      {/* Team Members */}
      <div className="rq-eyebrow">Team Composition</div>
      {members.map(m => {
        const userCerts = certs.get(m.id) || [];
        const userQuals = quals.get(m.id) || [];
        const activeCerts = userCerts.filter(c => c.status === 'ACTIVE').length;

        return (
          <div key={m.id} className="rq-team-card">
            <div className="rq-team-header">
              <span className="rq-team-name">{m.id}</span>
              <span style={{ fontSize: 13, fontWeight: 500, marginLeft: 8 }}>{m.display_name}</span>
              <span className="rq-team-shift">{ROLE_LABELS[m.role_type]}</span>
            </div>

            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
              color: 'var(--rq-ink-3)', display: 'flex', gap: 8, flexWrap: 'wrap',
            }}>
              <span>{m.default_shift} shift</span>
              <span>&middot;</span>
              <span>Off {timeStr(m.shift_end)}</span>
              <span>&middot;</span>
              <span>Lunch {timeStr(m.lunch_start)}–{timeStr(m.lunch_end)}</span>
              <span>&middot;</span>
              <span>{activeCerts} active certs</span>
              <span>&middot;</span>
              <span>{userQuals.filter(q => q.status === 'ACTIVE').length} equip quals</span>
              <span>&middot;</span>
              <span style={{ color: m.pushback_certified ? 'var(--rq-green)' : 'var(--rq-ink-4)' }}>
                Pushback: {m.pushback_certified ? 'yes' : 'no'}
              </span>
              <span>&middot;</span>
              <span>{m.extension_eligible ? 'ext OK' : 'no ext'}</span>
            </div>

            {/* Equipment quals chips */}
            {userQuals.length > 0 && (
              <div className="rq-assign-chips" style={{ marginTop: 6 }}>
                {userQuals.filter(q => q.status === 'ACTIVE').map(q => (
                  <span className="rq-assign-chip" key={q.equip_code}>{q.equip_label || q.equip_code}</span>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Actions */}
      <div style={{ padding: '16px', display: 'flex', gap: 8 }}>
        <Link href="/prototype/rampiq/operations/workforce-pool"
          className="rq-btn-secondary"
          style={{ flex: 1, textDecoration: 'none', textAlign: 'center' }}>
          Modify Team
        </Link>
        <Link href={`/prototype/rampiq/operations/dispatch?team=${memberIds.join(',')}`}
          className="rq-btn-primary"
          style={{ flex: 1, textDecoration: 'none', textAlign: 'center', fontSize: 11 }}>
          Assign to Gates
        </Link>
      </div>

      <div className="rq-quiet">SOI &middot; Team Builder</div>
    </div>
  );
}
