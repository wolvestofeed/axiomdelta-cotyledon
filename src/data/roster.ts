/**
 * MicroFarm — the facility's roster until Staffing's (Phase 4) is connected. Rob grows alone;
 * the next production hire is a Grower, carried at no headcount until hired (STATED by Rob).
 * No pay is held here: Staffing holds wages and burden. Training assigns courses and
 * certificates to these titles.
 */

export interface RosterPosition {
  title: string;
  headcount: number;
  shift: string;
  onFloor?: boolean; // works production-floor hours (default true)
}

export const roster: RosterPosition[] = [
  { title: 'Rob Bogatin', headcount: 1, shift: 'Every production day' },
  { title: 'Grower', headcount: 0, shift: 'The next production hire, not yet hired' },
];
