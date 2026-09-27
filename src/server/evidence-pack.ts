import 'server-only';
import { lineLabel } from '@/data/grow-plan';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { eq } from 'drizzle-orm';
import { farmSources, farmSourceFigures } from '@/db';
import { db } from '@/lib/db';
import { getActiveScenario } from '@/server/scenarios';
import { listGrowPlans } from '@/server/grow-plans';
import { listSubscribers } from '@/server/subscribers';
import { loadCalendar } from '@/server/periods';
import { listEquipment } from '@/server/equipment';
import { listPackagingLibrary } from '@/server/packaging';
import { listAllCatalog } from '@/server/supplier-catalog';
import { listLoans, listFixedCostLines, listLeasehold } from '@/server/finance';
import { listTimeStudies } from '@/server/time-studies';
import { resolveScenarioInputs } from '@/engine/scenario';
import { fullInventory, restatementCheck } from '@/engine/inventory';
import { factorRegistry } from '@/data/emission-factors';
import { lcaOptions as curatedOptions } from '@/data/lca-options';
import { listSupplierLcaOptions } from '@/server/supplier-lca';
import { leanSuppliersById } from '@/server/supplier-links';
import { listSources, listFigures } from '@/server/sources';
import { STATUS_RANK_LABEL } from '@/engine/sources';
import { loadSustainabilityRecords, postSustainabilityBasis } from '@/server/sustainability';
import { energyFromReadings, READING_METRICS, serviceFromRecords, waterFromReadings } from '@/engine/sustainability-records';
import type { LedgerKind } from '@/engine/ledger-view';

/**
 * Evidence pack: the inventory as a workbook plus every stored source document,
 * zipped. Follows the Staffing audit-pack pattern (exceljs + jszip). The
 * workbook is the calculation record: statement, every posting with its
 * factor id / version / status, the factor registry, the sources and figures,
 * the activity inputs, the basis selections and supplier links, and the audit
 * settings with the factor fingerprint.
 */

function sheet(wb: ExcelJS.Workbook, name: string, header: string[], rows: (string | number | null)[][]): void {
  const ws = wb.addWorksheet(name);
  ws.addRow(header).font = { bold: true };
  for (const r of rows) ws.addRow(r);
  ws.columns.forEach((c) => {
    let w = 10;
    c.eachCell?.({ includeEmpty: false }, (cell) => {
      w = Math.max(w, Math.min(60, String(cell.value ?? '').length + 2));
    });
    c.width = w;
  });
}

