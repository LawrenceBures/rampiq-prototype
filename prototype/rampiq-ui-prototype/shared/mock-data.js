/* ========================================================================
   RampIQ · Shared Operational Mock Data
   Used across all role surfaces. Mutations persist in localStorage so
   state changes (acks, resolves, recoveries) reflect across pages.
   ======================================================================== */

(function() {
  const KEY = 'rampiq_state_v1';

  const DEFAULTS = {
    station: { code: 'DFW', name: 'Dallas/Fort Worth', shift: 'PM' },
    osi: 68,

    zones: [
      { id:'A', name:'Zone A · East', gates:8, turns:6, support:2, incidents:0, pressure:54, role:'normal', chief:'MORALES' },
      { id:'B', name:'Zone B · Central', gates:12, turns:9, support:4, incidents:1, pressure:82, role:'crit', chief:'KENWORTH' },
      { id:'C', name:'Zone C · West', gates:10, turns:5, support:1, incidents:0, pressure:48, role:'normal', chief:'DONOVAN' },
      { id:'D', name:'Zone D · Remote', gates:6, turns:2, support:0, incidents:0, pressure:32, role:'normal', chief:'PARK' },
      { id:'E', name:'Zone E · Cargo', gates:4, turns:1, support:0, incidents:0, pressure:24, role:'normal', chief:'LOPEZ' }
    ],

    gates: [
      { id:'A1', tail:'N219UA', flight:'UA 0501 → IAH', dep:'14:45', state:'occupied', step:'Boarding', zone:'A', crew:3 },
      { id:'A2', tail:'N847UA', flight:'UA 0833 → LAX', dep:'14:32', state:'occupied', step:'Cabin clean', zone:'A', crew:3 },
      { id:'A3', tail:'—', flight:'—', dep:'15:10', state:'empty', step:'—', zone:'A', crew:0 },
      { id:'A4', tail:'N551UA', flight:'UA 1207 → MIA', dep:'14:28', state:'warn', step:'Bag load · late', zone:'A', crew:3 },
      { id:'A5', tail:'N722UA', flight:'UA 0290 → DEN', dep:'15:02', state:'occupied', step:'Catering', zone:'A', crew:3 },
      { id:'B7', tail:'N401UA', flight:'UA 1842 → DEN', dep:'14:18', state:'crit', step:'Belt loader failure · Recovery', zone:'B', crew:4, incidentId:'INC-0142' },
      { id:'B8', tail:'N916UA', flight:'UA 0227 → ORD', dep:'14:30', state:'warn', step:'Bag load · Crew short', zone:'B', crew:2 },
      { id:'B9', tail:'N224UA', flight:'UA 0518 → LAX', dep:'15:05', state:'occupied', step:'Fueling', zone:'B', crew:4 },
      { id:'B10', tail:'N637UA', flight:'UA 1104 → SFO', dep:'14:41', state:'occupied', step:'Cabin service', zone:'B', crew:3 },
      { id:'B11', tail:'N802UA', flight:'UA 2231 → IAH', dep:'14:32', state:'occupied', step:'Boarding', zone:'B', crew:3 },
      { id:'B12', tail:'N105UA', flight:'UA 0763 → EWR', dep:'14:54', state:'occupied', step:'Bag load', zone:'B', crew:3 },
      { id:'B14', tail:'N728UA', flight:'UA 1408 → SEA', dep:'14:32', state:'occupied', step:'Bag load (142/156)', zone:'B', crew:3 },
      { id:'B15', tail:'N311UA', flight:'UA 0890 → MIA', dep:'14:50', state:'recovery', step:'Hold push 6m · Bag transfer', zone:'B', crew:4 },
      { id:'C1', tail:'N409UA', flight:'UA 1119 → ATL', dep:'14:55', state:'occupied', step:'Push', zone:'C', crew:3 },
      { id:'C2', tail:'—', flight:'—', dep:'—', state:'empty', step:'—', zone:'C', crew:0 },
      { id:'C3', tail:'N183UA', flight:'UA 0664 → PHL', dep:'15:20', state:'occupied', step:'Cabin clean', zone:'C', crew:3 },
      { id:'C4', tail:'N678UA', flight:'UA 1502 → BOS', dep:'14:48', state:'occupied', step:'Bag load', zone:'C', crew:3 },
      { id:'R1', tail:'—', flight:'—', dep:'—', state:'empty', step:'—', zone:'D', crew:0 },
      { id:'R2', tail:'N890UA', flight:'UA 9001 ferry → AUS', dep:'15:45', state:'occupied', step:'Tow staged', zone:'D', crew:2 },
      { id:'R3', tail:'—', flight:'—', dep:'—', state:'empty', step:'—', zone:'D', crew:0 },
      { id:'R4', tail:'N502UA', flight:'UA 9015 ferry → IAH', dep:'16:20', state:'occupied', step:'Maintenance', zone:'D', crew:2 }
    ],

    incidents: [
      { id:'INC-0142', cat:'EQ Failure · Cascade', type:'crit', where:'Gate B7 · N401UA', gate:'B7',
        detail:'Belt loader failure. Bag delay propagating to B8 and B9 connecting flights. Recovery in progress.',
        age:'8m 14s', startSec:494, chief:'KENWORTH', actions:3, partic:4, affected:['B7','B8','B9','B14'] },
      { id:'INC-0143', cat:'Crew Short', type:'warn', where:'Gate B8 · N916UA', gate:'B8',
        detail:'Two agents requested from adjacent zone. Awaiting acknowledgment.',
        age:'3m 42s', startSec:222, chief:'—', actions:1, partic:2, affected:['B8'] },
      { id:'INC-0141', cat:'Recovery · Bag Trf', type:'recovery', where:'Gate B15 · N311UA', gate:'B15',
        detail:'Inbound bag delay being absorbed. Push hold authorized 6 min. On track.',
        age:'12m 03s', startSec:723, chief:'KENWORTH', actions:5, partic:3, affected:['B15'] }
    ],

    support: [
      { id:'SR-0231', cat:'EQ Failure', type:'crit', where:'Gate B7', detail:'Belt loader 4 dead. No backup staged.', from:'MORALES,J', age:'4m 12s', status:'open', zone:'B' },
      { id:'SR-0232', cat:'Crew Short', type:'warn', where:'Gate B8', detail:'Down 2 loaders for narrow-body bag load.', from:'HAYES,S', age:'3m 42s', status:'open', zone:'B' },
      { id:'SR-0233', cat:'Bag Issue', type:'warn', where:'Gate B14', detail:'Bag count off by 14. Verify against manifest.', from:'ALVAREZ,M', age:'2m 08s', status:'ack', zone:'B' },
      { id:'SR-0234', cat:'Hazard', type:'crit', where:'Ramp B', detail:'FOD reported near push alley.', from:'KIM,V', age:'0m 51s', status:'open', zone:'B' },
      { id:'SR-0228', cat:'EQ Failure', type:'warn', where:'Gate A4', detail:'GPU 12 intermittent. Workable but flagged.', from:'CHEN,J', age:'8m 04s', status:'enroute', zone:'A' },
      { id:'SR-0227', cat:'Bag Issue', type:'warn', where:'Gate C3', detail:'Two unidentified bags at delivery.', from:'PARK,R', age:'9m 38s', status:'ack', zone:'C' },
      { id:'SR-0225', cat:'Crew Short', type:'warn', where:'Gate C4', detail:'Need one cabin attendant for catering.', from:'DONOVAN,C', age:'12m 14s', status:'resolved', zone:'C' }
    ],

    recoveryActions: [
      { id:1, incId:'INC-0142', title:'Replace belt loader from staging', status:'inprog', assigned:'PARK,R', eta:'2 min', ts:'14:18:22' },
      { id:2, incId:'INC-0142', title:'Hold UA1842 push 6 minutes', status:'ackd', assigned:'DISPATCH', eta:'authorized', ts:'14:19:08' },
      { id:3, incId:'INC-0142', title:'Reassign 2 crew from Zone A', status:'inprog', assigned:'CHEN,J', eta:'3 min', ts:'14:19:42' },
      { id:4, incId:'INC-0142', title:'Verify connecting bag transfer B7 → B8', status:'proposed', assigned:'unassigned', eta:'—', ts:'14:21:15' },
      { id:5, incId:'INC-0142', title:'Notify ops director of cascade risk', status:'done', assigned:'KENWORTH,T', eta:'completed', ts:'14:20:11' }
    ],

    recoveryTimeline: [
      { t:'14:15:08', tp:'crit', m:'Belt loader 4 reported inoperable', who:'MORALES,J' },
      { t:'14:15:33', tp:'warn', m:'Support request opened · EQ Failure · B7', who:'MORALES,J' },
      { t:'14:16:42', tp:'info', m:'Acknowledged by Chief Kenworth · ETA 2m', who:'KENWORTH,T' },
      { t:'14:17:21', tp:'info', m:'Recovery initiated · INC-0142', who:'KENWORTH,T' },
      { t:'14:17:55', tp:'info', m:'Action proposed · Replace belt loader from staging', who:'KENWORTH,T' },
      { t:'14:18:22', tp:'warn', m:'Action in progress · PARK dispatched with backup loader', who:'PARK,R' },
      { t:'14:19:08', tp:'info', m:'Action acknowledged · Dispatch hold push 6m', who:'DISPATCH' },
      { t:'14:19:42', tp:'info', m:'Crew reassignment proposed · 2 from Zone A', who:'KENWORTH,T' },
      { t:'14:20:11', tp:'good', m:'Manager Reese notified of cascade risk', who:'KENWORTH,T' },
      { t:'14:20:48', tp:'warn', m:'Cascade ref added · B8 connecting bags impacted', who:'KENWORTH,T' },
      { t:'14:21:15', tp:'info', m:'Action proposed · Verify connecting bag transfer', who:'KENWORTH,T' }
    ],

    crew: [
      { id:'morales-j', name:'J. Morales', role:'Lead', zone:'B', pos:'B7', status:'active', lastEvt:'14:21' },
      { id:'reyes-t', name:'T. Reyes', role:'Loader', zone:'B', pos:'B7', status:'active', lastEvt:'14:18' },
      { id:'castillo-p', name:'P. Castillo', role:'Loader', zone:'B', pos:'B7', status:'active', lastEvt:'14:20' },
      { id:'hayes-s', name:'S. Hayes', role:'Lead', zone:'B', pos:'B8', status:'active', lastEvt:'14:22' },
      { id:'kim-t', name:'T. Kim', role:'Loader', zone:'B', pos:'B8', status:'active', lastEvt:'14:19' },
      { id:'alvarez-m', name:'M. Alvarez', role:'Lead', zone:'B', pos:'B14', status:'active', lastEvt:'14:22' },
      { id:'tan-r', name:'R. Tan', role:'Loader', zone:'B', pos:'B14', status:'active', lastEvt:'14:21' },
      { id:'young-l', name:'L. Young', role:'Loader', zone:'B', pos:'B14', status:'active', lastEvt:'14:22' },
      { id:'park-r', name:'R. Park', role:'Cabin', zone:'B', pos:'B11', status:'active', lastEvt:'14:22' },
      { id:'lopez-y', name:'Y. Lopez', role:'Cater', zone:'B', pos:'B9', status:'active', lastEvt:'14:21' },
      { id:'singh-p', name:'P. Singh', role:'Loader', zone:'B', pos:'—', status:'break', lastEvt:'14:08' },
      { id:'chen-j', name:'J. Chen', role:'Lead', zone:'A', pos:'A4', status:'active', lastEvt:'14:20' },
      { id:'donovan-c', name:'C. Donovan', role:'Lead', zone:'C', pos:'C4', status:'active', lastEvt:'14:19' },
      { id:'reese-l', name:'L. Reese', role:'Manager', zone:'-', pos:'OPS', status:'active', lastEvt:'14:22' },
      { id:'kenworth-t', name:'T. Kenworth', role:'Chief', zone:'B', pos:'B-ROAM', status:'active', lastEvt:'14:23' }
    ],

    equipment: [
      { id:'BL-04', type:'Belt Loader', loc:'B7', status:'failed', op:'MORALES,J', note:'Reported inoperable 14:15' },
      { id:'BL-07', type:'Belt Loader', loc:'B14', status:'in-use', op:'ALVAREZ,M', note:'Bag load' },
      { id:'BL-12', type:'Belt Loader', loc:'GSE-B-01', status:'avail', op:'—', note:'Staging · dispatched to B7' },
      { id:'TG-14', type:'Tug', loc:'B14', status:'in-use', op:'TAN,R', note:'Push staged' },
      { id:'TG-22', type:'Tug', loc:'B-PUSH', status:'in-use', op:'YOUNG,L', note:'Push lane' },
      { id:'TG-08', type:'Tug', loc:'GSE-B-01', status:'avail', op:'—', note:'Available' },
      { id:'GPU-12', type:'GPU', loc:'A4', status:'maint', op:'CHEN,J', note:'Intermittent · flagged' },
      { id:'GPU-15', type:'GPU', loc:'B9', status:'in-use', op:'—', note:'Powering N224UA' },
      { id:'CAT-03', type:'Catering', loc:'B11', status:'in-use', op:'LOPEZ,Y', note:'On position' },
      { id:'LAV-05', type:'Lav Truck', loc:'B-ROAM', status:'avail', op:'—', note:'Available' },
      { id:'FUEL-22', type:'Fuel Truck', loc:'B9', status:'in-use', op:'—', note:'UA0518 fuel' },
      { id:'STAIR-09', type:'Stair', loc:'R2', status:'in-use', op:'—', note:'Remote stand R2' }
    ],

    qrCodes: [
      { node:'B7', code:'482-117', lastScan:'14:18', scans24h:42 },
      { node:'B8', code:'482-118', lastScan:'14:22', scans24h:38 },
      { node:'B9', code:'482-119', lastScan:'14:21', scans24h:35 },
      { node:'B10', code:'482-120', lastScan:'14:19', scans24h:29 },
      { node:'B11', code:'482-121', lastScan:'14:22', scans24h:31 },
      { node:'B14', code:'482-124', lastScan:'14:23', scans24h:44 },
      { node:'B15', code:'482-125', lastScan:'14:20', scans24h:28 },
      { node:'B-PUSH', code:'482-200', lastScan:'14:11', scans24h:18 },
      { node:'BAG-B', code:'482-201', lastScan:'14:14', scans24h:62 },
      { node:'GSE-B-01', code:'482-202', lastScan:'14:09', scans24h:14 },
      { node:'BL-04', code:'482-301', lastScan:'(failed)', scans24h:5 },
      { node:'TG-14', code:'482-302', lastScan:'14:22', scans24h:11 }
    ],

    seedEvents: [
      ['14:23:08','SERVICE','good','Service confirmed · Bag load complete','B14 · N728UA','ALVAREZ,M'],
      ['14:22:51','SERVICE','good','Service confirmed · Bag load complete','B11 · N802UA','PARK,R'],
      ['14:22:43','RECOVERY','info','Action proposed · Hold push B15 (6 min)','B15 · N311UA','KENWORTH,T'],
      ['14:22:38','POSITION','info','Crew on-position confirmed','A5 · N722UA','DONOVAN,C'],
      ['14:22:21','SUPPORT','warn','Support acknowledged · Crew short B8','B8 · N916UA','KENWORTH,T'],
      ['14:22:09','INCIDENT','crit','EQ failure logged · Belt loader 4 inoperable','B7 · N401UA','MORALES,J'],
      ['14:21:54','SERVICE','good','Lav service complete','B14 · N728UA','ALVAREZ,M'],
      ['14:21:42','RECOVERY','info','Recovery initiated · INC-0142','B7 · N401UA','KENWORTH,T'],
      ['14:21:31','SERVICE','good','Fueling started','B9 · N224UA','LOPEZ,Y'],
      ['14:21:18','SUPPORT','warn','Support request created · Bag count off','B14 · N728UA','ALVAREZ,M'],
      ['14:21:02','POSITION','info','Crew on-position confirmed','B12 · N105UA','HAYES,S'],
      ['14:20:48','SERVICE','good','Cabin clean confirmed','A2 · N847UA','PARK,R'],
      ['14:20:31','SERVICE','good','Catering loaded','B11 · N802UA','LOPEZ,Y'],
      ['14:20:11','RECOVERY','info','Manager Reese added as participant','B7 · N401UA','KENWORTH,T'],
      ['14:19:42','RECOVERY','info','Action: Reassign crew from Zone A · in progress','B7 · N401UA','KENWORTH,T'],
      ['14:19:08','RECOVERY','info','Action acknowledged · Dispatch hold push','B7 · N401UA','DISPATCH'],
      ['14:18:22','RECOVERY','warn','Action in progress · Replace belt loader','B7 · N401UA','PARK,R'],
      ['14:17:55','RECOVERY','info','Action proposed · Replace belt loader from staging','B7 · N401UA','KENWORTH,T'],
      ['14:17:21','INCIDENT','crit','Incident opened · EQ Failure cascade','B7 · N401UA','KENWORTH,T'],
      ['14:16:42','SUPPORT','warn','Support acknowledged · ETA 2 min','B7 · N401UA','KENWORTH,T'],
      ['14:15:33','SUPPORT','crit','Support requested · EQ Failure belt loader 4','B7 · N401UA','MORALES,J'],
      ['14:15:08','EXCEPTION','crit','Equipment failure reported · belt loader 4','B7 · N401UA','MORALES,J']
    ]
  };

  function load() {
    try {
      const s = localStorage.getItem(KEY);
      if (s) return JSON.parse(s);
    } catch(e) {}
    return JSON.parse(JSON.stringify(DEFAULTS));
  }
  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch(e) {}
  }
  function reset() {
    localStorage.removeItem(KEY);
    return JSON.parse(JSON.stringify(DEFAULTS));
  }

  window.RampIQ = window.RampIQ || {};
  window.RampIQ.data = {
    DEFAULTS,
    load, save, reset,
    get state() { return load(); },
    update(fn) {
      const s = load();
      fn(s);
      save(s);
      return s;
    }
  };
})();
