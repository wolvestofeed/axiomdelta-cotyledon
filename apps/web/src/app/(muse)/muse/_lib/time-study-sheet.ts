import 'server-only';
import ExcelJS from 'exceljs';
import { timeStudy } from '../_data/plan-data';
import { PLAN_TASK_STREAMS, TIME_STUDY_BASIS_LABELS, QUALITY_RESULT_LABELS } from '../_data/time-studies';
import { deriveCapacity } from '../_engine';
import { timeStudyScaffold } from '../_engine/time-study-estimate';
import { laborStandard, studiesForRecipe, summarizeStudy } from '../_engine/time-studies';
import { listRecipes } from './recipes';
import { listTimeStudies } from './time-studies';

/**
 * Impact OS — the Time Study Sheet (Roadmap O2 follow-on): the printable
 * instrument for timing a batch of any recipe in the library, downloaded from
 * Labor. One block per recipe, its task scaffold off its own served components
 * (`timeStudyScaffold`) — the same scaffold the estimated study was built on —
 * with the observer's cells marked. The recipe open on Labor is listed first.
 * A timed batch is entered on Labor (dated, observer, quality result) and
 * joins the log; the sheet is not imported. Follows the evidence-pack pattern
 * (exceljs). No wage or pay appears.
 */

const FILL_OBSERVER: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2B2' } };
const FONT_CARRIED: Partial<ExcelJS.Font> = { color: { argb: 'FF1F4E79' } };

function widths(ws: ExcelJS.Worksheet, w: number[]): void {
  w.forEach((width, i) => {
    ws.getColumn(i + 1).width = width;
  });
}

