/**
 * Cotyledon — manufacturing extension to the Staffing chart of accounts.
 *
 * Staffing's `DEFAULT_HOSPITALITY_COA` is a restaurant chart: one inventory
 * account, no work in process, no variance accounts. A facility running
 * grow is a manufacturer — product sits in work in process for days
 * carrying absorbed labor and overhead — so Farm extends that chart rather than
 * editing it. The shared chart is untouched; every other Staffing surface keeps
 * the accounts it has.
 *
 * Codes are chosen to slot into the existing numbering without collision.
 */

import { DEFAULT_HOSPITALITY_COA, type Account } from '@/ledger';

/** Raw materials. Farm uses the shared food inventory account as its raw store. */
export const ACC_RAW_MATERIALS = '1410';
export const ACC_PACKAGING = '1415';
export const ACC_WIP_SOW = '1430';
export const ACC_WIP_GROW = '1435';
export const ACC_WIP_PACK = '1440';
export const ACC_FINISHED_GOODS = '1450';
export const ACC_GRIR = '2015';

/** Cost of goods sold by element (`accounting-policy.md` §14): the shared chart's 5010 is not posted. */
export const ACC_COGS_MATERIALS = '5011';
export const ACC_COGS_LABOR = '5012';
export const ACC_COGS_OVERHEAD = '5013';
export const ACC_OH_SPENDING_VAR = '5150';
export const ACC_OH_VOLUME_VAR = '5160';
export const ACC_OH_CONTROL = '5180';
export const ACC_OH_APPLIED = '5190';
export const ACC_VAR_OH_APPLIED = '5195';
export const ACC_ABNORMAL_SPOILAGE = '5910';
/** Selling expense: the marketplace's cut on ghost-farm / retail orders. */
export const ACC_MARKETPLACE_COMMISSION = '7910';
/** Research and Development: an experiment's sowing at its full cost, packed or lost (ASC 730-10-25-1). */
export const ACC_RESEARCH_DEVELOPMENT = '7920';

export const ACC_ACCRUED_WAGES = '2110';
/** Employer FICA, FUTA and SUTA accrued (shared chart). */
export const ACC_ACCRUED_PAYROLL_TAXES = '2120';
/** Workers' comp premium accrued (shared chart). */
export const ACC_ACCRUED_WORKERS_COMP = '2130';
/** The burden over the statutory rates, accrued as benefits (shared chart). */
export const ACC_ACCRUED_BENEFITS = '2140';
/** Card-processor clearing: ghost-farm orders paid at the time of ordering, not yet deposited (shared chart). */
export const ACC_PROCESSOR_CLEARING = '1200';
export const ACC_CASH = '1010';
export const ACC_SEED = '2010';
export const ACC_FIXED_ASSETS = '1700';
export const ACC_LONG_TERM_DEBT = '2900';
/** Owners' equity contributed (shared chart). */
export const ACC_OWNER_CONTRIBUTIONS = '3100';
/** Owner Draws (shared chart): what the owner takes out, his own trays among it, at cost. */
export const ACC_OWNER_DRAWS = '3200';
/** Production labor on the time clock that no sowing record charged (Roadmap K5). */
export const ACC_UNASSIGNED_PRODUCTION_LABOR = '5170';
/** Budgeted manufacturing overhead accrued at month end and settled by the bills (Roadmap J2). */
export const ACC_ACCRUED_OH = '2160';
export const ACC_AR = '1300';
export const ACC_FOOD_SALES = '4010';

/** The accounts Farm adds. Order matters only for presentation. */
export const FARM_MANUFACTURING_ACCOUNTS: Account[] = [
  {
    code: ACC_PACKAGING,
    name: 'Inventory — Packaging & Disposables',
    type: 'asset',
    description: "The plans' packaging held at cost.",
  },
  {
    code: ACC_WIP_SOW,
    name: 'Work in Process — Sow',
    type: 'asset',
    description:
      'Trays sown: seed, medium and nutrient issued, tray wear and sanitizer applied, the sowing stream and fixed overhead absorbed.',
  },
  {
    code: ACC_WIP_GROW,
    name: 'Work in Process — Grow',
    type: 'asset',
    description:
      'Trays on the shelves: the sow stage carried in, light applied and the daily stream absorbed over the cycle.',
  },
  {
    code: ACC_WIP_PACK,
    name: 'Work in Process — Pack',
    type: 'asset',
    description:
      'Harvested trays at the check and in packing: the grow stage carried in and the harvest stream absorbed.',
  },
  {
    code: ACC_FINISHED_GOODS,
    name: 'Inventory — Finished Goods',
    type: 'asset',
    description: 'Packed units at the cost of their sowing, awaiting distribution.',
  },
  {
    code: ACC_COGS_MATERIALS,
    name: 'Cost of Goods Sold — Materials',
    type: 'expense',
    description: 'Seed, medium, nutrient and packaging in the units distributed, at the cost of the sowings relieved.',
  },
  {
    code: ACC_COGS_LABOR,
    name: 'Cost of Goods Sold — Labor',
    type: 'expense',
    description: 'Direct labor in the units distributed, at the cost of the sowings relieved.',
  },
  {
    code: ACC_COGS_OVERHEAD,
    name: 'Cost of Goods Sold — Overhead',
    type: 'expense',
    description: 'Light, tray wear and sanitizer applied and fixed overhead absorbed in the units distributed, at the cost of the sowings relieved.',
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
    name: 'Production Labor Not Charged to a Sowing',
    type: 'expense',
    description:
      'Loaded labor on the time clock beyond what the period’s sowing records charged into work in process at actual — cleaning, receiving, set-up and any hours no sowing names. A period production cost; a credit means sowing records charged more hours than the clock shows.',
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
    code: ACC_VAR_OH_APPLIED,
    name: 'Variable Manufacturing Overhead Applied',
    type: 'expense',
    description:
      'Contra-expense. Credited as the light a tray takes, its tray wear and the sanitizer apply to work in process at their standard per tray. The electricity, trays and sanitizer themselves are expensed as billed; the two net to what stays in inventory.',
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
      'Commission retained by a third-party marketplace on ghost-farm / retail orders, deducted from the remittance. A selling cost, never inventoriable (ASC 330-10-30-8).',
  },
  {
    code: ACC_RESEARCH_DEVELOPMENT,
    name: 'Research and Development',
    type: 'expense',
    description:
      "An experiment's sowing at its full cost: materials, labor, overhead applied and absorbed, the packed trays and any loss at any stage. Expensed as incurred under ASC 730-10-25-1, never held in inventory or charged to cost of goods sold.",
  },
];

/** The chart Farm posts against: the shared hospitality chart plus manufacturing. */
export const FARM_COA: Account[] = [...DEFAULT_HOSPITALITY_COA, ...FARM_MANUFACTURING_ACCOUNTS];

/** Inventory accounts, in the order product moves through them. */
export const FARM_INVENTORY_FLOW = [
  ACC_RAW_MATERIALS,
  ACC_WIP_SOW,
  ACC_WIP_GROW,
  ACC_WIP_PACK,
  ACC_FINISHED_GOODS,
] as const;

/** Variance accounts, for period-end disposition. */
export const FARM_VARIANCE_ACCOUNTS = [
  ACC_OH_SPENDING_VAR,
  ACC_OH_VOLUME_VAR,
] as const;

/** A code collision would silently merge two different accounts. Asserted by test. */
export function duplicateAccountCodes(coa: Account[] = FARM_COA): string[] {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const a of coa) {
    if (seen.has(a.code)) dupes.push(a.code);
    seen.add(a.code);
  }
  return dupes;
}
