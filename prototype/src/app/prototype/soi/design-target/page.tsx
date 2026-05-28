import './target.css';

export const metadata = { title: 'SOI Design Target' };

export default function DesignTarget() {
  return (
    <div className="dt">
      {/* ═══ HEADER ═══ */}
      <header className="dt-header">
        <div className="dt-brand">
          <span className="dt-logo">SOI</span>
          <div className="dt-brand-sub">
            <div>Operational Intelligence</div>
            <div>Mission Control</div>
          </div>
        </div>
        <div className="dt-greeting">Good evening, Martinez. SOI is monitoring LAX Eagle operations.</div>
        <div className="dt-header-right">
          <span className="dt-meta">20:47</span>
          <span className="dt-meta">AM Shift</span>
          <span className="dt-meta">LAX <span className="dt-pulse" /></span>
          <div className="dt-operator">
            <div className="dt-op-name">Martinez J.</div>
            <div className="dt-op-role">Crew Chief · LAX</div>
          </div>
        </div>
      </header>

      {/* ═══ BODY ═══ */}
      <div className="dt-body">

        {/* ─── LEFT RAIL ─── */}
        <aside className="dt-left">
          <div className="dt-section-label">Operations Snapshot</div>

          {/* Pressure gauge */}
          <div className="dt-gauge">
            <div className="dt-gauge-value" style={{ color: '#f5b13d' }}>76</div>
            <div className="dt-gauge-label" style={{ color: '#f5b13d' }}>ELEVATED</div>
            <div className="dt-gauge-sub">76 / 100</div>
          </div>

          {/* Zone cards */}
          <div className="dt-zone" data-sev="critical">
            <div className="dt-zone-head">
              <span className="dt-zone-name">52A-C</span>
              <span className="dt-zone-pressure" style={{ color: '#ff5c5c' }}>92</span>
            </div>
            <div className="dt-zone-stats">3 incidents · 2 recovery</div>
            <div className="dt-bar"><div className="dt-bar-fill" style={{ width: '92%', background: '#ff5c5c' }} /></div>
          </div>
          <div className="dt-zone" data-sev="high">
            <div className="dt-zone-head">
              <span className="dt-zone-name">52D-F</span>
              <span className="dt-zone-pressure" style={{ color: '#f5b13d' }}>68</span>
            </div>
            <div className="dt-zone-stats">2 incidents · 1 recovery</div>
            <div className="dt-bar"><div className="dt-bar-fill" style={{ width: '68%', background: '#f5b13d' }} /></div>
          </div>
          <div className="dt-zone" data-sev="low">
            <div className="dt-zone-head">
              <span className="dt-zone-name">52G-I</span>
              <span className="dt-zone-pressure" style={{ color: '#2a9d6a' }}>24</span>
            </div>
            <div className="dt-zone-stats">0 incidents · 0 recovery</div>
            <div className="dt-bar"><div className="dt-bar-fill" style={{ width: '24%', background: '#2a9d6a' }} /></div>
          </div>

          <div className="dt-section-label" style={{ marginTop: 20 }}>Recovery In Progress</div>
          <div className="dt-recovery">
            <div className="dt-recovery-count">1</div>
            <div>
              <div className="dt-recovery-pct">72%</div>
              <div className="dt-recovery-label">Chain progress</div>
            </div>
          </div>
        </aside>

        {/* ─── CENTER ─── */}
        <main className="dt-center">
          <div className="dt-center-header">
            <b>LAX Eagle</b> — <span>Gates 52A-I</span>
            <div className="dt-center-right">
              <span className="dt-pulse" />
              <span className="dt-live-label">Live</span>
            </div>
          </div>

          {/* ── MAP ── */}
          <div className="dt-map">
            <svg viewBox="0 0 1000 520" preserveAspectRatio="xMidYMid meet" className="dt-map-svg">
              {/* Grid */}
              <g opacity=".03" stroke="#8899aa" strokeWidth=".5">
                {[80,160,240,320,400].map(y=><line key={`h${y}`} x1="40" y1={y} x2="960" y2={y}/>)}
                {[100,200,300,400,500,600,700,800,900].map(x=><line key={`v${x}`} x1={x} y1="40" x2={x} y2="480"/>)}
              </g>

              {/* Zone heat fields */}
              <ellipse cx="300" cy="140" rx="220" ry="100" fill="#ff5c5c" opacity=".06" />
              <ellipse cx="420" cy="280" rx="200" ry="90" fill="#f5b13d" opacity=".04" />
              <ellipse cx="500" cy="420" rx="250" ry="80" fill="#2a9d6a" opacity=".015" />

              {/* Zone boundaries */}
              <rect x="60" y="60" width="480" height="160" rx="4" fill="none" stroke="#ff5c5c" strokeWidth="1" opacity=".12" strokeDasharray="6 4" />
              <rect x="80" y="200" width="520" height="160" rx="4" fill="none" stroke="#f5b13d" strokeWidth=".8" opacity=".08" strokeDasharray="6 4" />
              <rect x="100" y="350" width="580" height="140" rx="4" fill="none" stroke="#2a9d6a" strokeWidth=".5" opacity=".06" strokeDasharray="6 4" />

              {/* Taxiways */}
              {[[170,120,340,100],[340,100,520,120],[200,280,420,260],[420,260,640,280],[250,420,500,400],[500,400,740,420],
                [340,100,420,260],[420,260,500,400],[170,120,200,280],[200,280,250,420],[520,120,640,280],[640,280,740,420]
              ].map(([x1,y1,x2,y2],i)=>{
                const cross = Math.abs(y2-y1) > 80;
                return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={cross ? '#f5b13d' : '#1a2030'} strokeWidth={cross ? 1.2 : .7} opacity={cross ? .25 : .15} strokeDasharray={cross ? '6 4' : 'none'} />;
              })}

              {/* Cascade flow dots */}
              <circle r="3" fill="#f5b13d" opacity=".5">
                <animateMotion dur="3s" repeatCount="indefinite" path="M340,100 L420,260" />
                <animate attributeName="opacity" values=".15;.6;.15" dur="3s" repeatCount="indefinite" />
              </circle>
              <circle r="3" fill="#f5b13d" opacity=".5">
                <animateMotion dur="3.5s" repeatCount="indefinite" path="M520,120 L640,280" />
                <animate attributeName="opacity" values=".1;.5;.1" dur="3.5s" repeatCount="indefinite" />
              </circle>

              {/* Gate nodes */}
              {[
                { id:'A', x:170, y:120, p:95, inc:2, fl:'AA1318', c:'#ff5c5c' },
                { id:'B', x:340, y:100, p:88, inc:1, fl:'AA1350', c:'#ff5c5c' },
                { id:'C', x:520, y:120, p:82, inc:1, fl:'WN1334', c:'#ff5c5c' },
                { id:'D', x:200, y:280, p:72, inc:1, fl:'AA2201', c:'#f5b13d' },
                { id:'E', x:420, y:260, p:65, inc:1, fl:'UA0418', c:'#f5b13d' },
                { id:'F', x:640, y:280, p:58, inc:0, fl:'AA0917', c:'#f5b13d' },
                { id:'G', x:250, y:420, p:22, inc:0, fl:'DL1144', c:'#2a9d6a' },
                { id:'H', x:500, y:400, p:18, inc:0, fl:'WN2280', c:'#2a9d6a' },
                { id:'I', x:740, y:420, p:12, inc:0, fl:'AA1042', c:'#2a9d6a' },
              ].map(g => (
                <g key={g.id}>
                  {/* Heat glow */}
                  <circle cx={g.x} cy={g.y} r={20 + g.p * 0.4} fill={g.c} opacity={g.p > 60 ? .12 : g.p > 30 ? .05 : .02}>
                    {g.p >= 60 && <animate attributeName="r" values={`${20+g.p*.4-4};${20+g.p*.4+4};${20+g.p*.4-4}`} dur={g.p>=80?'2.5s':'4s'} repeatCount="indefinite"/>}
                  </circle>
                  {/* Node */}
                  <circle cx={g.x} cy={g.y} r={20} fill="#080c14" stroke={g.c} strokeWidth={1.5} />
                  {/* Letter */}
                  <text x={g.x} y={g.y+1} textAnchor="middle" dominantBaseline="middle" fill={g.c} fontSize="14" fontWeight="700" fontFamily="'JetBrains Mono',monospace">{g.id}</text>
                  {/* Flight */}
                  <text x={g.x} y={g.y+34} textAnchor="middle" fill="rgba(255,255,255,.3)" fontSize="8" fontFamily="'JetBrains Mono',monospace">{g.fl}</text>
                  {/* Pressure */}
                  <text x={g.x} y={g.y+46} textAnchor="middle" fill={g.c} fontSize="8" fontWeight="600" fontFamily="'JetBrains Mono',monospace" opacity=".6">{g.p}</text>
                  {/* Incident badge */}
                  {g.inc > 0 && <>
                    <circle cx={g.x+18} cy={g.y-18} r={9} fill={g.c} fillOpacity=".85">
                      {g.p >= 80 && <animate attributeName="r" values="9;11;9" dur="2s" repeatCount="indefinite"/>}
                    </circle>
                    <text x={g.x+18} y={g.y-18} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize="8" fontWeight="700" fontFamily="'JetBrains Mono',monospace">{g.inc}</text>
                  </>}
                </g>
              ))}

              {/* Status badge */}
              <rect x="600" y="80" width="80" height="22" rx="2" fill="#ff5c5c" fillOpacity=".12" stroke="#ff5c5c" strokeWidth=".8" />
              <text x="640" y="93" textAnchor="middle" dominantBaseline="middle" fill="#ff5c5c" fontSize="8" fontWeight="700" letterSpacing=".1em" fontFamily="'JetBrains Mono',monospace">ELEVATED</text>

              {/* Coordinate labels */}
              <text x="50" y="500" fill="#1c2230" fontSize="7" fontFamily="'JetBrains Mono',monospace" letterSpacing=".1em">LAX T5 RAMP</text>
              <text x="940" y="500" fill="#1c2230" fontSize="7" fontFamily="'JetBrains Mono',monospace" letterSpacing=".1em" textAnchor="end">52A–I</text>
            </svg>
          </div>

          {/* ── ACTIVE RECOMMENDATION ── */}
          <div className="dt-rec">
            <div className="dt-rec-grid">
              <div className="dt-rec-main">
                <div className="dt-rec-label">Active Recommendation</div>
                <div className="dt-rec-title">Stabilize Gates 52C</div>
                <div className="dt-rec-body">BL-042 reassignment needed. 3 agents hand-loading bags at 52B. Equipment swap would eliminate cascading pressure across adjacent gates.</div>
              </div>
              <div className="dt-rec-metrics">
                <div className="dt-rec-metric">
                  <div className="dt-rec-metric-label">Confidence</div>
                  <div className="dt-rec-metric-value" style={{ color: '#3ed598' }}>84%</div>
                </div>
                <div className="dt-rec-metric">
                  <div className="dt-rec-metric-label">Stabilization</div>
                  <div className="dt-rec-metric-value">~18m</div>
                </div>
                <div className="dt-rec-metric">
                  <div className="dt-rec-metric-label">Pressure</div>
                  <div className="dt-rec-metric-value"><span style={{ color: '#ff5c5c' }}>92</span> → <span style={{ color: '#f5b13d' }}>54</span></div>
                </div>
              </div>
              <div className="dt-rec-plan">
                <div className="dt-rec-label">Modeled Recovery Plan</div>
                <div className="dt-rec-steps">
                  <div className="dt-rec-step" data-status="done"><span>✓</span> Acknowledge BL-042 failure</div>
                  <div className="dt-rec-step" data-status="active"><span>▸</span> Reassign belt loader from 52F</div>
                  <div className="dt-rec-step"><span>3</span> Dispatch RA14 to 52B support</div>
                  <div className="dt-rec-step"><span>4</span> Evaluate outbound compression</div>
                </div>
                <button className="dt-rec-btn">Stabilize Gates 52C</button>
              </div>
            </div>
          </div>
        </main>

        {/* ─── RIGHT RAIL ─── */}
        <aside className="dt-right">
          <div className="dt-section-label">Priority · Gates 52A-C</div>

          <div className="dt-incident" data-sev="critical">
            <div className="dt-incident-title">Late inbound AA2847 — gate congestion</div>
            <div className="dt-incident-meta"><span style={{ color: '#ff5c5c' }}>CRITICAL</span> · 52A · 95m</div>
          </div>
          <div className="dt-incident" data-sev="high">
            <div className="dt-incident-title">Belt loader BL-042 failure — Gate 52B</div>
            <div className="dt-incident-meta"><span style={{ color: '#f5b13d' }}>HIGH</span> · 52B · 65m</div>
          </div>
          <div className="dt-incident" data-sev="critical">
            <div className="dt-incident-title">Ground delay program — 52D held</div>
            <div className="dt-incident-meta"><span style={{ color: '#ff5c5c' }}>CRITICAL</span> · 52D · 30m</div>
          </div>

          <div className="dt-section-label" style={{ marginTop: 20 }}>SOI Intelligence</div>
          <div className="dt-intel">
            <div className="dt-intel-label">Cascade Risk</div>
            <div className="dt-intel-body">52A-C → 52D-F propagation at 78% likelihood. Intervention within 12m recommended.</div>
          </div>
          <div className="dt-intel">
            <div className="dt-intel-label">Recovery Confidence</div>
            <div className="dt-intel-body">72% — equipment bottleneck reduces projected success rate. Staffing adequate.</div>
          </div>
        </aside>
      </div>

      {/* ═══ DOCK ═══ */}
      <div className="dt-dock">
        <div className="dt-waveform">
          <div className="dt-wave-bar" /><div className="dt-wave-bar" /><div className="dt-wave-bar" /><div className="dt-wave-bar" /><div className="dt-wave-bar" />
        </div>
        <input className="dt-dock-input" placeholder="Ask SOI anything... show me 52C, what should I worry about?" readOnly />
        <button className="dt-dock-btn dt-primary">Run</button>
        <button className="dt-dock-mic">🎙</button>
        <button className="dt-dock-btn">Voice</button>
        <button className="dt-dock-btn">Ambient</button>
        <div className="dt-dock-note">SOI pronounces its name &quot;Soi&quot; like &quot;soy&quot;</div>
      </div>
    </div>
  );
}
