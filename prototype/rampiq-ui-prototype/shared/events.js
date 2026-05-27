/* ========================================================================
   RampIQ · Event Bus
   Cross-page event emission via localStorage 'storage' events + local fan-out.
   Every operational action emits an event.
   ======================================================================== */

(function() {
  const STREAM_KEY = 'rampiq_events_v1';
  const MAX_EVENTS = 200;

  const listeners = [];

  function nowStr() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
  }

  function loadStream() {
    try {
      const s = localStorage.getItem(STREAM_KEY);
      if (s) return JSON.parse(s);
    } catch(e) {}
    // seed with defaults
    const seed = (window.RampIQ?.data?.state?.seedEvents) || [];
    saveStream(seed);
    return seed;
  }
  function saveStream(events) {
    try { localStorage.setItem(STREAM_KEY, JSON.stringify(events.slice(0, MAX_EVENTS))); } catch(e) {}
  }

  function emit(eventArr) {
    const stream = loadStream();
    stream.unshift(eventArr);
    saveStream(stream);
    listeners.forEach(fn => { try { fn(eventArr); } catch(e) {} });
    // localStorage 'storage' event fires in other tabs automatically
  }

  // also listen for storage events from other tabs
  window.addEventListener('storage', (e) => {
    if (e.key === STREAM_KEY) {
      const stream = loadStream();
      const latest = stream[0];
      if (latest) listeners.forEach(fn => { try { fn(latest); } catch(e) {} });
    }
  });

  window.RampIQ = window.RampIQ || {};
  window.RampIQ.events = {
    stream: loadStream,
    emit,
    nowStr,
    onEvent(fn) { listeners.push(fn); },

    // High-level emitters used across the product
    serviceConfirmed(service, gate, tail, agent) {
      emit([nowStr(), 'SERVICE', 'good', `Service confirmed · ${service}`, `${gate} · ${tail}`, agent]);
    },
    supportRequested(category, gate, tail, agent) {
      emit([nowStr(), 'SUPPORT', 'warn', `Support requested · ${category}`, `${gate} · ${tail}`, agent]);
    },
    supportAcknowledged(srId, eta, chief) {
      emit([nowStr(), 'SUPPORT', 'info', `Support acknowledged · ${srId} · ETA ${eta}`, `—`, chief]);
    },
    supportResolved(srId, chief) {
      emit([nowStr(), 'SUPPORT', 'good', `Support resolved · ${srId}`, `—`, chief]);
    },
    actionProposed(title, incId, chief) {
      emit([nowStr(), 'RECOVERY', 'info', `Action proposed · ${title}`, incId, chief]);
    },
    actionAcknowledged(title, incId, assignee) {
      emit([nowStr(), 'RECOVERY', 'info', `Action acknowledged · ${title}`, incId, assignee]);
    },
    actionCompleted(title, incId, assignee) {
      emit([nowStr(), 'RECOVERY', 'good', `Action completed · ${title}`, incId, assignee]);
    },
    positionCheckin(node, agent) {
      emit([nowStr(), 'POSITION', 'info', `On-position confirmed`, node, agent]);
    },
    qrScan(node, agent) {
      emit([nowStr(), 'POSITION', 'info', `QR scan · ${node}`, node, agent]);
    },
    configChange(what, who) {
      emit([nowStr(), 'CONFIG', 'info', `Configuration · ${what}`, '—', who]);
    }
  };
})();
