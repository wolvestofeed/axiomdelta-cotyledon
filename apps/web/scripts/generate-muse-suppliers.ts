/**
 * Impact OS — supplier dataset generator.
 *
 * Reads the git-ignored source exports (USDA Organic INTEGRITY, four states +
 * the TDA Farm Fresh Network Austin-metro extract) and emits a committed,
 * ATTRIBUTED, trimmed JSON compilation the Suppliers page consumes. The raw
 * source stays local (docs/muse/confidential/Research, git-ignored);
 * only this derived compilation is versioned.
 *
 * Provenance rule (RESEARCH.md §13/§14): this is an attributed research
 * compilation of PUBLIC records, not a republished database. Certification data
 * is USDA INTEGRITY; school-readiness is TDA FFN. Neither gives volume, price,
 * or lead time — those are operator-entered and never fabricated here.
 *
 * Run:  pnpm muse:suppliers   (from repo root; needs the local source folder)
 */

import ExcelJS from 'exceljs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../../..');
const SRC = path.join(REPO, 'docs/muse/confidential/Research');
const OUT = path.join(REPO, 'apps/web/src/app/(muse)/muse/_data/suppliers-compiled.json');

const STATE_FILES: Array<{ state: string; file: string }> = [
  { state: 'TX', file: 'Organic Integrity DB TX USDA 091026.xlsx' },
  { state: 'CO', file: 'Organic Integrity DB CO USDA 091026.xlsx' },
  { state: 'NM', file: 'Organic Integrity DB NM USDA 091026.xlsx' },
  { state: 'LA', file: 'Organic Integrity DB LA USDA 091026.xlsx' },
];

// Central Texas food-hub region (approx. the SFC 23-county study region).
const CENTRAL_TX = new Set([
  'TRAVIS', 'WILLIAMSON', 'HAYS', 'BASTROP', 'CALDWELL', 'BLANCO', 'BURNET', 'BELL',
  'COMAL', 'GUADALUPE', 'LEE', 'FAYETTE', 'MILAM', 'GILLESPIE', 'LLANO', 'LAMPASAS',
  'CORYELL', 'FALLS', 'ROBERTSON', 'WASHINGTON', 'BEXAR', 'WILSON', 'GONZALES',
]);

// TDA Farm Fresh Network — Austin-metro producers (opted in to selling to
// schools). From the TDA extract; names + county + a coarse type only (the full
// per-item availability needs the ArcGIS pull, a documented follow-up).
const TDA_OVERLAY: Array<{ name: string; county: string; tdaType: string }> = [
  { name: 'Central Texas Food Hub', county: 'TRAVIS', tdaType: 'Aggregator / food hub' },
  { name: 'Hardies Fresh Foods', county: 'TRAVIS', tdaType: 'Broadline distributor' },
  { name: 'Brothers Food Service', county: 'TRAVIS', tdaType: 'Broadline distributor' },
  { name: 'Farm to Table - Austin/Dallas/Houston', county: 'TRAVIS', tdaType: 'Distributor' },
  { name: 'Hill Country Dairies, Inc.', county: 'TRAVIS', tdaType: 'Dairy' },
  { name: 'Bearded Bros & Yumster Yo!', county: 'TRAVIS', tdaType: 'Food processor' },
  { name: 'Oatmeal & Company, LLC', county: 'TRAVIS', tdaType: 'Grain / food processor' },
  { name: 'Hudson Meats', county: 'TRAVIS', tdaType: 'Protein' },
  { name: 'The Refugee Collective Farm', county: 'TRAVIS', tdaType: 'Produce / farm' },
  { name: "Jeany's Caribbean Elixirs", county: 'TRAVIS', tdaType: 'Food processor' },
  { name: 'Munkebo Farms', county: 'TRAVIS', tdaType: 'Produce / farm' },
  { name: 'Floreli Foods, LLC', county: 'WILLIAMSON', tdaType: 'Food processor' },
  { name: 'L&S Farms', county: 'WILLIAMSON', tdaType: 'Produce / farm' },
  { name: 'Tamales to-go', county: 'WILLIAMSON', tdaType: 'Food processor' },
  { name: 'Round Rock Honey Company, LLC', county: 'WILLIAMSON', tdaType: 'Specialty' },
  { name: 'Fifth Branch Farms', county: 'WILLIAMSON', tdaType: 'Produce / farm' },
  { name: 'Greener Pastures Chicken', county: 'BASTROP', tdaType: 'Pastured poultry' },
  { name: 'Luminaria Acres', county: 'BASTROP', tdaType: 'Produce / farm' },
];

