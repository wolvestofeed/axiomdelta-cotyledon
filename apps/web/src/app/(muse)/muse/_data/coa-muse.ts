/**
 * Impact OS — manufacturing extension to the CompTable chart of accounts.
 *
 * CompTable's `DEFAULT_HOSPITALITY_COA` is a restaurant chart: one inventory
 * account, no work in process, no variance accounts. A commissary running
 * cook-chill is a manufacturer — product sits in work in process for days
 * carrying absorbed labor and overhead — so Muse extends that chart rather than
 * editing it. The shared chart is untouched; every other CompTable surface keeps
 * the accounts it has.
 *
 * Codes are chosen to slot into the existing numbering without collision.
 */

import { DEFAULT_HOSPITALITY_COA, type Account } from '@ct/ledger';

/** Raw materials. Muse uses the shared food inventory account as its raw store. */
export const ACC_RAW_MATERIALS = '1410';
export const ACC_PACKAGING = '1415';
export const ACC_WIP_COOK = '1430';
export const ACC_WIP_CHILL = '1435';
export const ACC_WIP_PACK = '1440';
export const ACC_FINISHED_GOODS = '1450';
export const ACC_GRIR = '2015';

export const ACC_COGS = '5010';
export const ACC_PPV = '5110';
export const ACC_MATERIAL_USAGE_VAR = '5120';
export const ACC_LABOR_RATE_VAR = '5130';
export const ACC_LABOR_EFFICIENCY_VAR = '5140';
export const ACC_OH_SPENDING_VAR = '5150';
export const ACC_OH_VOLUME_VAR = '5160';
export const ACC_OH_CONTROL = '5180';
export const ACC_OH_APPLIED = '5190';
export const ACC_ABNORMAL_SPOILAGE = '5910';
/** Selling expense: the marketplace's cut on ghost-kitchen / retail orders. */
export const ACC_MARKETPLACE_COMMISSION = '7910';

export const ACC_ACCRUED_WAGES = '2110';
/** Employer FICA, FUTA and SUTA accrued (shared chart). */
export const ACC_ACCRUED_PAYROLL_TAXES = '2120';
/** Workers' comp premium accrued (shared chart). */
export const ACC_ACCRUED_WORKERS_COMP = '2130';
/** The burden over the statutory rates, accrued as benefits (shared chart). */
export const ACC_ACCRUED_BENEFITS = '2140';
/** Card-processor clearing: ghost-kitchen orders paid at the time of ordering, not yet deposited (shared chart). */
export const ACC_PROCESSOR_CLEARING = '1200';
export const ACC_CASH = '1010';
export const ACC_AP = '2010';
export const ACC_FIXED_ASSETS = '1700';
export const ACC_LONG_TERM_DEBT = '2900';
/** Owners' equity contributed (shared chart). */
export const ACC_OWNER_CONTRIBUTIONS = '3100';
/** Production labor on the time clock that no batch record charged (Roadmap K5). */
export const ACC_UNASSIGNED_PRODUCTION_LABOR = '5170';
/** Budgeted manufacturing overhead accrued at month end and settled by the bills (Roadmap J2). */
export const ACC_ACCRUED_OH = '2160';
export const ACC_AR = '1300';
export const ACC_FOOD_SALES = '4010';

