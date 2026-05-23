// RampIQ Phase 1 — Type definitions and constants.
// All operational state comes from events. No hardcoded seed state.

// ============================================================
// ENUMS / UNIONS
// ============================================================

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type OperationalStatus = 'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'CANCELLED';
export type QrTargetType = 'GATE' | 'EQUIPMENT' | 'FLIGHT' | 'CHECKPOINT';
export type ShiftWindow = 'AM' | 'PM' | 'OVERNIGHT';
export type SyncStatus = 'SYNCED' | 'PENDING' | 'FAILED';
export type SourcePlatform = 'IOS_SAFARI' | 'ANDROID_CHROME' | 'ZEBRA_TC56' | 'DESKTOP';
export type RoleType = 'TUG_CREW' | 'BAG_RUNNER' | 'LEAD' | 'SUPERVISOR' | 'CABIN_CLEANER' | 'FUELER' | 'RAMP_AGENT';
export type ScanSource = 'camera_jsqr' | 'datawedge_keystroke' | 'manual_entry';

// ============================================================
// QR TARGET
// ============================================================

export interface QrTarget {
  id: string;                 // QR-encoded value (e.g. "LAX-GATE-G42B")
  target_type: QrTargetType;
  station: string;
  gate_id: string | null;
  equipment_id: string | null;
  equipment_kind: string | null;
  flight_id: string | null;
  label: string;
  active: boolean;
  created_at: string;
}

// ============================================================
// EVENT TYPE (controlled vocabulary)
// ============================================================

export interface EventType {
  code: string;
  label: string;
  default_severity: Severity;
  applicable_targets: QrTargetType[];
  active: boolean;
  display_order: number;
}

// ============================================================
// USER (lightweight identity)
// ============================================================

export interface UserLite {
  id: string;
  display_name: string | null;
  role_type: RoleType;
  default_shift: ShiftWindow | null;
  station: string;
  active: boolean;
}

// ============================================================
// RAMPIQ EVENT (operational memory record)
// ============================================================

export interface RampiqEvent {
  id: string;
  created_at: string;
  offline_created_at: string | null;

  event_type: string;
  event_subtype: string | null;
  severity: Severity;

  station: string;
  gate_id: string | null;
  flight_id: string | null;
  equipment_id: string | null;
  qr_target_type: QrTargetType;
  qr_target_id: string;

  notes: string | null;
  operational_status: OperationalStatus;

  reported_by: string;
  role_type: string;
  shift_window: ShiftWindow;
  device_id: string;
  source_platform: SourcePlatform;

  resolved_at: string | null;
  resolved_by: string | null;
  event_duration_seconds: number | null;

  sync_status: SyncStatus;
}

// ============================================================
// SCAN EVENT (hardware abstraction)
// ============================================================

export interface ScanEvent {
  decoded_value: string;
  source: ScanSource;
  timestamp: number;
}

// ============================================================
// EVENT SUBMISSION PAYLOAD (what the form sends)
// ============================================================

export interface EventSubmission {
  event_type: string;
  event_subtype?: string;
  severity: Severity;
  station: string;
  gate_id?: string;
  flight_id?: string;
  equipment_id?: string;
  qr_target_type: QrTargetType;
  qr_target_id: string;
  notes?: string;
  reported_by: string;
  role_type: string;
  shift_window: ShiftWindow;
  device_id: string;
  source_platform: SourcePlatform;
  offline_created_at?: string;
}

// ============================================================
// AGENT IDENTITY (session state)
// ============================================================

export interface AgentIdentity {
  user_id: string;
  display_name: string;
  role_type: RoleType;
  shift_window: ShiftWindow;
  device_id: string;
  station: string;
}

// ============================================================
// CONSTANTS
// ============================================================

export const SEVERITY_ORDER: Record<Severity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

export const SEVERITY_COLORS: Record<Severity, string> = {
  CRITICAL: 'var(--rq-red)',
  HIGH: 'var(--rq-red)',
  MEDIUM: 'var(--rq-amber)',
  LOW: 'var(--rq-ink-3)',
};

export const STATUS_LABELS: Record<OperationalStatus, string> = {
  OPEN: 'Open',
  ACKNOWLEDGED: 'Acknowledged',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
  CANCELLED: 'Cancelled',
};

export const ROLE_LABELS: Record<RoleType, string> = {
  TUG_CREW: 'Tug Crew',
  BAG_RUNNER: 'Bag Runner',
  LEAD: 'Lead',
  SUPERVISOR: 'Supervisor',
  CABIN_CLEANER: 'Cabin Cleaner',
  FUELER: 'Fueler',
  RAMP_AGENT: 'Ramp Agent',
};

export const SHIFT_LABELS: Record<ShiftWindow, string> = {
  AM: 'AM Shift',
  PM: 'PM Shift',
  OVERNIGHT: 'Overnight',
};

// ============================================================
// HELPERS
// ============================================================

