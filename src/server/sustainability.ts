import 'server-only';
import { loadDefinitions, resolveWithDefinitions } from '@/server/scenarios';
import { listSubscriptionCycles } from '@/server/orders';
import { loadActuals } from '@/server/actuals';
import { listReadings, listRefrigerantService } from '@/server/sustainability-records';
import type { SustainabilityRecords } from '@/engine/sustainability-records';
import { horizonEnd, simulateForecast } from '@/engine/forecast-timeline';
import { planBundle } from '@/engine/plan-ledger';
import { sustainabilityBasis, type SustainabilityBasis } from '@/engine/sustainability-basis';
import type { FarmScenarioConfig } from '@/engine/scenario';

/**
 * The sustainability volume on a ledger (Roadmap N6 slice 4), for the action and the
 * evidence pack. Plan: the forecast's own timeline over its first year. Actual: the
 * recorded documents over the reporting year, a calendar year.
 */
export async function postSustainabilityBasis(kind: 'plan' | 'actual', config: FarmScenarioConfig): Promise<SustainabilityBasis> {
  const [definitions, cycles] = await Promise.all([loadDefinitions(), listSubscriptionCycles()]);
  const inputs = resolveWithDefinitions(config, definitions);
  const common = {
    shelfLifeDays: inputs.assumptions.inventory.blackoutShelfLife.value,
    cropPlans: inputs.cropPlans,
    unitFactorByChannel: Object.fromEntries(inputs.phaseProfiles.map((p) => [p.phase, p.unitFactor.value])) as Record<number, number>,
  };
  if (kind === 'plan') {
    const timeline = simulateForecast({ inputs, cycles });
    const end = horizonEnd(timeline.from, 1);
    return sustainabilityBasis({ kind, bundle: planBundle(timeline), from: timeline.from, to: end < timeline.to ? end : timeline.to, ...common });
  }
  const year = inputs.sustainability.audit.reportingYear;
  return sustainabilityBasis({ kind, bundle: await loadActuals(), from: `${year}-01-01`, to: `${year}-12-31`, ...common });
}

/** The records Actual reads for its reporting year; Plan has none. */
export async function loadSustainabilityRecords(year: number): Promise<SustainabilityRecords> {
  const [readings, refrigerantService] = await Promise.all([listReadings(), listRefrigerantService()]);
  return { year, readings, refrigerantService };
}