/** The accounts Muse adds. Order matters only for presentation. */
export const MUSE_MANUFACTURING_ACCOUNTS: Account[] = [
  {
    code: ACC_PACKAGING,
    name: 'Inventory — Packaging & Disposables',
    type: 'asset',
    description: 'Bowls, lids, labels and case packaging held at standard cost.',
  },
  {
    code: ACC_WIP_COOK,
    name: 'Work in Process — Cook',
    type: 'asset',
    description:
      'Components issued to the kettle or combi, carrying material, absorbed labor and absorbed overhead until the cook stage completes.',
  },
  {
    code: ACC_WIP_CHILL,
    name: 'Work in Process — Chill',
    type: 'asset',
    description:
      'Cooked components in or awaiting the blast chiller. A costing boundary as well as CCP-2, so cost and the cooling record share a stage.',
  },
  {
    code: ACC_WIP_PACK,
    name: 'Work in Process — Pack',
    type: 'asset',
    description:
      'Chilled components and cold-packed components staged for assembly. Cold components enter the chain here and never pass through cook or chill.',
  },
  {
    code: ACC_FINISHED_GOODS,
    name: 'Inventory — Finished Goods',
    type: 'asset',
    description: 'Packed meals at standard cost, awaiting delivery.',
  },
  {
    code: ACC_GRIR,
    name: 'Goods Received Not Invoiced',
    type: 'liability',
    description:
      'Clearing account between receipt and vendor invoice. Receipt debits inventory and credits this; the invoice clears it to accounts payable.',
  },
  {
    code: ACC_ACCRUED_OH,
    name: 'Accrued Manufacturing Overhead',
    type: 'liability',
    description:
      'Budgeted occupancy and utilities accrued into Overhead Control at month end; a bill recorded for the period settles it, and the difference between bill and budget is the spending variance. A balance is overhead accrued but not yet billed.',
  },
  {
    code: ACC_PPV,
    name: 'Purchase Price Variance',
    type: 'expense',
    description:
      'Actual purchase price against standard, at receipt. Case-rounding is NOT a variance — over-ordered quantity is inventory on hand and nets against the next requirement.',
  },
  {
    code: ACC_MATERIAL_USAGE_VAR,
    name: 'Material Usage Variance',
    type: 'expense',
    description:
      'Actual quantity issued against standard quantity for the portions produced, at standard price. Yield loss beyond the standard shows up here.',
  },
  {
    code: ACC_LABOR_RATE_VAR,
    name: 'Direct Labor Rate Variance',
    type: 'expense',
    description: 'Actual wage rate against standard rate, on actual hours.',
  },
  {
    code: ACC_LABOR_EFFICIENCY_VAR,
    name: 'Direct Labor Efficiency Variance',
    type: 'expense',
    description:
      'Actual hours against standard hours for the portions produced, at standard rate. The gap between the time-study labor basis and the design-target basis resolves here.',
  },
  {
    code: ACC_OH_SPENDING_VAR,
    name: 'Manufacturing Overhead Spending Variance',
    type: 'expense',
    description: 'Actual fixed manufacturing overhead incurred against budget.',
  },
  {
    code: ACC_OH_VOLUME_VAR,
    name: 'Manufacturing Overhead Volume Variance',
    type: 'expense',
    description:
      'Budgeted fixed overhead not absorbed because actual volume fell below normal capacity. A period charge under ASC 330-10-30-3; never capitalised into inventory.',
  },
  {
    code: ACC_UNASSIGNED_PRODUCTION_LABOR,
    name: 'Production Labor Not Charged to a Batch',
    type: 'expense',
    description:
      'Loaded labor on the time clock beyond what the period’s batch records charged into work in process at actual — cleaning, receiving, set-up and any hours no batch names. A period production cost; a credit means batch records charged more hours than the clock shows.',
  },
  {
    code: ACC_OH_CONTROL,
    name: 'Manufacturing Overhead Control',
    type: 'expense',
    description:
      'Fixed manufacturing overhead actually incurred in the period — occupancy, utilities and depreciation of the production fit-out. Debited as incurred; the difference against Overhead Applied is the period’s under- or over-absorption.',
  },
  {
    code: ACC_OH_APPLIED,
    name: 'Manufacturing Overhead Applied',
    type: 'expense',
    description:
      'Contra-expense. Credited as overhead absorbs into work in process at the predetermined normal-capacity rate; cleared against overhead control at period end.',
  },
  {
    code: ACC_ABNORMAL_SPOILAGE,
    name: 'Abnormal Spoilage',
    type: 'expense',
    description:
      'Wasted material beyond the normal shrink allowance. ASC 330-10-30-7 requires abnormal spoilage to be a current-period charge, so it is presented on its own line and never prorated into inventory.',
  },
  {
    code: ACC_MARKETPLACE_COMMISSION,
    name: 'Marketplace Commissions',
    type: 'expense',
    description:
      'Commission retained by a third-party marketplace on ghost-kitchen / retail orders, deducted from the remittance. A selling cost, never inventoriable (ASC 330-10-30-8).',
  },
];

/** The chart Muse posts against: the shared hospitality chart plus manufacturing. */
export const MUSE_COA: Account[] = [...DEFAULT_HOSPITALITY_COA, ...MUSE_MANUFACTURING_ACCOUNTS];

/** Inventory accounts, in the order product moves through them. */
export const MUSE_INVENTORY_FLOW = [
  ACC_RAW_MATERIALS,
  ACC_WIP_COOK,
  ACC_WIP_CHILL,
  ACC_WIP_PACK,
  ACC_FINISHED_GOODS,
] as const;

/** Variance accounts, for period-end disposition. */
export const MUSE_VARIANCE_ACCOUNTS = [
  ACC_PPV,
  ACC_MATERIAL_USAGE_VAR,
  ACC_LABOR_RATE_VAR,
  ACC_LABOR_EFFICIENCY_VAR,
  ACC_OH_SPENDING_VAR,
  ACC_OH_VOLUME_VAR,
] as const;

/** A code collision would silently merge two different accounts. Asserted by test. */
export function duplicateAccountCodes(coa: Account[] = MUSE_COA): string[] {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const a of coa) {
    if (seen.has(a.code)) dupes.push(a.code);
    seen.add(a.code);
  }
  return dupes;
}
