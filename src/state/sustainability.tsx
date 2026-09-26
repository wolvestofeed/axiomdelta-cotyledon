'use client';

import { useMemo } from 'react';
import { useScenario } from '@/state/scenario-store';
import { useSustainabilityBasis } from '@/state/ledger';
import { emptySustainabilityBasis, mixFoodFootprint } from '@/engine/sustainability-basis';
import { energyFromReadings, serviceFromRecords, waterFromReadings } from '@/engine/sustainability-records';
import type { LcaOption } from '@/data/lca-options';

/**
 * The world a Sustainability page runs in.
 *
 *   Plan    the open forecast's own year: its timeline's units, production,
 *           receipts and distributions, and the energy and water quantities loaded
 *           into the scenario. A forecast carries no refrigerant leaks.
 *   Actual  the records in the reporting year, a calendar year: sowing records,
 *           receipts and distributions, utility bills and lab results, and
 *           refrigerant service tickets.
 */
export function useSustainabilityWorld(options?: LcaOption[]) {
  const { resolved } = useScenario();
  const posted = useSustainabilityBasis();
  const isPlan = posted.kind === 'plan';
  const year = resolved.sustainability.audit.reportingYear;
  const basis = posted.basis ?? emptySustainabilityBasis(posted.kind, isPlan ? resolved.forecast.startDate : `${year}-01-01`, `${year}-12-31`);
  const records = posted.records;
  const pfByChannel = useMemo(() => Object.fromEntries(resolved.phaseProfiles.map((p) => [p.phase, p.unitFactor.value])) as Record<number, number>, [resolved.phaseProfiles]);
  const energy = useMemo(() => (isPlan ? resolved.sustainability.energy : energyFromReadings(records?.readings ?? [], year)), [isPlan, resolved.sustainability.energy, records, year]);
  const water = useMemo(() => (isPlan ? resolved.sustainability.water : waterFromReadings(records?.readings ?? [], year)), [isPlan, resolved.sustainability.water, records, year]);
  const refrigerantService = useMemo(() => (isPlan ? {} : serviceFromRecords(records?.refrigerantService ?? [])), [isPlan, records]);
  const food = useMemo(
    () => mixFoodFootprint({ basis, cropPlans: resolved.cropPlans, unitFactorByChannel: pfByChannel, selection: resolved.sustainability.inputBasis, options }),
    [basis, resolved.cropPlans, pfByChannel, resolved.sustainability.inputBasis, options],
  );
  return {
    kind: posted.kind,
    isPlan,
    basis,
    records,
    pending: posted.pending,
    error: posted.error,
    reload: posted.reload,
    pfByChannel,
    energy,
    water,
    refrigerantService,
    food,
    /** "the forecast's first year, 2026-09-16 to 2027-09-15" or "reporting year 2026". */
    periodLabel: isPlan ? `the forecast's first year, ${basis.from} to ${basis.to}` : `reporting year ${year}`,
  };
}
