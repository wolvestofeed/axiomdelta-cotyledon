import { purchaseLines } from '@/engine/grow-purchase';
import { describe, it, expect } from 'vitest';
import { assumptions } from '@/data/plan-data';
import { deriveCapacity } from '@/engine';
import { resolveScenarioInputs, inputKey, assumptionsFor } from '@/engine/scenario';
import { standardSowingRecordPrefill, type ActualsBundle, type SowingRecordDoc } from '@/engine/actuals';
import { postActuals } from '@/engine/actuals-ledger';
import { standardInForce, standardHistory, nextStandardVersion, standardDiffers, standardLabel, libraryLabel, standardSnapshot, readSnapshot, type StandardVersionDoc } from '@/engine/standards';

// What an approval freezes: the plan's OWN labor standard (Roadmap N3), its variable overhead per
// tray and, when given, the fixed overhead rate, on the seed grow plans' reference plan.
const R0 = resolveScenarioInputs();
const growPlan = R0.growPlan;
const sowingSize = deriveCapacity(growPlan, R0.capacityInputs).sowingSize;
const ownAssumptions = assumptionsFor(R0, growPlan.code);
const version = (n: number, effectiveFrom: string, over: Partial<StandardVersionDoc> = {}): StandardVersionDoc => ({
  id: `s${n}`, growPlanCode: growPlan.code, version: n, effectiveFrom, approvedBy: 'cpa@example.com', approvedAt: `${effectiveFrom}T09:00:00.000Z`, notes: null,
  snapshot: standardSnapshot(growPlan, ownAssumptions), ...over,
});
const sowing = (productionDate: string, standardVersion = libraryLabel(growPlan.code)): SowingRecordDoc => ({
  ...standardSowingRecordPrefill(productionDate, 1, sowingSize, growPlan, assumptions.yield.shrinkAllowance.value, standardVersion),
  id: `b-${productionDate}`,
  closedAt: null,
  closedBy: 'R. Bogatin',
});
const bundle = (sowings: SowingRecordDoc[], standards?: StandardVersionDoc[]): ActualsBundle => ({ sowings, receipts: [], distributions: [], bills: [], ...(standards ? { standards } : {}) });

