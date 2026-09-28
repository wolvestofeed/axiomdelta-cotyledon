/**
 * Cotyledon — loaded labor as the liabilities it accrues.
 *
 * Pure and ledger-free. Staffing holds the roster, wages, burden and benefits
 * (Roadmap O1); what stays here is the split of loaded labor into the four
 * accounts it is owed on, which the sowing ledger uses to charge standard labor
 * at the plan's placeholder rates until Staffing's loaded rates arrive.
 */

import { compDefaults } from '@/data/plan-data';

export interface PayrollBurdenRates {
  fica: number;
  futa: number;
  suta: number;
  workersComp: number;
}

/** Loaded labor in cents, split into the accounts it is owed on. The parts sum to `loadedCents` exactly. */
export interface LoadedLaborCents {
  /** Gross wages — Accrued Wages Payable (2110). */
  wagesCents: number;
  /** Employer FICA, FUTA and SUTA — Accrued Payroll Taxes Payable (2120). */
  payrollTaxesCents: number;
  /** Workers' compensation premium — Accrued Workers' Comp Payable (2130). */
  workersCompCents: number;
  /** The burden left over the statutory rates — Accrued Benefits Payable (2140). */
  benefitsCents: number;
  loadedCents: number;
}

function burdenParts(totalBurden: number, rates: PayrollBurdenRates) {
  const statutory = rates.fica + rates.futa + rates.suta + rates.workersComp;
  // A total burden below the statutory rates carries no benefits and scales the statutory parts to fit it.
  const scale = statutory > 0 && totalBurden < statutory ? totalBurden / statutory : 1;
  return {
    taxes: (rates.fica + rates.futa + rates.suta) * scale,
    workersComp: rates.workersComp * scale,
    benefits: Math.max(0, totalBurden - statutory),
  };
}

/**
 * Split loaded labor — wages × (1 + total burden) — into wages, payroll taxes,
 * workers' comp and benefits, at the plan's placeholder burden rates. Wages take
 * the rounding residual.
 */
export function splitLoadedLaborCents(
  loadedCents: number,
  totalBurden: number,
  rates: PayrollBurdenRates = compDefaults,
): LoadedLaborCents {
  const wages = loadedCents / (1 + totalBurden);
  const p = burdenParts(totalBurden, rates);
  const payrollTaxesCents = Math.round(wages * p.taxes);
  const workersCompCents = Math.round(wages * p.workersComp);
  const benefitsCents = Math.round(wages * p.benefits);
  return {
    wagesCents: loadedCents - payrollTaxesCents - workersCompCents - benefitsCents,
    payrollTaxesCents,
    workersCompCents,
    benefitsCents,
    loadedCents,
  };
}

/** The same split built up from gross wages in cents: the burden parts are added to the wages. */
export function loadLaborFromWagesCents(
  wagesCents: number,
  totalBurden: number,
  rates: PayrollBurdenRates = compDefaults,
): LoadedLaborCents {
  const p = burdenParts(totalBurden, rates);
  const payrollTaxesCents = Math.round(wagesCents * p.taxes);
  const workersCompCents = Math.round(wagesCents * p.workersComp);
  const benefitsCents = Math.round(wagesCents * p.benefits);
  return {
    wagesCents,
    payrollTaxesCents,
    workersCompCents,
    benefitsCents,
    loadedCents: wagesCents + payrollTaxesCents + workersCompCents + benefitsCents,
  };
}
