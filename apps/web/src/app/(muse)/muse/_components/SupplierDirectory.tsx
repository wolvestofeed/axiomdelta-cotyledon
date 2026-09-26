'use client';

/**
 * Suppliers → directory section as a four-tab panel:
 *   • Directory — the table, with each operation's linked lines and a control to
 *     link one of the recipe's lines to it.
 *   • Map — producer pins on an OpenStreetMap map, a home-address sidebar, and
 *     the straight-line distance to whichever producer is selected.
 *   • Match to recipe — recipe lines against certified-producer products.
 *   • Linked lines — the reverse view: every operation the model points at, the
 *     lines that name it, and what today's purchase order buys from it. Includes
 *     linked operations outside the current filter, hydrated by id.
 *
 * Receives only the already-filtered, capped `producers` set as props (never
 * the full compiled dataset), consistent with the page's server-side filtering.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import PinMap from './PinMap';
import { haversineMiles, type ClientSupplier, type RecipeMatchView } from '../_engine/geo';
import { money, num } from './ui';
import { RatingPill, RatingLegend, ratingHeader } from './MarkRating';
import { useScenario } from '../_state/scenario-store';
import { useLinkedSuppliers } from './useLinkedSuppliers';
import { supplierReverseLinks } from '../_engine/entity-links';
import { SectionSave } from './SectionSave';

interface Home {
  name: string;
  address: string;
  lat: number;
  lng: number;
  approximate: boolean;
}

interface Props {
  producers: ClientSupplier[];
  home: Home;
  totalInView: number;
  displayCap: number;
  capped: boolean;
  recipeMatches: RecipeMatchView[];
  regionLabel: string;
  /** The next production run's net requirement on the selected world, and every active recipe's ingredients (Roadmap N9). */
  nextRun: { kind: 'plan' | 'actual'; deliveryDate: string; productionDate: string; lines: { ingredient: string; extendedCost: number; casesToOrder: number }[]; ingredients: string[] };
}

function fmtMiles(mi: number): string {
  return mi < 100 ? mi.toFixed(1) : mi.toFixed(0);
}