describe('approved standard versions (Roadmap J5)', () => {
  const versions = [version(1, '2026-08-01'), version(2, '2026-09-15'), version(3, '2026-09-15', { notes: 'same-day correction' })];

  it('picks the latest effective date on or before the production date, highest version on a tie', () => {
    expect(standardInForce(versions, growPlan.code, '2026-07-31')).toBeNull();
    expect(standardInForce(versions, growPlan.code, '2026-08-01')?.version).toBe(1);
    expect(standardInForce(versions, growPlan.code, '2026-09-14')?.version).toBe(1);
    expect(standardInForce(versions, growPlan.code, '2026-09-15')?.version).toBe(3);
    expect(standardInForce(versions, 'NONE-99', '2026-09-15')).toBeNull();
  });

  it('history is newest first, the next version number follows the highest, labels are code@vN', () => {
    expect(standardHistory(versions, growPlan.code).map((v) => v.version)).toEqual([3, 2, 1]);
    expect(nextStandardVersion(versions, growPlan.code)).toBe(4);
    expect(nextStandardVersion(versions, 'NONE-99')).toBe(1);
    expect(standardLabel(versions[0]!)).toBe(`${growPlan.code}@v1`);
    expect(libraryLabel(growPlan.code)).toBe(`${growPlan.code}@library`);
  });

  it('a snapshot differs from the live standard when labor or overhead per tray moved, never when a price did', () => {
    const live = standardSnapshot(growPlan, ownAssumptions);
    expect(standardDiffers(versions[0]!.snapshot, live)).toBe(false);
    const first = purchaseLines(growPlan)[0]!;
    const dearer = { ...structuredClone(growPlan), prices: { [first.name]: { unitCost: first.unitCost * 1.1, status: 'STATED' as const, source: 'test' } } };
    expect(standardDiffers(versions[0]!.snapshot, standardSnapshot(dearer, ownAssumptions))).toBe(false);
    expect(standardDiffers(versions[0]!.snapshot, { ...live, labor: { ...live.labor, variableMinutesPerUnit: live.labor.variableMinutesPerUnit + 1 } })).toBe(true);
    expect(standardDiffers(versions[0]!.snapshot, { ...live, variableOverheadPerTray: { ...live.variableOverheadPerTray, consumables: live.variableOverheadPerTray.consumables + 0.01 } })).toBe(true);
  });

  it('a version freezes no material price: a price rise on the library reaches a sowing under a version', () => {
    const first = purchaseLines(growPlan)[0]!;
    const dearer = resolveScenarioInputs({ inputs: { [inputKey(growPlan.code, first.name)]: { unitCost: first.unitCost * 2 } } });
    const std = version(1, '2026-09-01');
    const atStandard = postActuals(bundle([sowing('2026-09-14', standardLabel(std))], [std]), dearer);
    const atLibrary = postActuals(bundle([sowing('2026-09-14')]), dearer);
    const base = postActuals(bundle([sowing('2026-09-14')]));
    const material = (r: ReturnType<typeof postActuals>) => r.periods[0]!.sowings[0]!.amounts.materialIssuedToWip;
    expect(material(atStandard)).toBeGreaterThan(material(base));
    expect(material(atStandard)).toBeCloseTo(material(atLibrary), 6);
    expect(atLibrary.periods[0]!.notes.some((n) => n.includes('no approved standard in force'))).toBe(true);
    expect(atStandard.periods[0]!.notes.some((n) => n.includes('no approved standard'))).toBe(false);
    expect(atStandard.balanced && atLibrary.balanced).toBe(true);
  });

  it('a sowing with no crew recorded takes the labor standard the version froze; one with crew recorded does not', () => {
    const live = standardSnapshot(growPlan, ownAssumptions);
    const std = version(1, '2026-09-01', { snapshot: { ...live, labor: { ...live.labor, loadedRatePerHour: live.labor.loadedRatePerHour * 2 } } });
    const labor = (r: ReturnType<typeof postActuals>) => r.periods[0]!.sowings[0]!.amounts.directLaborActual;
    const base = postActuals(bundle([sowing('2026-09-14')]));
    expect(labor(postActuals(bundle([sowing('2026-09-14', standardLabel(std))], [std])))).toBeCloseTo(labor(base) * 2, 6);
    const crewed = { ...sowing('2026-09-14', standardLabel(std)), actualLaborHours: 5, actualLaborRate: 30 };
    expect(labor(postActuals(bundle([crewed], [std])))).toBeCloseTo(150, 6);
  });

  it('light, tray wear and sanitizer apply at the version\'s rates per tray', () => {
    const live = standardSnapshot(growPlan, ownAssumptions);
    const std = version(1, '2026-09-01', { snapshot: { ...live, variableOverheadPerTray: { light: 1, consumables: 0.5 } } });
    const led = postActuals(bundle([sowing('2026-09-14', standardLabel(std))], [std])).periods[0]!.sowings[0]!;
    const trays = led.amounts.traysSown * (1 + assumptions.yield.shrinkAllowance.value);
    expect(led.amounts.lightApplied).toBeCloseTo(trays, 6);
    expect(led.amounts.consumablesApplied).toBeCloseTo(trays * 0.5, 6);
  });

  it('a version stored with the whole grow plan and assumptions reads as the labor and overhead it froze', () => {
    const expected = standardSnapshot(growPlan, ownAssumptions, 1.2);
    expect(readSnapshot({ growPlan, assumptions: ownAssumptions, overheadRatePerUnit: 1.2 })).toEqual(expected);
    expect(readSnapshot({ growPlan: { plan: growPlan }, assumptions: ownAssumptions })).toEqual(standardSnapshot(growPlan, ownAssumptions));
    expect(readSnapshot(expected)).toBe(expected);
  });

  it('a record naming a different version than the one in force is costed at the one in force, with a note', () => {
    const std = version(2, '2026-09-01');
    const posted = postActuals(bundle([sowing('2026-09-14', `${growPlan.code}@v1`)], [std]));
    expect(posted.periods[0]!.notes.some((n) => n.includes(`names ${growPlan.code}@v1; the version in force on 2026-09-14 is ${growPlan.code}@v2`))).toBe(true);
  });

  it('the prefill names the standard it was built from', () => {
    expect(standardSowingRecordPrefill('2026-09-14', 1, sowingSize, growPlan).standardVersion).toBe(`${growPlan.code}@library`);
    expect(standardSowingRecordPrefill('2026-09-14', 1, sowingSize, growPlan, 0.03, `${growPlan.code}@v7`).standardVersion).toBe(`${growPlan.code}@v7`);
  });

  it('a standard freezes the grow plan\'s own labor, not the typed figure every grow plan shared (Roadmap N3)', () => {
    const typed = assumptions.laborSplit.variableMinutesPerUnit.value;
    const own = ownAssumptions.laborSplit.variableMinutesPerUnit.value;
    // AMK-E-001's own estimated study is not the plan's linear 1.5 min a unit.
    expect(own).not.toBeCloseTo(typed, 3);
    expect(version(1, '2026-09-01').snapshot.labor.variableMinutesPerUnit).toBeCloseTo(own, 10);
  });

  it('a standard carrying an overhead rate absorbs at it, not at the live rate (audit A15)', () => {
    const std = version(1, '2026-09-01', { snapshot: standardSnapshot(growPlan, ownAssumptions, 9.99) });
    const frozen = postActuals(bundle([sowing('2026-09-14', standardLabel(std))], [std]));
    const live = postActuals(bundle([sowing('2026-09-14', standardLabel(version(1, '2026-09-01')))], [version(1, '2026-09-01')]));
    const absorbed = (r: ReturnType<typeof postActuals>) => r.periods[0]!.sowings[0]!.amounts.overheadAbsorbed;
    const units = frozen.periods[0]!.sowings[0]!.amounts.unitsProduced;
    expect(absorbed(frozen)).toBeCloseTo(9.99 * units, 6);
    expect(absorbed(live)).not.toBeCloseTo(absorbed(frozen), 2);
  });

  it('a standard approved before rates were frozen absorbs at the live rate, and the ledger says so', () => {
    const legacy = version(1, '2026-09-01'); // no overheadRatePerUnit on the snapshot
    const r = postActuals(bundle([sowing('2026-09-14', standardLabel(legacy))], [legacy]));
    expect(r.periods[0]!.notes.some((n) => n.includes('before standards froze the overhead rate'))).toBe(true);
  });

  it('a changed overhead rate counts as a difference only when both sides carry one', () => {
    const withRate = standardSnapshot(growPlan, ownAssumptions, 1.35);
    expect(standardDiffers(withRate, { ...withRate, overheadRatePerUnit: 1.35 })).toBe(false);
    expect(standardDiffers(withRate, { ...withRate, overheadRatePerUnit: 1.4 })).toBe(true);
    const legacy = standardSnapshot(growPlan, ownAssumptions);
    expect(standardDiffers(legacy, withRate)).toBe(false);
  });
});