export function detectPlatform(): SourcePlatform {
  if (typeof navigator === 'undefined') return 'DESKTOP';
  const ua = navigator.userAgent;
  if (/TC56/i.test(ua)) return 'ZEBRA_TC56';
  if (/iPhone|iPad/i.test(ua)) return 'IOS_SAFARI';
  if (/Android/i.test(ua)) return 'ANDROID_CHROME';
  return 'DESKTOP';
}

export function isZebra(): boolean {
  return detectPlatform() === 'ZEBRA_TC56';
}

export function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return iso;
  }
}

export function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ' ' +
      d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return iso;
  }
}

export function eventAge(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function durationLabel(seconds: number | null): string {
  if (seconds == null) return '--';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// ============================================================
// WORKFORCE READINESS — ENUMS
// ============================================================

export type CertStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED';
export type QualStatus = 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
export type LearningStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
export type CertCategory = 'SAFETY' | 'EQUIPMENT' | 'PROCEDURE' | 'HAZMAT';

// ============================================================
// WORKFORCE READINESS — INTERFACES
// ============================================================

export interface CertificationType {
  code: string;
  label: string;
  category: CertCategory;
  required_for: RoleType[];
  renewal_months: number | null;
  active: boolean;
  display_order: number;
}

export interface UserCertification {
  id: string;
  user_id: string;
  cert_code: string;
  earned_at: string;
  expires_at: string | null;
  status: CertStatus;
  notes: string | null;
  // joined fields
  cert_label?: string;
  cert_category?: CertCategory;
}

export interface EquipmentQualType {
  code: string;
  label: string;
  category: string;
  active: boolean;
  display_order: number;
}

export interface UserEquipmentQual {
  id: string;
  user_id: string;
  equip_code: string;
  qualified_at: string;
  status: QualStatus;
  // joined
  equip_label?: string;
}

export interface Team {
  id: string;
  label: string;
  shift: ShiftWindow;
  station: string;
  lead_user_id: string | null;
  active: boolean;
}

export interface TeamMember {
  team_id: string;
  user_id: string;
  // joined
  display_name?: string;
  role_type?: RoleType;
}

export interface Zone {
  id: string;
  label: string;
  station: string;
  gate_ids: string[];
  active: boolean;
}

export interface UserZoneAssignment {
  user_id: string;
  zone_id: string;
  shift: ShiftWindow;
  assigned_at: string;
  // joined
  zone_label?: string;
}

export interface ShiftStatusRecord {
  user_id: string;
  on_shift: boolean;
  shift_start: string | null;
  shift_window: ShiftWindow | null;
  updated_at: string;
}

export interface LearningModule {
  code: string;
  label: string;
  category: string;
  required_for: RoleType[];
  display_order: number;
  active: boolean;
}

export interface UserLearningProgress {
  id: string;
  user_id: string;
  module_code: string;
  status: LearningStatus;
  started_at: string | null;
  completed_at: string | null;
  score: number | null;
  // joined
  module_label?: string;
}

export interface RecommendationLog {
  id: string;
  created_at: string;
  recommendation_type: string;
  target_user_id: string | null;
  context_json: Record<string, unknown> | null;
  override_used: boolean;
  override_reason: string | null;
  override_by: string | null;
  resolved_at: string | null;
}

// ============================================================
// COMPOSITES (assembled client-side)
// ============================================================

export interface AgentProfile {
  user: UserLite;
  certifications: UserCertification[];
  equipmentQuals: UserEquipmentQual[];
  team: Team | null;
  zoneAssignments: UserZoneAssignment[];
  shiftStatus: ShiftStatusRecord | null;
  learningProgress: UserLearningProgress[];
}

// All metrics traceable to operational events — no opaque formulas
export interface OperationalMetrics {
  user_id: string;
  total_events: number;
  events_last_7d: number;
  avg_resolution_seconds: number | null; // recovery performance
  response_rate: number;                 // % of events reaching resolution
  events_by_type: Record<string, number>;
}

export interface TeamReadiness {
  team: Team;
  members: (UserLite & { on_shift: boolean })[];
  cert_compliance: number; // percentage
}

export interface CertGap {
  cert_code: string;
  cert_label: string;
  required_count: number;
  active_count: number;
  expiring_soon: number; // within 30 days
}

export interface EquipCoverage {
  equip_code: string;
  equip_label: string;
  qualified_on_shift: number;
  qualified_total: number;
}

export interface OperationalReadiness {
  total_on_shift: number;
  total_off_shift: number;
  teams: TeamReadiness[];
  cert_gaps: CertGap[];
  equip_coverage: EquipCoverage[];
}

// ============================================================
// WORKFORCE READINESS — CONSTANTS
// ============================================================

export const CERT_STATUS_LABELS: Record<CertStatus, string> = {
  ACTIVE: 'Active',
  EXPIRED: 'Expired',
  REVOKED: 'Revoked',
};

export const LEARNING_STATUS_LABELS: Record<LearningStatus, string> = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
};
