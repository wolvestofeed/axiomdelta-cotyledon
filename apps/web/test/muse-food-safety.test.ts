/**
 * Impact OS — CCP-2 two-stage cooling.
 *
 * The verdict on a cooling record is COMPUTED from the measured temperatures, so
 * these prove the limits are applied as the FDA Food Code model states them. The
 * log itself is read from the closed batch records (Roadmap N9).
 */

import { describe, it, expect } from 'vitest';
import { evaluateCcp2, CCP2_LIMITS } from '@/app/(muse)/muse/_engine/food-safety';
import { coolingLoadsOf, type CoolingRecord } from '@/app/(muse)/muse/_engine/batch';

describe('muse CCP-2 — the critical limits', () => {
  it('passes when both checks are at or below their limit', () => {
    const r = evaluateCcp2(70, 41);
    expect(r.pass).toBe(true);
    expect(r.failedStages).toEqual([]);
  });

  it('the limits are inclusive — exactly at the limit is within it', () => {
    expect(evaluateCcp2(CCP2_LIMITS.twoHourMaxF, CCP2_LIMITS.sixHourMaxF).pass).toBe(true);
    expect(evaluateCcp2(CCP2_LIMITS.twoHourMaxF + 1, CCP2_LIMITS.sixHourMaxF).pass).toBe(false);
    expect(evaluateCcp2(CCP2_LIMITS.twoHourMaxF, CCP2_LIMITS.sixHourMaxF + 1).pass).toBe(false);
  });

  it('names the two-hour stage first — it is the one with a corrective action', () => {
    const r = evaluateCcp2(78, 45);
    expect(r.failedStages).toEqual(['two_hour', 'six_hour']);
    expect(r.reason).toContain('2-hour');
  });

  it('a six-hour failure alone is still a failure', () => {
    const r = evaluateCcp2(65, 44);
    expect(r.pass).toBe(false);
    expect(r.failedStages).toEqual(['six_hour']);
  });

  it('states the measurement against the limit rather than a bare verdict', () => {
    expect(evaluateCcp2(78, 41).reason).toBe('78°F at the 2-hour check, above the 70°F limit');
    expect(evaluateCcp2(64, 39).reason).toBe('64°F at 2 h and 39°F at 6 h, both within the limit');
  });
});

describe('muse CCP-2 — the illustrative register is retired (Roadmap N9)', () => {
  it('no module reads _data/lots; the cooling log is the batch records', async () => {
    const { existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    expect(existsSync(join(__dirname, '..', 'src', 'app', '(muse)', 'muse', '_data', 'lots.ts'))).toBe(false);
  });
});

describe('muse CCP-2 — one cooling record per cabinet load; the cook is the lot (Robert, 2026-09-17)', () => {
  const load = (t2F: number): CoolingRecord => ({ t0F: 135, t2F, t6F: 40, startedAt: '11:00', endedAt: '17:00' });

  it('a double batch carries two cooling records on the one lot', () => {
    const loads = coolingLoadsOf({ cooling: [load(68), load(72)] });
    expect(loads).toHaveLength(2);
    expect(loads.map((l) => evaluateCcp2(l.t2F, l.t6F).pass)).toEqual([true, false]);
  });

  it('a record written before the lot was the cook holds one object, read as one load', () => {
    const legacy = { cooling: load(70) as unknown as CoolingRecord[] };
    expect(coolingLoadsOf(legacy)).toEqual([load(70)]);
  });

  it('no readings is an empty list, never a placeholder', () => {
    expect(coolingLoadsOf({})).toEqual([]);
    expect(coolingLoadsOf({ cooling: undefined })).toEqual([]);
    expect(coolingLoadsOf({ cooling: null as unknown as CoolingRecord[] })).toEqual([]);
  });
});
