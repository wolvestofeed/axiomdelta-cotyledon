'use server';

import { z } from 'zod';
import { accessRefusal, requireFarmOperator } from './access';
import type { SustainabilityBasis } from '../_engine/sustainability-basis';
import { loadSustainabilityRecords, postSustainabilityBasis } from './sustainability';
import type { SustainabilityRecords } from '../_engine/sustainability-records';
import type { FarmScenarioConfig } from '../_engine/scenario';

/**
 * MicroFarm — the sustainability volume on the selected ledger (Roadmap N6 slice 4).
 * Plan runs the working copy's own timeline, unsaved edits included, over its first
 * year; Actual reads the recorded documents over the reporting year, a calendar year.
 * Nothing is written.
 */

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

const Input = z.object({
  kind: z.enum(['plan', 'actual']),
  config: z.record(z.string(), z.unknown()).default({}),
});

export async function loadSustainabilityBasis(input: unknown): Promise<Result<{ basis: SustainabilityBasis; records: SustainabilityRecords | null }>> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'The sustainability request was not understood.' };
  try {
    await requireFarmOperator();
  } catch (e) {
    const refused = accessRefusal(e);
    if (refused) return refused;
    throw e;
  }
  const basis = await postSustainabilityBasis(parsed.data.kind, parsed.data.config as FarmScenarioConfig);
  const records = parsed.data.kind === 'actual' ? await loadSustainabilityRecords(Number(basis.from.slice(0, 4))) : null;
  return { ok: true, basis, records };
}