/** Follows the Plan / Actual toggle: Plan the plan of record's first forecast year; Actual the records in the reporting year. */
export async function buildEvidencePack(asOf: string, kind: LedgerKind): Promise<{ buffer: Buffer; fileName: string }> {
  const [active, library, subscribers, calendar, equipment, packaging, catalog, loans, fixedCostLines, leasehold, timeStudies] = await Promise.all([getActiveScenario(), listGrowPlans(), listSubscribers(), loadCalendar(), listEquipment(), listPackagingLibrary(), listAllCatalog(), listLoans(), listFixedCostLines(), listLeasehold(), listTimeStudies()]);
  const R = resolveScenarioInputs(active?.config, library, subscribers, calendar.closures, undefined, equipment, packaging, catalog, undefined, loans, fixedCostLines, leasehold, timeStudies.studies);
  const supplierOptions = await listSupplierLcaOptions();
  const suppliers = leanSuppliersById(Object.values(R.sustainability.inputSupplier));
  const basis = await postSustainabilityBasis(kind, active?.config ?? {});
  const year = R.sustainability.audit.reportingYear;
  const records = kind === 'actual' ? await loadSustainabilityRecords(year) : null;
  const energy = records ? energyFromReadings(records.readings, year) : R.sustainability.energy;
  const water = records ? waterFromReadings(records.readings, year) : R.sustainability.water;
  const refrigerantService = records ? serviceFromRecords(records.refrigerantService) : {};
  const statementAsOf = kind === 'actual' && asOf.startsWith(`${year}-`) ? asOf : basis.to;
  const inv = fullInventory(R, statementAsOf, { basis, energy, refrigerantService }, suppliers, [...curatedOptions, ...supplierOptions]);
  const periodText = kind === 'plan' ? `Plan: the plan of record's first forecast year, ${basis.from} to ${basis.to}` : `Actual: records in reporting year ${year}`;
  const check = restatementCheck(inv.reference.location.totalKg, inv.fingerprint, R.sustainability.audit);
  const sources = await listSources();

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MicroFarm';
  wb.created = new Date();

  sheet(wb, 'README', ['Item', 'Value'], [
    ['Prepared', asOf],
    ['Ledger and period', periodText],
    ['Units distributed in the period', basis.totalUnits],
    ['Plan of record', active?.label ?? 'plan-data defaults (no plan of record set)'],
    ['Reporting year', R.sustainability.audit.reportingYear],
    ['Baseline year', R.sustainability.audit.baselineYear ?? 'not set'],
    ['Materiality threshold', R.sustainability.audit.materialityThreshold],
    ['Factor fingerprint', inv.fingerprint],
    ['Recorded baseline total, kg CO2e', R.sustainability.audit.baselineTotalKg ?? 'not recorded'],
    ['Recorded baseline fingerprint', R.sustainability.audit.baselineFingerprint ?? 'not recorded'],
    ['Restatement indicated', check.restatementIndicated ? 'yes' : 'no'],
    ['Reasons', check.reasons.join('; ') || 'none'],
    ['Method', 'Activity × pinned factor version → posting. Scope 2 reported location- and market-based. Purchased food reported on the reference basis (study means) and the selected basis (per-input choice), both always shown. Farm- and slaughter-gate figures aligned to retail by the study\'s own downstream stages and loss ratio. Nothing derived is stored; every figure recomputes from inputs and the factor registry.'],
    ['Status vocabulary', Object.entries(STATUS_RANK_LABEL).map(([k, v]) => `${k}: ${v}`).join(' · ')],
  ]);

  sheet(wb, 'Statement', ['Scope', 'Category', 'Line', 'kg CO2e / yr', 'Basis', 'Activity', 'Weakest status'],
    inv.lines.map((l) => [l.scope, l.category, l.label, Number(l.kg.toFixed(3)), l.basis, l.activity, l.weakest ?? '']));
  const ws = wb.getWorksheet('Statement')!;
  ws.addRow([]);
  ws.addRow(['', '', 'Total, reference food basis, Scope 2 location-based', Number(inv.reference.location.totalKg.toFixed(3))]).font = { bold: true };
  ws.addRow(['', '', 'Total, reference food basis, Scope 2 market-based', Number(inv.reference.market.totalKg.toFixed(3))]);
  ws.addRow(['', '', 'Total, selected food basis, Scope 2 location-based', Number(inv.selected.location.totalKg.toFixed(3))]).font = { bold: true };
  ws.addRow(['', '', 'Total, selected food basis, Scope 2 market-based', Number(inv.selected.market.totalKg.toFixed(3))]);
  ws.addRow(['', '', 'Units distributed in the period', inv.annualUnits]);
  ws.addRow(['', '', 'kg CO2e per unit, reference', Number((inv.normalizers.reference.kgPerUnit ?? 0).toFixed(4))]);
  ws.addRow(['', '', 'kg CO2e per unit, selected', Number((inv.normalizers.selected.kgPerUnit ?? 0).toFixed(4))]);
  ws.addRow(['', '', 'kg CO2e per sq ft, reference', Number((inv.normalizers.reference.kgPerSqFt ?? 0).toFixed(4))]);

  sheet(wb, 'Postings', ['Activity id', 'Module', 'Period', 'Scope', 'Scope 2 method', 'Category', 'CO2 kg', 'CH4 kg', 'N2O kg', 'CO2e kg', 'GWP basis', 'Factor id', 'Factor version', 'Factor status', 'Activity status'],
    inv.postings.map((p) => [p.activityId, p.module, p.period, p.scope, p.scope2Method ?? '', p.category, Number(p.co2Kg.toFixed(6)), Number(p.ch4Kg.toFixed(6)), Number(p.n2oKg.toFixed(6)), Number(p.co2eKg.toFixed(6)), p.gwpBasis, p.factorId, p.factorVersion, p.factorStatus, p.activityStatus ?? '']));

  sheet(wb, 'Factors', ['Id', 'Source', 'URL', 'Version', 'Effective from', 'Status', 'Note'],
    factorRegistry.map((f) => [f.id, f.source, f.sourceUrl, f.version, f.effectiveFrom, f.status, f.note ?? '']));

  const figRows: (string | number | null)[][] = [];
  for (const s of sources) {
    const figs = await listFigures(s.id);
    if (figs.length === 0) figRows.push([s.title, s.kind, s.publisher ?? '', s.year ?? '', s.sourceUrl ?? '', s.fileName ?? '', s.status, '', '', '', '', '', '']);
    for (const f of figs) figRows.push([s.title, s.kind, s.publisher ?? '', s.year ?? '', s.sourceUrl ?? '', s.fileName ?? '', s.status, f.provenanceId ?? '', f.label, f.valueText ?? '', f.unit ?? '', f.locator ?? '', f.status]);
  }
  sheet(wb, 'Sources', ['Source', 'Kind', 'Publisher', 'Year', 'URL', 'Stored file', 'Source status', 'Figure id', 'Figure', 'Value', 'Unit', 'Locator', 'Figure status'], figRows);

  const S = R.sustainability;
  sheet(wb, 'Inputs', ['Group', 'Input', 'Value'], [
    ...Object.entries(energy).map(([k, v]) => [kind === 'plan' ? 'energy, loaded into the forecast' : `energy, from the ${year} bills`, k, v] as (string | number)[]),
    ...Object.entries(water).map(([k, v]) => [kind === 'plan' ? 'water, loaded into the forecast' : `water, from the ${year} records`, k, v] as (string | number)[]),
    ['waste', 'compostShare', S.waste.compostShare],
    ...Object.entries(S.equipment).flatMap(([item, a]) => Object.entries(a).map(([k, v]) => ['equipment', `${item} · ${k}`, String(v)] as (string | number)[])),
    ...Object.entries(refrigerantService).flatMap(([item, adds]) => adds.map((a) => ['refrigerant service', item, `${a.date}: ${a.lbAdded} lb`] as (string | number)[])),
  ]);

  if (records) {
    sheet(wb, 'Records', ['Record', 'Period from', 'Period to or date', 'Quantity', 'Unit', 'Source id', 'Notes', 'Entered by'], [
      ...records.readings.map((r) => [READING_METRICS[r.metric]?.label ?? r.metric, r.periodStart ?? '', r.readOn, r.quantity, READING_METRICS[r.metric]?.unit ?? '', r.sourceId ?? '', r.notes ?? '', r.recordedBy ?? '']),
      ...records.refrigerantService.map((r) => [`Refrigerant added · ${r.equipmentKey}`, '', r.servicedOn, r.lbAdded, 'lb', r.sourceId ?? '', [r.technician, r.notes].filter(Boolean).join(' · '), r.recordedBy ?? '']),
    ]);
  }

  sheet(wb, 'Selections', ['Input', 'LCA basis option', 'Linked supplier id', 'Linked supplier'],
    [...new Set(R.growPlans.flatMap((r) => r.lines.map((l) => lineLabel(l))))].sort().map((name) => [name, S.inputBasis[name] ?? 'study mean', S.inputSupplier[name] ?? '', suppliers[S.inputSupplier[name] ?? '']?.name ?? '']));

  const xlsx = Buffer.from(await wb.xlsx.writeBuffer());

  const zip = new JSZip();
  zip.file('evidence-pack.xlsx', xlsx);
  zip.file('README.md', [
    '# MicroFarm — greenhouse-gas inventory evidence pack',
    '',
    `Prepared ${asOf}. ${periodText}. Plan of record: ${active?.label ?? 'plan-data defaults'}. Factor fingerprint ${inv.fingerprint}.`,
    '',
    'Contents: evidence-pack.xlsx (statement, every posting with factor id/version/status, factor registry, registered sources and figures, activity inputs, basis selections and supplier links) and sources/ (every document stored in the registry).',
    '',
    'Every figure recomputes from the inputs and the factor registry; nothing derived is stored. Status tags travel with every figure: a placeholder or unconfirmed value is labelled as such wherever it appears.',
  ].join('\n'));
  for (const s of sources) {
    if (!s.fileName) continue;
    const rows = await db.select({ bytes: farmSources.fileBytes }).from(farmSources).where(eq(farmSources.id, s.id)).limit(1);
    if (rows[0]?.bytes) zip.file(`sources/${s.fileName}`, Buffer.from(rows[0].bytes));
  }
  void farmSourceFigures;
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { buffer, fileName: `farm-evidence-pack-${kind}-${asOf}.zip` };
}