export default function SupplierDirectory({
  producers,
  home,
  totalInView,
  displayCap,
  capped,
  recipeMatches,
  regionLabel,
  nextRun,
}: Props) {
  const [tab, setTab] = useState<'directory' | 'map' | 'recipe' | 'linked'>('directory');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // The reverse view reads the same forecast links the ingredient lines write,
  // so linking here and linking on Recipes are one and the same edit.
  const { resolved, setSustainability, isSuperAdmin } = useScenario();
  const links = resolved.sustainability.ingredientSupplier;
  const linkedById = useLinkedSuppliers(links);
  const ingredientNames = nextRun.ingredients;
  const poLines = useMemo(() => nextRun.lines.map((l) => ({ name: l.ingredient, extendedCost: l.extendedCost, casesToOrder: l.casesToOrder })), [nextRun.lines]);
  const reverse = useMemo(() => supplierReverseLinks(links, poLines), [links, poLines]);
  const linesBySupplier = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of reverse) m.set(r.supplierId, r.ingredients);
    return m;
  }, [reverse]);

  const setLink = (ingredient: string, supplierId: string | undefined) =>
    setSustainability((d) => {
      const m = (d.ingredientSupplier ??= {});
      if (supplierId === undefined) delete m[ingredient];
      else m[ingredient] = supplierId;
      if (Object.keys(m).length === 0) delete d.ingredientSupplier;
    });
  const [recipeCode, setRecipeCode] = useState<string>(recipeMatches[0]?.code ?? '');
  const selectedRecipe =
    recipeMatches.find((r) => r.code === recipeCode) ?? recipeMatches[0] ?? null;

  const mappable = useMemo(() => producers.filter((p) => p.lat != null && p.lng != null), [producers]);
  const unmappable = producers.length - mappable.length;
  const selected = useMemo(
    () => (selectedId ? producers.find((p) => p.id === selectedId) ?? null : null),
    [selectedId, producers],
  );
  const selectedMiles =
    selected && selected.lat != null && selected.lng != null
      ? haversineMiles(home, { lat: selected.lat, lng: selected.lng })
      : null;

  return (
    <div className="muse-card mt-4">
      {/* Tab bar — gradient header band, bleeds to the card edges */}
      <div
        className="flex items-center gap-2 mt-[-1.1rem]! mr-[-1.2rem]! mb-4! ml-[-1.2rem]! py-[0.6rem] px-[0.9rem] bg-[linear-gradient(135deg,var(--muse-forest)_0%,var(--muse-forest-soft)_55%,var(--muse-olive)_150%)] [border-top-left-radius:0.6rem] [border-top-right-radius:0.6rem]"
      >
        <TabButton active={tab === 'directory'} onClick={() => setTab('directory')}>
          Directory
        </TabButton>
        <TabButton active={tab === 'map'} onClick={() => setTab('map')}>
          Map
        </TabButton>
        <TabButton active={tab === 'recipe'} onClick={() => setTab('recipe')}>
          Match to recipe
        </TabButton>
        <TabButton active={tab === 'linked'} onClick={() => setTab('linked')}>
          Linked lines{reverse.length > 0 ? ` (${reverse.length})` : ''}
        </TabButton>
        {tab !== 'recipe' && tab !== 'linked' && (
          <div className="ml-auto! muse-fs-xs font-medium text-[rgba(255,255,255,0.8)]">
            Showing {num(producers.length)} of {num(totalInView)}
          </div>
        )}
      </div>

      <div className="mb-3!">
        <SectionSave sections={['sustainability']} title="the supplier links" />
      </div>

      {tab === 'directory' ? (
        <>
          <div className="muse-scroll-x">
            <table className="muse-table">
              <thead>
                <tr>
                  <th>Operation</th><th>{ratingHeader()}</th><th>Location</th><th>Certification</th><th>School</th><th>Products</th>
                  <th className="num">Volume capacity</th><th>Wholesale readiness</th><th className="num">Pricing</th><th className="num">Lead time</th>
                  <th>Linked lines</th>
                </tr>
              </thead>
              <tbody>
                {producers.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <div className="font-medium">
                        <Link className="muse-link" href={`/muse/suppliers/${o.id}`}>{o.name}</Link>
                      </div>
                      <div className="muse-c-faint muse-fs-xs">
                        {o.meta}
                        {o.website ? (
                          <>
                            {' · '}
                            <a href={`https://${o.website.replace(/^https?:\/\//, '')}`} target="_blank" rel="noopener noreferrer" className="muse-c-faint underline!">
                              their site
                            </a>
                          </>
                        ) : null}
                      </div>
                    </td>
                    <td><RatingPill rating={o.rating} /></td>
                    <td className="muse-c-soft">{o.location}</td>
                    <td>{o.certified ? <span className="muse-pill ok">{o.certScope || 'Certified'}</span> : <span className="muse-c-faint muse-fs-xs">—</span>}</td>
                    <td>{o.schoolReady ? <span className="muse-pill ok">{o.tdaType ?? 'School-ready'}</span> : <span className="muse-c-faint muse-fs-xs">—</span>}</td>
                    <td className="muse-c-soft max-w-80! muse-fs-xs">
                      {o.products || (o.tdaType ? 'Product detail from TDA pull (follow-up)' : '')}
                    </td>
                    <td className="num muse-c-faint muse-fs-xs">{o.volumeCapacity ?? '—'}</td>
                    <td className="muse-c-faint muse-fs-xs">{o.wholesaleReadiness ?? '—'}</td>
                    <td className="num muse-c-faint muse-fs-xs">{o.pricing ?? '—'}</td>
                    <td className="num muse-c-faint muse-fs-xs">{o.leadTime ?? '—'}</td>
                    <td>
                      <LinkedLinesCell
                        lines={linesBySupplier.get(o.id) ?? []}
                        ingredients={ingredientNames}
                        canEdit={isSuperAdmin}
                        supplierName={o.name}
                        onLink={(ingredient) => setLink(ingredient, o.id)}
                        onUnlink={(ingredient) => setLink(ingredient, undefined)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {capped && (
            <p className="muse-kpi-sub mt-2">Showing the first {num(displayCap)}. Narrow with region, scope, or product search above.</p>
          )}
          <RatingLegend />
          <p className="muse-kpi-sub mt-2">
            An operation&apos;s name opens its record — contact, terms, the seasonal catalog imported from
            their price sheet, and the purchase orders raised against them. Volume capacity, wholesale
            readiness, pricing, and lead time are not in any public directory; they come from
            conversations and are entered per supplier once engaged. Linking a line to an operation here
            writes the same forecast link the Recipes, Procurement, and Ingredients pages write; the
            Linked lines tab is the same set read from the operation&apos;s side.
          </p>
        </>
      ) : tab === 'map' ? (
        <div className="flex flex-wrap gap-4 items-stretch">
          <div className="flex-[1_1_22rem] min-w-72">
            <PinMap pins={mappable} home={home} selectedId={selectedId} onSelect={setSelectedId} />
            <p className="muse-kpi-sub mt-2">
              Pins are ZIP-code or county centroids (town level), not exact farm coordinates. Distance is
              straight-line from the kitchen. Map data © OpenStreetMap contributors.
              {unmappable > 0 ? ` ${num(unmappable)} producer${unmappable === 1 ? '' : 's'} in this view had no mappable location and ${unmappable === 1 ? 'is' : 'are'} not shown on the map.` : ''}
            </p>
          </div>

          {/* Right sidebar */}
          <aside className="flex-[0_0_19rem] min-w-64 flex flex-col gap-[0.8rem]">
            <div className="border border-[color:var(--muse-line)] rounded-[0.5rem] py-[0.8rem] px-[0.9rem] bg-[color:var(--muse-surface-2)]">
              <div className="muse-card-title mb-[0.4rem]!">Home</div>
              <div className="flex items-center gap-2">
                <span className="w-[12px] h-[12px] rounded-full bg-[color:var(--muse-accent)] border-2 border-[color:var(--muse-ink-strong)] shadow-[0_0_0_1px_var(--muse-line)] flex-none" />
                <span className="font-semibold">{home.name}</span>
              </div>
              <div className="muse-c-soft muse-fs-sm mt-[0.3rem]!">{home.address}</div>
              {home.approximate && (
                <div className="muse-c-faint muse-fs-xs mt-[0.3rem]!">
                  Approximate pin — exact address to be confirmed.
                </div>
              )}
            </div>

            <div className="border border-[color:var(--muse-line)] rounded-[0.5rem] py-[0.8rem] px-[0.9rem] bg-[color:var(--muse-surface-2)]">
              <div className="muse-card-title mb-[0.4rem]!">Selected producer</div>
              {selected ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="w-[12px] h-[12px] rounded-full bg-[color:var(--muse-forest)] border-2 border-[color:var(--muse-ink-strong)] shadow-[0_0_0_1px_var(--muse-line)] flex-none" />
                    <span className="font-semibold">{selected.name}</span>
                  </div>
                  <div className="muse-c-soft muse-fs-sm mt-[0.3rem]!">{selected.location}</div>
                  {selectedMiles != null && (
                    <div className="mt-[0.7rem]!">
                      <div className="muse-kpi-value muse-fs-xl">{fmtMiles(selectedMiles)} mi</div>
                      <div className="muse-kpi-sub">Straight-line distance from {home.name}</div>
                    </div>
                  )}
                  <div className="muse-c-faint muse-fs-xs mt-2!">
                    Pin is a {selected.geoSource === 'zip' ? 'ZIP-code' : 'county'} centroid — distance is approximate.
                  </div>
                  <div className="mt-[0.7rem]!">
                    <Link className="muse-link font-semibold!" href={`/muse/suppliers/${selected.id}`}>
                      Open the record →
                    </Link>
                  </div>
                  <button type="button" onClick={() => setSelectedId(null)} className="mt-[0.7rem]! py-[0.3rem]! px-[0.7rem]! border! border-[color:var(--muse-line)]! rounded-[0.35rem]! bg-[color:var(--muse-surface)]! muse-c-soft muse-fs-xs cursor-pointer!">Clear selection</button>
                </>
              ) : (
                <div className="muse-c-faint muse-fs-sm">
                  Select a producer pin on the map to see its straight-line distance from {home.name}.
                </div>
              )}
            </div>
          </aside>
        </div>
      ) : tab === 'recipe' ? (
        <>
          <div className="flex flex-wrap gap-3 items-end mb-[0.8rem]!">
            <label className="muse-fs-sm">
              <div className="muse-kpi-label">Recipe</div>
              <select
                value={recipeCode}
                onChange={(e) => setRecipeCode(e.target.value)}
                disabled={recipeMatches.length <= 1}
                className="py-[0.4rem]! px-[0.6rem]! border! border-[color:var(--muse-line)]! rounded-[0.4rem]! bg-[color:var(--muse-surface)]! muse-c-ink muse-fs-sm min-w-72!"
              >
                {recipeMatches.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name} ({r.code})
                  </option>
                ))}
              </select>
            </label>
            {recipeMatches.length <= 1 && (
              <span className="muse-fs-xs muse-c-faint pb-[0.4rem]">
                One recipe on file — the list grows as recipes are added.
              </span>
            )}
          </div>

          {selectedRecipe ? (
            <>
              <p className="muse-kpi-sub mt-0! mb-[0.6rem]!">
                {selectedRecipe.category} · Recipe {selectedRecipe.code} lines matched against
                certified-producer products in {regionLabel}.
              </p>
              <div className="muse-scroll-x">
                <table className="muse-table">
                  <thead>
                    <tr><th>Ingredient line</th><th className="num">Matches</th><th>Example producers</th></tr>
                  </thead>
                  <tbody>
                    {selectedRecipe.lines.map((m) => (
                      <tr key={m.ingredient}>
                        <td className="font-medium!">{m.ingredient}</td>
                        <td className={`num ${(m.count ? 'muse-c-ink' : 'muse-c-accent')}`}>{m.count}</td>
                        <td className="muse-c-soft">
                          {m.examples.join(' · ') || 'No certified producer matched in this region'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="muse-kpi-sub">No recipes on file.</p>
          )}
        </>
      ) : (
        <>
          <div className="grid gap-3 muse-autofit-11">
            <div className="muse-card muse-lift">
              <div className="muse-kpi-value">{num(reverse.length)}</div>
              <div className="muse-kpi-label">Operations the model points at</div>
              <div className="muse-kpi-sub">Across every recipe line</div>
            </div>
            <div className="muse-card muse-lift">
              <div className="muse-kpi-value">{num(Object.keys(links).length)}</div>
              <div className="muse-kpi-label">Lines with a supplier</div>
              <div className="muse-kpi-sub">of {num(ingredientNames.length)} recipe lines</div>
            </div>
            <div className="muse-card muse-lift">
              <div className="muse-kpi-value">{money(reverse.reduce((t, r) => t + r.orderedSpend, 0), 0)}</div>
              <div className="muse-kpi-label">Spend on linked lines</div>
              <div className="muse-kpi-sub">Next run, {nextRun.productionDate} — {nextRun.kind === 'plan' ? 'Plan' : 'Actual'}</div>
            </div>
          </div>

          {reverse.length === 0 ? (
            <p className="muse-kpi-sub mt-3">
              No line is linked to an operation yet. Link one from the Directory tab, or from a line on
              Recipes, Procurement, or Ingredients.
            </p>
          ) : (
            <div className="muse-scroll-x mt-3">
              <table className="muse-table">
                <thead>
                  <tr>
                    <th>Operation</th><th>{ratingHeader()}</th><th>Location</th><th>Certification</th>
                    <th>Lines</th><th className="num">PO lines</th><th className="num">Cases</th><th className="num">Ordered spend</th>
                  </tr>
                </thead>
                <tbody>
                  {reverse.map((r) => {
                    const lean = linkedById[r.supplierId];
                    return (
                      <tr key={r.supplierId}>
                        <td className="font-medium!">
                          {lean ? (
                            <Link className="muse-link" href={`/muse/suppliers/${r.supplierId}`}>{lean.name}</Link>
                          ) : (
                            <span className="muse-c-faint muse-fs-xs">Not in the directory ({r.supplierId})</span>
                          )}
                        </td>
                        <td>{lean ? <RatingPill rating={lean.rating} /> : '—'}</td>
                        <td className="muse-c-soft">{lean?.location ?? '—'}</td>
                        <td>
                          {lean?.certified ? (
                            <span className="muse-pill ok">{lean.certScope || 'Certified'}</span>
                          ) : (
                            <span className="muse-c-faint muse-fs-xs">—</span>
                          )}
                        </td>
                        <td className="muse-fs-xs">
                          {r.ingredients.map((i) => (
                            <div key={i} className="flex items-center gap-[0.4rem]">
                              <span>{i}</span>
                              {isSuperAdmin ? (
                                <button type="button" className="muse-btn muse-fs-2xs py-[0.1rem]! px-[0.4rem]!" onClick={() => setLink(i, undefined)}>
                                  Unlink
                                </button>
                              ) : null}
                            </div>
                          ))}
                        </td>
                        <td className="num">{r.orderedLines}</td>
                        <td className="num">{r.orderedCases}</td>
                        <td className="num">{money(r.orderedSpend)}</td>
                      </tr>
                    );
                  })}
                  <tr className="total">
                    <td colSpan={5}>Total across linked operations</td>
                    <td className="num">{reverse.reduce((t, r) => t + r.orderedLines, 0)}</td>
                    <td className="num">{reverse.reduce((t, r) => t + r.orderedCases, 0)}</td>
                    <td className="num">{money(reverse.reduce((t, r) => t + r.orderedSpend, 0))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          <RatingLegend />
          <p className="muse-kpi-sub mt-2">
            Cases and spend are the net requirement of the next production run ({nextRun.productionDate}, for delivery {nextRun.deliveryDate}) from the order book on {nextRun.kind === 'plan' ? 'Plan, the saved open forecast' : 'Actual, netted against raw stock and open purchase orders'}. An
            operation linked to a line that run does not buy shows the link with no spend.
            Links are part of the forecast and are saved with it.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * An operation's linked recipe lines, with the control to link another. The
 * select lists every line in the recipe; choosing one points that line at this
 * operation, replacing whatever it pointed at before.
 */
function LinkedLinesCell({
  lines,
  ingredients,
  canEdit,
  supplierName,
  onLink,
  onUnlink,
}: {
  lines: string[];
  ingredients: string[];
  canEdit: boolean;
  supplierName: string;
  onLink: (ingredient: string) => void;
  onUnlink: (ingredient: string) => void;
}) {
  const unlinkedHere = ingredients.filter((i) => !lines.includes(i));
  return (
    <div className="muse-fs-xs min-w-36">
      {lines.length === 0 ? (
        <span className="muse-c-faint muse-fs-xs">—</span>
      ) : (
        lines.map((i) => (
          <div key={i} className="flex items-center gap-[0.3rem]">
            <span className="muse-pill ok">{i}</span>
            {canEdit ? (
              <button type="button" className="muse-btn muse-fs-2xs py-[0.05rem]! px-[0.35rem]!" onClick={() => onUnlink(i)}>
                ×
              </button>
            ) : null}
          </div>
        ))
      )}
      {canEdit && unlinkedHere.length > 0 ? (
        <select
          className="muse-input muse-fs-xs min-w-32! mt-1!"
          value=""
          aria-label={`Link a recipe line to ${supplierName}`}
          onChange={(e) => {
            if (e.target.value) onLink(e.target.value);
          }}
        >
          <option value="">Link to line…</option>
          {unlinkedHere.map((i) => (
            <option key={i} value={i}>{i}</option>
          ))}
        </select>
      ) : null}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`py-[0.4rem]! px-[1.15rem]! rounded-[0.45rem]! muse-fs-sm tracking-[0.01em]! cursor-pointer! [transition:background_120ms_ease,color_120ms_ease]! ${(active ? 'border! border-[color:transparent]!' : 'border! border-[color:rgba(255,255,255,0.45)]!')} ${(active ? 'bg-[color:var(--muse-ink-strong)]!' : 'bg-[color:rgba(255,255,255,0.12)]!')} ${(active ? 'muse-c-forest' : 'text-[rgba(255,255,255,0.92)]!')} ${(active ? 'font-bold!' : 'font-semibold!')}`} style={{ boxShadow: active ? '0 1px 3px rgba(0,0,0,0.28)' : 'none' }}
    >
      {children}
    </button>
  );
}
