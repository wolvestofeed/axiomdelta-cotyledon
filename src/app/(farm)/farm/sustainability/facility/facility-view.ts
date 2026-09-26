import type { DatedEquipmentLine } from '@/engine/equipment';
import type { FacilityConfiguration, FacilityRequirement, FacilityRow } from '@/engine/facility';

/** What every Facility tab reads: the commercial library as the open forecast phases it, and the requirement derived from it. */
export interface FacilityView {
  lines: DatedEquipmentLine[];
  /** The forecast selects at least one commercial row: there is a facility to size. */
  selected: boolean;
  rows: FacilityRow[];
  requirement: FacilityRequirement;
  configurations: FacilityConfiguration[];
  /** Peak Single Units the support program is sized against; a what-if on this page, not a saved input. */
  psm: number;
  setPsm: (v: number) => void;
  canEdit: boolean;
  scenarioKey: string;
  scenarioLabel: string;
  /** 'plan' when the plan of record is open, 'forecast' when a saved forecast is. */
  basis: 'plan' | 'forecast';
}
