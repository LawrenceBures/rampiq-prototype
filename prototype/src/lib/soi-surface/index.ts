/**
 * SOI Surface System
 *
 * Slot-based operational command environment.
 * Composed, never improvised.
 */

export {
  type SlotId, type SlotRegion, type ModuleSize, type LayoutName, type RoleId,
  type ModuleInstance, type LayoutState, type ModuleDefinition,
  SLOT_REGIONS, LEFT_SLOTS, RIGHT_SLOTS, UTILITY_SLOTS, ALL_SLOTS,
  MODULE_REGISTRY, getModuleDef,
  saveLayout, loadLayout, getLastUsedLayoutName, setLastUsedLayoutName,
} from './layout-state';

export {
  getRolePreset, getCrisisPreset, createDefaultLayout, ROLE_LABELS,
} from './role-presets';
