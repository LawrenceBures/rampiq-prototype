/* ========================================================================
   RampIQ · Shared interactions, command bar, toast
   ======================================================================== */

(function() {
  // ===== inject command bar =====
  function renderCmdBar(activeRole) {
    const bar = `
      <div class="cmd-bar">
        <div class="cmd-brand" onclick="location.href='../manager/pulse.html'"><span class="dot"></span> RAMPIQ</div>
        <div class="cmd-station">
          <span>STATION <strong>DFW</strong></span>
          <span>SHIFT <strong>PM</strong></span>
          <span><span class="cmd-clock" id="rqClock">14:23:08</span></span>
        </div>
        <div class="cmd-osi">
          <span class="lbl">PRESSURE</span>
          <span class="v" id="rqOsi">68</span>
          <span class="lbl">▲ +4</span>
        </div>
        <div class="role-switch">
          <a href="../manager/pulse.html" data-role="manager" class="${activeRole==='manager'?'active':''}">Manager</a>
          <a href="../crew-chief/zone.html" data-role="chief" class="${activeRole==='chief'?'active':''}">Crew Chief</a>
          <a href="../agent/now.html" data-role="agent" class="${activeRole==='agent'?'active':''}">Agent</a>
          <a href="../admin/stations.html" data-role="admin" class="${activeRole==='admin'?'active':''}">Admin</a>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('afterbegin', bar);
  }

  // ===== toast =====
  function showToast(msg, kind) {
    let t = document.getElementById('rqToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'rqToast';
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = 'toast ' + (kind || '');
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(window._rqT);
    window._rqT = setTimeout(() => t.classList.remove('show'), 2000);
  }

  // ===== demo tag =====
  function renderDemoTag() {
    const tag = document.createElement('div');
    tag.className = 'demo-tag';
    tag.textContent = 'RAMPIQ · OPERATIONAL DEMO · BLOCK 1+2';
    document.body.appendChild(tag);
  }

  // ===== clock =====
  function startClock() {
    const tick = () => {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2,'0');
      const mm = String(d.getMinutes()).padStart(2,'0');
      const ss = String(d.getSeconds()).padStart(2,'0');
      const el = document.getElementById('rqClock');
      if (el) el.textContent = `${hh}:${mm}:${ss}`;
    };
    setInterval(tick, 1000); tick();
  }

  // ===== OSI flicker =====
  function startOsi() {
    let osi = (window.RampIQ?.data?.state?.osi) || 68;
    setInterval(() => {
      osi = Math.max(58, Math.min(82, osi + (Math.random() > 0.5 ? 1 : -1)));
      const el = document.getElementById('rqOsi');
      if (el) el.textContent = osi;
      const el2 = document.getElementById('osiValue');
      if (el2) el2.textContent = osi;
      window.RampIQ.data.update(s => s.osi = osi);
    }, 4500);
  }

  // ===== pressure color =====
  function pressureColor(p) {
    if (p >= 75) return 'var(--red)';
    if (p >= 55) return 'var(--amber)';
    return 'var(--green)';
  }

  // ===== init =====
  function init(activeRole) {
    renderCmdBar(activeRole);
    renderDemoTag();
    startClock();
    startOsi();
  }

  window.RampIQ = window.RampIQ || {};
  window.RampIQ.ui = { init, showToast, pressureColor };
})();
