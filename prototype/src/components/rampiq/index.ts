// RampIQ — Shared operational primitives.
//
// ARCHITECTURAL RULES:
//   1. Every component is presentation-only
//   2. Every component is deterministic (same props → same output)
//   3. Every component is replay-safe (accepts optional asOf where time matters)
//   4. Every component is side-effect free (no fetching, no subscriptions, no mutations)
//   5. Components receive operational truth via props
//   6. Components emit callbacks only (onClick, onAction)
//   7. All color/state derivation comes from operational-states.ts
//
// These components are the canonical visual expression of the
// operational language defined in operational-states.ts.

export { SeverityIndicator } from './SeverityIndicator';
export type { SeverityVariant } from './SeverityIndicator';

export { OperationalStatus } from './OperationalStatus';

export { ElapsedTime } from './ElapsedTime';

export { PressureBar } from './PressureBar';

export { ActionButton } from './ActionButton';

export { GateCard } from './GateCard';
export type { GateCardVariant } from './GateCard';

export { EventRow } from './EventRow';

export { ZoneTile } from './ZoneTile';

export { EventCard } from './EventCard';

export { IncidentCard } from './IncidentCard';

export { KpiStrip } from './KpiStrip';

export { IncidentDetailPanel } from './IncidentDetailPanel';

export { CommandBar } from './CommandBar';
