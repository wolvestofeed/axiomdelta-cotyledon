'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { importSupplierCatalog, clearSupplierCatalog } from '../_lib/catalog-actions';
import { EntityPicker } from './EntityPicker';
import { useLinkedEntity } from './useLinkedEntities';
import { entityRef } from '../_engine/entity-links';
import { catalogTemplateHeader, parseCatalogSheet } from '../_engine/catalog';

/**
 * Import a supplier's price sheet. Accepts a pasted spreadsheet (tabs) or a CSV,
 * either typed in or chosen as a file — no third-party service is involved and
 * the file never leaves the browser except as text in the action call.
 *
 * The sheet is parsed in the browser first so the operator sees what will be
 * imported, which columns were not recognised, and which rows could not be read,
 * BEFORE anything is written. An import replaces the supplier's catalog, because
 * a price sheet is a snapshot and a merge would leave last season's lines behind.
 *
 * What the snapshot governs is the set of lines, not their history: a line on
 * both sheets keeps its id, its approval and its past prices and gains this
 * sheet's price from the date given here; a new line arrives as a candidate and
 * prices nothing until it is approved (Roadmap N1).
 */
export function CatalogImport({
  supplierId,
  sources,
  hasExisting,
}: {
  supplierId: string;
  sources: { id: string; title: string }[];
  hasExisting: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [sourceId, setSourceId] = useState<string | undefined>(undefined);
  const linkedSource = useLinkedEntity(sourceId ? entityRef('source', sourceId) : undefined);
  const [mode, setMode] = useState<'replace' | 'append'>('replace');
  const [effectiveFrom, setEffectiveFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pending, start] = useTransition();

  // Parsed live so the preview is what the server will store.
  const preview = text.trim().length > 0 ? parseCatalogSheet(text) : null;

  async function onFile(file: File) {
    setText(await file.text());
    setMsg(null);
  }

  function submit() {
    if (!preview || preview.rows.length === 0) {
      setMsg({ kind: 'err', text: 'Nothing readable to import yet.' });
      return;
    }
    start(async () => {
      const res = await importSupplierCatalog({ supplierId, text, sourceId: sourceId ?? '', mode, effectiveFrom });
      if (res.ok) {
        const problems = res.problems.length > 0 ? ` ${res.problems.length} row(s) skipped.` : '';
        setMsg({
          kind: 'ok',
          text: `Imported ${res.imported} line(s): ${res.added} new, ${res.updated} already on file. ${res.priced} price(s) in force from ${res.effectiveFrom}. New lines are candidates until approved.${problems}`,
        });
        setText('');
        router.refresh();
      } else {
        setMsg({ kind: 'err', text: res.error });
      }
    });
  }

  return (
    <div className="mt-[1.2rem]! border-t border-t-[color:var(--muse-line)] pt-4">
      <div className="muse-card-title">Import a price sheet</div>

      <div className="flex gap-4 flex-wrap items-start">
        <div className="flex-[1_1_26rem] min-w-80">
          <label className="muse-kpi-label" htmlFor={`sheet-${supplierId}`}>
            Paste the sheet, or choose a CSV
          </label>
          <textarea
            id={`sheet-${supplierId}`}
            className="muse-input block! w-full! mt-[0.35rem]! muse-mono muse-fs-xs"
            rows={7}
            value={text}
            placeholder={`${catalogTemplateHeader()}\nGround beef,Livestock,85/15,40 lb case,lb,4.85,lb,40,7,1,12,USDA Organic,Concho County TX,GB8515,Frozen`}
            onChange={(e) => {
              setText(e.target.value);
              setMsg(null);
            }}
          />
          <div className="flex gap-[0.6rem] items-center mt-[0.4rem]! flex-wrap">
            <input
              type="file"
              accept=".csv,.tsv,.txt"
              className="muse-fs-xs"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
            />
            <span className="muse-kpi-sub">Tab- or comma-separated. Column names are matched loosely.</span>
          </div>
        </div>

        <div className="flex-[0_1_18rem] min-w-60">
          <div className="muse-field">
            <span className="muse-kpi-label">The sheet itself, registered as a source</span>
            <EntityPicker
              kinds={['source']}
              linked={linkedSource}
              canEdit
              label="document"
              emptyText="No document linked"
              ariaLabel="Link the price sheet document this catalog came from"
              placeholder="Search title, publisher, kind…"
              onLink={setSourceId}
            />
            <span className="muse-kpi-sub">
              {sources.length === 0
                ? 'Nothing registered yet; register the sheet on Sources to cite these prices.'
                : 'Every imported line then cites the sheet it came from.'}
            </span>
          </div>

          <label className="block! muse-fs-sm mt-[0.8rem]!">
            <span className="muse-kpi-label">These prices come into force</span>
            <input
              type="date"
              className="muse-input mt-[0.3rem]!"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
            <span className="muse-kpi-sub">The sheet&apos;s own date. Earlier prices stay readable for the dates they covered.</span>
          </label>

          <label className="block! muse-fs-sm mt-[0.8rem]!">
            <span className="muse-kpi-label">On import</span>
            <select className="muse-input mt-[0.3rem]!" value={mode} onChange={(e) => setMode(e.target.value as 'replace' | 'append')}>
              <option value="replace">Replace the catalog (a sheet is a snapshot)</option>
              <option value="append">Add to the existing catalog</option>
            </select>
          </label>
        </div>
      </div>

      {preview ? (
        <div className="mt-[0.8rem]! border border-[color:var(--muse-line)] rounded-[0.5rem] py-[0.7rem] px-[0.85rem] bg-[color:var(--muse-surface-2)]">
          <div className="muse-fs-sm font-semibold">
            {preview.rows.length} line(s) readable
            {preview.problems.length > 0 ? `, ${preview.problems.length} row(s) will be skipped` : ''}
          </div>
          {preview.unknownHeaders.length > 0 ? (
            <div className="muse-kpi-sub mt-1!">
              Columns not recognised, and therefore not imported: {preview.unknownHeaders.join(', ')}.
            </div>
          ) : null}
          {preview.missingFields.length > 0 ? (
            <div className="muse-kpi-sub mt-1!">
              Not supplied by this sheet: {preview.missingFields.join(', ')}. Those columns import blank.
            </div>
          ) : null}
          {preview.problems.slice(0, 5).map((p) => (
            <div key={`${p.line}-${p.reason}`} className="muse-kpi-sub muse-c-placeholder mt-[0.2rem]!">
              Line {p.line}: {p.reason}
            </div>
          ))}
          {preview.rows.length > 0 ? (
            <div className="muse-scroll-x mt-2!">
              <table className="muse-table">
                <thead><tr><th>Item</th><th>Pack</th><th className="num">Price</th><th>Available</th></tr></thead>
                <tbody>
                  {preview.rows.slice(0, 4).map((r, i) => (
                    <tr key={`${r.item}-${i}`}>
                      <td>{r.item}</td>
                      <td className="muse-c-soft">{r.packSize ?? '—'}</td>
                      <td className="num">{r.unitPrice === null ? '—' : r.unitPrice}</td>
                      <td className="muse-c-soft">{r.availStartMonth ?? '—'}–{r.availEndMonth ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.rows.length > 4 ? <div className="muse-kpi-sub">…and {preview.rows.length - 4} more.</div> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex gap-[0.6rem] items-center mt-[0.8rem]! flex-wrap">
        <button type="button" className="muse-btn primary" onClick={submit} disabled={pending || !preview || preview.rows.length === 0}>
          {pending ? 'Importing…' : `Import ${preview?.rows.length ?? 0} line(s)`}
        </button>
        {hasExisting ? (
          <button
            type="button"
            className="muse-btn"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await clearSupplierCatalog(supplierId);
                if (res.ok) {
                  setMsg({ kind: 'ok', text: 'Catalog cleared.' });
                  router.refresh();
                } else setMsg({ kind: 'err', text: res.error });
              })
            }
          >
            Clear the catalog
          </button>
        ) : null}
        {msg ? (
          <span className={`muse-kpi-sub ${(msg.kind === 'ok' ? 'muse-c-sourced' : 'muse-c-over')}`}>{msg.text}</span>
        ) : null}
      </div>
    </div>
  );
}
