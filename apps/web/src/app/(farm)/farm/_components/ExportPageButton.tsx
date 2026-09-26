'use client';

import { useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { cellText, type PageExport } from '../_engine/page-export';

/**
 * Export the page as it stands (Roadmap Phase E follow-up): every KPI tile and
 * every table rendered in the content, each under the title of the card it sits
 * in, written to a workbook by `/farm/export`. The button reads the page the
 * reader is looking at — the open tab, the selected world and period, unsaved
 * edits included — so the file equals the screen. It sits in the right column of
 * every page header inside the OS.
 */
const noSubscribe = () => () => {};
const inShell = () => document.querySelector('.farm-shell') !== null;

export function ExportPageButton() {
  const pathname = usePathname();
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');
  // Only inside the OS shell: the portals share the page header, and their users hold no operator role.
  const shown = useSyncExternalStore(noSubscribe, inShell, () => false);

  const run = async () => {
    setState('busy');
    try {
      const payload = collect(pathname);
      const res = await fetch('/farm/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(String(res.status));
      const name = res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'farm-page.xlsx';
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setState('idle');
    } catch {
      setState('error');
    }
  };

  if (!shown) return null;
  return (
    <span className="inline-flex items-center gap-2">
      {state === 'error' && <span className="farm-c-over farm-fs-2xs">The export could not be written.</span>}
      <button type="button" className="farm-btn ghost" disabled={state === 'busy'} onClick={run} title="Every figure and table on this page, as shown, in a workbook">
        {state === 'busy' ? 'Preparing…' : 'Export page — XLSX'}
      </button>
    </span>
  );
}

/** The value a cell shows: a control's value when it holds one, else its text. */
function textOf(el: Element): string {
  const control = el.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea');
  if (control) {
    if (control instanceof HTMLInputElement && control.type === 'checkbox') return control.checked ? 'Yes' : 'No';
    if (control instanceof HTMLSelectElement) return cellText(control.selectedOptions[0]?.textContent ?? control.value);
    return cellText(control.value);
  }
  return cellText((el as HTMLElement).innerText ?? el.textContent ?? '');
}

/** The title over a table: its card's title, else the nearest card title above it in the content. */
function headingFor(table: HTMLTableElement, content: Element): string {
  const card = table.closest('.farm-card, .farm-tab-panel');
  const inCard = card?.querySelector('.farm-card-title');
  if (inCard) return cellText(inCard.textContent ?? '');
  const caption = table.querySelector('caption');
  if (caption) return cellText(caption.textContent ?? '');
  const titles = [...content.querySelectorAll('.farm-card-title')];
  let last = '';
  for (const t of titles) {
    if (t.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING) last = cellText(t.textContent ?? '');
    else break;
  }
  return last;
}

function collect(path: string): PageExport {
  const content = document.querySelector('.farm-content') ?? document.body;
  const title = cellText(content.querySelector('.farm-page-title')?.textContent ?? document.title);
  const bar = document.querySelector('.farm-scenariobar-status');
  const context = bar ? cellText((bar as HTMLElement).innerText).slice(0, 400) : '';

  const figures: PageExport['figures'] = [];
  for (const tile of content.querySelectorAll('.farm-kpi-value, .farm-hero-value')) {
    const box = tile.parentElement;
    if (!box) continue;
    const label = box.querySelector('.farm-kpi-label, .farm-hero-label');
    const sub = box.querySelector('.farm-kpi-sub, .farm-hero-sub');
    figures.push({ label: cellText(label?.textContent ?? ''), value: cellText((tile as HTMLElement).innerText ?? ''), sub: cellText(sub?.textContent ?? '') });
  }

  const tables: PageExport['tables'] = [];
  for (const table of content.querySelectorAll<HTMLTableElement>('table')) {
    if (table.closest('table') !== table) continue; // nested layout tables are not data
    const headRow = table.tHead?.rows[table.tHead.rows.length - 1] ?? null;
    const columns = headRow ? [...headRow.cells].map(textOf) : [];
    const bodies = table.tBodies.length ? [...table.tBodies] : [];
    const rows: string[][] = [];
    for (const body of bodies) for (const r of body.rows) rows.push([...r.cells].map(textOf));
    for (const r of table.tFoot?.rows ?? []) rows.push([...r.cells].map(textOf));
    if (columns.length === 0 && rows.length === 0) continue;
    tables.push({ heading: headingFor(table, content), columns, rows });
  }

  return { kind: 'farm.page_export', title, path, context, figures: figures.slice(0, 200), tables: tables.slice(0, 60) };
}
