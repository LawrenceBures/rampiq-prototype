'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function DebugPage() {
  const [results, setResults] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(true);

  useEffect(() => {
    const r: Record<string, string> = {};

    // 1. Env vars
    r['SUPABASE_URL'] = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? `present (${process.env.NEXT_PUBLIC_SUPABASE_URL.substring(0, 30)}...)`
      : 'MISSING';
    r['SUPABASE_ANON_KEY'] = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ? `present (${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.substring(0, 20)}...)`
      : 'MISSING';

    // 2. Navigator
    r['navigator.onLine'] = typeof navigator !== 'undefined' ? String(navigator.onLine) : 'N/A';
    r['userAgent'] = typeof navigator !== 'undefined' ? navigator.userAgent.substring(0, 80) : 'N/A';

    setResults({ ...r });

    // 3. Supabase REST ping (raw fetch, no SDK)
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (url && key) {
      const restUrl = `${url}/rest/v1/users_lite?select=id&active=eq.true&limit=1`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const start = Date.now();

      r['supabase_rest'] = 'fetching...';
      setResults({ ...r });

      fetch(restUrl, {
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`,
        },
        signal: controller.signal,
      })
        .then(async (res) => {
          clearTimeout(timeoutId);
          const elapsed = Date.now() - start;
          const body = await res.text();
          r['supabase_rest'] = `${res.status} in ${elapsed}ms`;
          r['supabase_rest_body'] = body.substring(0, 200);
          r['supabase_rest_headers'] = `content-type: ${res.headers.get('content-type')}`;
          setResults({ ...r });
        })
        .catch((err) => {
          clearTimeout(timeoutId);
          const elapsed = Date.now() - start;
          if (err.name === 'AbortError') {
            r['supabase_rest'] = `TIMEOUT after ${elapsed}ms`;
          } else {
            r['supabase_rest'] = `ERROR: ${err.message} (${elapsed}ms)`;
          }
          setResults({ ...r });
        });

      // 4. Supabase SDK test (import dynamically to test the singleton)
      import('@/lib/supabase').then(({ getSupabase }) => {
        const sb = getSupabase();
        r['supabase_sdk'] = sb ? 'client created' : 'null (no env vars)';
        setResults({ ...r });

        if (sb) {
          const sdkStart = Date.now();
          r['supabase_sdk_query'] = 'querying...';
          setResults({ ...r });

          const sdkTimeout = setTimeout(() => {
            r['supabase_sdk_query'] = `HANGING (>${Date.now() - sdkStart}ms, no response)`;
            setResults({ ...r });
          }, 6000);

          sb.from('users_lite')
            .select('id')
            .eq('active', true)
            .limit(1)
            .then(({ data, error: sbErr }) => {
              clearTimeout(sdkTimeout);
              const elapsed = Date.now() - sdkStart;
              if (sbErr) {
                r['supabase_sdk_query'] = `ERROR: ${sbErr.message} (${elapsed}ms)`;
              } else {
                r['supabase_sdk_query'] = `OK: ${data?.length} row(s) in ${elapsed}ms`;
              }
              setResults({ ...r });
              setRunning(false);
            });
        } else {
          setRunning(false);
        }
      });
    } else {
      r['supabase_rest'] = 'skipped (no env vars)';
      setResults({ ...r });
      setRunning(false);
    }
  }, []);

  return (
    <>
      <Link href="/prototype/rampiq" className="rq-back">&larr; Back</Link>

      <div className="rq-gate-header">
        <div className="rq-gate-id" style={{ fontSize: 20 }}>Debug</div>
        <div className="rq-gate-meta">
          Mobile connectivity &middot; Supabase reachability
        </div>
      </div>

      <div className="rq-eyebrow">Environment</div>
      {Object.entries(results).map(([key, val]) => (
        <div key={key} style={{
          padding: '6px 16px',
          borderBottom: '1px solid var(--rq-line)',
          display: 'flex', gap: 8, alignItems: 'flex-start',
        }}>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
            color: 'var(--rq-ink-3)', width: 140, flexShrink: 0,
          }}>
            {key}
          </span>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
            color: val.includes('ERROR') || val.includes('MISSING') || val.includes('TIMEOUT') || val.includes('HANGING')
              ? 'var(--rq-red)'
              : val.includes('OK') || val.includes('present') || val.includes('true') || val.includes('created')
                ? 'var(--rq-green)'
                : 'var(--rq-ink-2)',
            wordBreak: 'break-all',
          }}>
            {val}
          </span>
        </div>
      ))}

      {running && (
        <div className="rq-quiet" style={{ padding: '16px' }}>
          Tests running...
        </div>
      )}

      <div style={{ padding: '16px' }}>
        <button className="rq-btn-secondary" onClick={() => window.location.reload()}>
          Re-run Tests
        </button>
      </div>

      <div className="rq-quiet">RampIQ &middot; Debug</div>
    </>
  );
}
