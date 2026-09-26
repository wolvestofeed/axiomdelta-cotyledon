import 'server-only';
import { loadDefinitions, resolveWithDefinitions } from './scenarios';
import { listMenuCycles } from './orders';
import { loadActuals } from './actuals';
import { listReadings, listRefrigerantService } from './sustainability-records';
import type { SustainabilityRecords } from '../_engine/sustainability-records';
import { horizonEnd, simulateForecast } from '../_engine/forecast-timeline';
import { planBundle } from '../_engine/plan-ledger';
import { sustainabilityBasis, type SustainabilityBasis } from '../_engine/sustainability-basis';
import type { MuseScenarioConfig } from '../_engine/scenario';

/**
 * The sustainability volume on a ledger (Roadmap N6 slice 4), for the action and the
 * evidence pack. Plan: the forecast's own timeline over its first year. Actual: the
 * recorded documents over the reporting year, a calendar year.
 */
export async function postSustainabilityBasis(kind: 'plan' | 'actual', config: MuseScenarioConfig): Promise<SustainabilityBasis> {
  const [definitions, cycles] = await Promise.all([loadDefinitions(), listMenuCycles()]);
  const inputs = resolveWithDefinitions(config, definitions);
  const common = {
    holdLifeDays: inputs.assumptions.inventory.chilledHoldLife.value,
    recipes: inputs.recipes,
    portionFactorByChannel: Object.fromEntries(inputs.phaseProfiles.map((p) => [p.phase, p.portionFactor.value])) as Record<number, number>,
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