export async function buildTimeStudySheet(asOf: string, firstRecipeCode: string | null): Promise<{ buffer: Buffer; fileName: string }> {
  const [recipes, library] = await Promise.all([listRecipes(), listTimeStudies()]);
  const ordered = [...recipes].sort((a, b) => (a.code === firstRecipeCode ? -1 : b.code === firstRecipeCode ? 1 : 0));

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Muse Kitchen Impact OS';
  wb.created = new Date();

  const readme = wb.addWorksheet('Read Me');
  const lines: [string, string][] = [
    ['Muse Kitchen Impact OS — Time Study Sheet', `Prepared ${asOf}. ${recipes.length} recipes in the library.`],
    ['', ''],
    ['What this is', 'The instrument for timing a recipe. One block per recipe, its tasks off that recipe\'s own served components, on two streams. The batch stream is the cook: receiving, mise en place, a prep and a cook per hot component, component blast chill and stage, line turnaround. The dispatch stream runs first thing each delivery day from staged components: a cold assembly per cold component, portion and assemble, seal and label, the temperature check at pack, load for transport. There is no second blast chill and no cold-hold task; end-of-day closedown is not on a study.'],
    ['Streams', 'Batch lines are timed against the batch cooked. Dispatch lines are timed on a delivery day against the portions shipped that day; a fixed dispatch line (loading the vehicle) counts once per delivery day. Write the portions shipped beside the dispatch lines.'],
    ['How to run a study', '1. Pick a recipe and a production day. 2. Write the study date, the observer and the batch size actually produced on the block. 3. Time each task: the people on it, and the clock times it started and ended. Elapsed minutes are end minus start; labor minutes are the people-minutes the task took (people × elapsed where everyone worked the whole task). 4. Mark whether the task is fixed per batch (the same time whatever the batch size) or scales with portions. 5. Record the quality result (pass, hold or fail) and any notes.'],
    ['Batch size', 'Labor minutes mean nothing without the batch they were timed at. The batch size printed on each block is the derived batch at the plan\'s defaults; write down the batch actually observed.'],
    ['Entering the study', 'A timed batch is entered on Labor in the OS — Record a time study — dated, with the observer and the quality result. It joins the recipe\'s log and the trends; an admin adopts it as the recipe\'s labor standard. This sheet is not imported.'],
    ['Estimated studies', 'Every recipe carries an estimated study until its first observed study is entered: a mock estimate per step, built from the plan\'s 14-task estimate and the thermal processing standards, labelled Estimated. The "Standards on file" tab lists each recipe\'s current standard and its basis; the reference minutes on each block are that standard\'s.'],
    ['Legend', 'Shaded cells are what the observer fills in. Blue text is carried from the OS. No wage or pay appears on this sheet.'],
  ];
  for (const [k, v] of lines) readme.addRow([k, v]);
  readme.getRow(1).font = { bold: true, size: 13 };
  readme.getColumn(1).font = { bold: true };
  widths(readme, [22, 120]);
  readme.eachRow((r) => {
    r.alignment = { wrapText: true, vertical: 'top' };
  });

  const sheet = wb.addWorksheet('Time Study Sheet');
  const header = ['Recipe code', 'Recipe', 'Study date', 'Observer', 'Batch size (portions)', 'Seq', 'Task', 'Stream (batch / dispatch)', 'Station (suggested)', 'CCP', 'Staff', 'Start', 'End', 'Elapsed min', 'Labor min', 'Scales with (fixed / variable)', 'Quality (pass / hold / fail)', 'Notes', 'Reference: standard basis', 'Reference: standard labor min'];
  sheet.addRow(header).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  const OBSERVER_COLS = [3, 4, 5, 11, 12, 13, 14, 15, 16, 17, 18];
  for (const recipe of ordered) {
    const standard = laborStandard(studiesForRecipe(library.studies, recipe.code));
    const scaffold = timeStudyScaffold(recipe);
    const batch = deriveCapacity(recipe).batchSize;
    const refLines = standard && standard.lines.length === scaffold.length ? standard.lines : null;
    scaffold.forEach((t, i) => {
      const ref = refLines?.[i];
      const row = sheet.addRow([
        recipe.code,
        recipe.name,
        null,
        null,
        batch,
        t.seq,
        t.task,
        t.stream,
        t.station,
        t.ccp,
        null,
        null,
        null,
        null,
        null,
        t.scalesWith,
        null,
        null,
        standard ? TIME_STUDY_BASIS_LABELS[standard.basis] : 'None on file',
        ref ? ref.laborMinutes : null,
      ]);
      for (const c of OBSERVER_COLS) row.getCell(c).fill = FILL_OBSERVER;
      for (const c of [1, 2, 6, 7, 8, 9, 10, 19, 20]) row.getCell(c).font = FONT_CARRIED;
      row.getCell(16).font = FONT_CARRIED;
    });
    const total = sheet.addRow([null, null, null, null, null, null, `${recipe.code} — TOTAL`, null, null, null, null, null, null, null, null, '← labor min', null, null, null, null]);
    total.font = { bold: true };
    sheet.addRow([]);
  }
  widths(sheet, [12, 40, 12, 16, 12, 6, 52, 12, 34, 8, 7, 8, 8, 11, 10, 16, 16, 30, 16, 14]);

  const standards = wb.addWorksheet('Standards on file');
  standards.addRow(['Recipe code', 'Recipe', 'Standard basis', 'Studied on', 'Batch (portions)', 'Observer', 'Quality', 'Seq', 'Task', 'Stream', 'Station', 'Staff', 'Elapsed min', 'Labor min', 'Scales with', 'Adopted on', 'Notes']).font = { bold: true };
  standards.views = [{ state: 'frozen', ySplit: 1 }];
  for (const recipe of ordered) {
    const standard = laborStandard(studiesForRecipe(library.studies, recipe.code));
    if (!standard) {
      standards.addRow([recipe.code, recipe.name, 'None on file']);
      continue;
    }
    standard.lines.forEach((l, i) => {
      standards.addRow([
        recipe.code,
        recipe.name,
        TIME_STUDY_BASIS_LABELS[standard.basis],
        standard.studiedOn,
        standard.batchSize,
        standard.observer,
        standard.qualityResult ? QUALITY_RESULT_LABELS[standard.qualityResult] : null,
        i + 1,
        l.task,
        l.stream,
        l.station,
        l.staff,
        l.elapsedMinutes,
        l.laborMinutes,
        l.scalesWith,
        standard.adoptedAt ? standard.adoptedAt.slice(0, 10) : null,
        i === 0 ? standard.qualityNotes : null,
      ]);
    });
  }
  widths(standards, [12, 40, 12, 12, 10, 16, 8, 6, 60, 10, 34, 7, 11, 10, 10, 12, 80]);

  const log = wb.addWorksheet('Studies on file');
  log.addRow(['Recipe code', 'Basis', 'Studied on', 'Batch (portions)', 'Observer', 'Quality', 'Labor min', 'Batch stream min', 'Dispatch stream min', 'Fixed min / batch', 'Variable min / portion', 'Min / portion', 'Adopted on', 'Adopted by', 'Standard']).font = { bold: true };
  for (const recipe of ordered) {
    const mine = studiesForRecipe(library.studies, recipe.code);
    const standard = laborStandard(mine);
    for (const s of mine) {
      const sum = summarizeStudy(s);
      log.addRow([
        recipe.code,
        TIME_STUDY_BASIS_LABELS[s.basis],
        s.studiedOn,
        s.batchSize,
        s.observer,
        s.qualityResult ? QUALITY_RESULT_LABELS[s.qualityResult] : null,
        sum.laborMinutes,
        sum.batchLaborMinutes,
        sum.dispatchLaborMinutes,
        sum.fixedMinutesPerBatch,
        Math.round(sum.variableMinutesPerPortion * 1000) / 1000,
        Math.round(sum.laborMinutesPerPortion * 1000) / 1000,
        s.adoptedAt ? s.adoptedAt.slice(0, 10) : null,
        s.adoptedBy,
        standard?.id === s.id ? (s.adoptedAt ? 'Adopted' : 'Stands in') : s.adoptedAt ? 'Adopted earlier' : null,
      ]);
    }
  }
  widths(log, [12, 10, 12, 10, 16, 8, 10, 12, 12, 12, 12, 10, 12, 24, 14]);

  const tasks = wb.addWorksheet('Plan task library');
  tasks.addRow(['Seq', 'Task', 'Station', 'Staff', 'Elapsed min', 'Labor min', 'CCP', 'Scales with', 'Stream', 'On the studies as']).font = { bold: true };
  timeStudy.tasks.forEach((t, i) => {
    const s = PLAN_TASK_STREAMS[t.task];
    tasks.addRow([i + 1, t.task, t.station, t.staff, t.elapsedMin, t.laborMinutes, t.ccp, t.scalesWith, s?.stream ?? null, s?.task ?? t.task]);
  });
  tasks.addRow([]);
  tasks.addRow([null, `The plan's 14-task estimate for AMK-E-001 at a ${timeStudy.estimatedAtBatchSize}-portion batch. An estimate, not an observation: it is what the estimated studies were built from. There is no second blast chill and no cold-hold task; those two lines' minutes carry to the temperature check at pack and the vehicle load.`]);
  widths(tasks, [6, 44, 28, 7, 11, 10, 8, 10, 10, 44]);

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, fileName: `muse-time-study-sheet-${asOf}.xlsx` };
}
