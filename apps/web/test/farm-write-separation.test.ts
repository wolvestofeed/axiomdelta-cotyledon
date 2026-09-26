import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Roadmap N6: recording surfaces write to Actual only; planning surfaces write to the
 * forecast only. Structurally: no server module writes both a forecast (the saved
 * scenarios and the plan-of-record pointer) and a recorded document, and no
 * recording module reaches the scenario writers.
 */

const LIB = join(__dirname, '..', 'src', 'app', '(farm)', 'farm', '_lib');
const FORECAST_TABLES = ['farmScenarios', 'farmWorkspaceState'];
const RECORD_TABLES = [
  'farmSowingRecords',
  'farmReceipts',
  'farmDistributions',
  'farmPeriodBills',
  'farmInvoices',
  'farmSubscriberPayments',
  'farmSupplierBills',
  'farmSupplierPayments',
  'farmTimePunches',
  'farmOpeningBalances',
  'farmSustainabilityReadings',
  'farmRefrigerantService',
  'farmPurchaseOrders',
  'farmOrders',
];

const files = readdirSync(LIB)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => ({ name: f, text: readFileSync(join(LIB, f), 'utf8') }));

const writes = (text: string, table: string) => new RegExp(`\\.(insert|update|delete)\\(\\s*${table}\\b`).test(text);

describe('farm write separation — forecast writes and recorded documents never share a module (N6)', () => {
  it('finds both kinds of writer', () => {
    expect(files.some((f) => FORECAST_TABLES.some((t) => writes(f.text, t)))).toBe(true);
    expect(files.some((f) => RECORD_TABLES.some((t) => writes(f.text, t)))).toBe(true);
  });

  for (const f of files) {
    const forecast = FORECAST_TABLES.filter((t) => writes(f.text, t));
    const records = RECORD_TABLES.filter((t) => writes(f.text, t));
    if (forecast.length === 0 && records.length === 0) continue;
    it(`${f.name} writes one kind only`, () => {
      expect({ file: f.name, forecast, records }).toEqual({ file: f.name, forecast: records.length ? [] : forecast, records: forecast.length ? [] : records });
    });
    if (records.length > 0) {
      it(`${f.name} does not reach the scenario writers`, () => {
        expect(f.text).not.toMatch(/from '\.\/scenario-actions'/);
      });
    }
  }
});