const TYPE_COLUMNS = [
  'Broker', 'Community Supported Agriculture (CSA)', 'Co-Packer', 'Dairy', 'Distributor',
  'Marketer/Trader', 'Restaurant', 'Retail Food Establishment', 'Poultry', 'Private Labeler',
  'Slaughterhouse', 'Storage', 'Grower Group',
];

const norm = (s: string) =>
  (s || '')
    .toLowerCase()
    .replace(/[.,'&]/g, ' ')
    .replace(/\b(llc|inc|co|company|farms?|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const clean = (v: unknown): string => (v == null ? '' : String(v).trim());
const trim = (v: unknown, n = 160): string => {
  const s = clean(v);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
};
const upperCounty = (v: unknown) => clean(v).toUpperCase().replace(/\s+COUNTY$/, '');

const tdaByName = new Map(TDA_OVERLAY.map((t) => [norm(t.name), t]));

interface Operation {
  id: string;
  name: string;
  source: string;
  certified: boolean;
  certifier: string;
  status: string;
  scopes: { crops: string; livestock: string; wildCrops: string; handling: string };
  products: { crops: string; livestock: string; handling: string };
  city: string;
  county: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  website: string;
  acres: string;
  types: string[];
  schoolReady: boolean;
  tdaType: string | null;
  region: 'central-tx' | 'texas' | 'out-of-state';
  dataAsOf: string;
}

function regionFor(state: string, county: string): Operation['region'] {
  if (state === 'TX' && CENTRAL_TX.has(county)) return 'central-tx';
  if (state === 'TX') return 'texas';
  return 'out-of-state';
}

async function readIntegrity(state: string, file: string): Promise<Operation[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(SRC, file));
  const ws = wb.worksheets[0];
  const header: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, col) => {
    header[col] = clean(c.value);
  });
  // Column index by header name (1-based). Handle duplicate 'County'/'State'
  // columns: the first occurrence is the physical address.
  const idx = (name: string, occurrence = 1): number => {
    let seen = 0;
    for (let i = 1; i < header.length; i++) {
      if (header[i] === name) {
        seen++;
        if (seen === occurrence) return i;
      }
    }
    return -1;
  };
  const at = (row: ExcelJS.Row, name: string, occ = 1): unknown => {
    const i = idx(name, occ);
    return i > 0 ? row.getCell(i).value : null;
  };

  const ops: Operation[] = [];
  // Rows 1-3 are header / required-optional / description. Data starts at row 4.
  for (let r = 4; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const name = clean(at(row, 'Operation Name'));
    const status = clean(at(row, 'Operation Certification Status'));
    if (!name || !/^cert/i.test(status)) continue;

    const scopeCert = (scope: string) => /^cert/i.test(clean(at(row, scope)));
    const types = TYPE_COLUMNS.filter((c) => /^y/i.test(clean(at(row, c)))).map((c) =>
      c.replace('Community Supported Agriculture (CSA)', 'CSA'),
    );
    // Keep actual agricultural producers only — crops / livestock / wild-crops
    // growers and dairies. Handling-only operations (co-packers, marketers,
    // private labelers, coffee clubs) are excluded so this stays a producer
    // sourcing directory, not a full database dump. Raw source remains local.
    const isProducer =
      scopeCert('CROPS Scope Certification Status') ||
      scopeCert('LIVESTOCK Scope Certification Status') ||
      scopeCert('WILD CROPS Scope Certification Status') ||
      types.includes('Dairy');
    if (!isProducer) continue;

    const county = upperCounty(at(row, 'County', 1)) || upperCounty(at(row, 'County', 2));
    const city = clean(at(row, 'Physical Address: City')) || clean(at(row, 'Mailing Address: City'));

    const tda = tdaByName.get(norm(name));
    ops.push({
      id: clean(at(row, 'Operation ID')) || `${state}-${r}`,
      name,
      source: 'USDA Organic INTEGRITY',
      certified: true,
      certifier: clean(at(row, 'Certifier Name')),
      status,
      scopes: {
        crops: clean(at(row, 'CROPS Scope Certification Status')),
        livestock: clean(at(row, 'LIVESTOCK Scope Certification Status')),
        wildCrops: clean(at(row, 'WILD CROPS Scope Certification Status')),
        handling: clean(at(row, 'HANDLING Scope Certification Status')),
      },
      products: {
        crops: trim(at(row, 'Certified Products Under CROPS Scope')),
        livestock: trim(at(row, 'Certified Products Under LIVESTOCK Scope')),
        handling: trim(at(row, 'Certified Products Under HANDLING Scope')),
      },
      city,
      county,
      state,
      zip: clean(at(row, 'Physical Address: ZIP/ Postal Code')),
      phone: clean(at(row, 'Phone')),
      email: clean(at(row, 'Email')),
      website: clean(at(row, 'Website URL')),
      acres: clean(at(row, 'Total Certified Acres')),
      types,
      schoolReady: Boolean(tda),
      tdaType: tda ? tda.tdaType : null,
      region: regionFor(state, county),
      dataAsOf: clean(at(row, 'Data as of Date')) || '2026-09-10',
    });
  }
  return ops;
}

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`Source folder not found: ${SRC}\nThis generator needs the local (git-ignored) research folder.`);
    process.exit(1);
  }

  const operations: Operation[] = [];
  for (const { state, file } of STATE_FILES) {
    const ops = await readIntegrity(state, file);
    console.log(`  ${state}: ${ops.length} certified operations`);
    operations.push(...ops);
  }

  // TDA producers not matched to an INTEGRITY record become school-ready,
  // certification-unknown entries so the directory shows both populations.
  const matched = new Set(operations.filter((o) => o.schoolReady).map((o) => norm(o.name)));
  for (const t of TDA_OVERLAY) {
    if (matched.has(norm(t.name))) continue;
    operations.push({
      id: `TDA-${norm(t.name).replace(/\s+/g, '-')}`,
      name: t.name,
      source: 'TDA Farm Fresh Network',
      certified: false,
      certifier: '',
      status: '',
      scopes: { crops: '', livestock: '', wildCrops: '', handling: '' },
      products: { crops: '', livestock: '', handling: '' },
      city: '',
      county: t.county,
      state: 'TX',
      zip: '',
      phone: '',
      email: '',
      website: '',
      acres: '',
      types: [],
      schoolReady: true,
      tdaType: t.tdaType,
      region: regionFor('TX', t.county),
      dataAsOf: '2026-09-10',
    });
  }

  operations.sort((a, b) => a.name.localeCompare(b.name));

  const payload = {
    generatedAt: new Date().toISOString(),
    note: 'Attributed research compilation of PUBLIC records. Not a republished database. Volume, pricing, and lead time are operator-entered, never sourced here.',
    sources: [
      { name: 'USDA Organic INTEGRITY Database', scope: 'Certified organic operations (TX, CO, NM, LA)', dataAsOf: '2026-09-10', url: 'https://organic.ams.usda.gov/integrity/' },
      { name: 'Texas Department of Agriculture — Farm Fresh Network', scope: 'Producers opted in to school / child-nutrition sales (Austin metro extract)', dataAsOf: '2026-09-10', url: 'https://experience.arcgis.com/experience/c8f3e664cb3b40a59f399ac6f35f6009' },
    ],
    counts: {
      total: operations.length,
      certified: operations.filter((o) => o.certified).length,
      schoolReady: operations.filter((o) => o.schoolReady).length,
      both: operations.filter((o) => o.certified && o.schoolReady).length,
      centralTx: operations.filter((o) => o.region === 'central-tx').length,
    },
    operations,
  };

  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');
  console.log(`\nWrote ${operations.length} operations to ${path.relative(REPO, OUT)}`);
  console.log(`  certified: ${payload.counts.certified} · school-ready: ${payload.counts.schoolReady} · both: ${payload.counts.both} · central-TX: ${payload.counts.centralTx}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
