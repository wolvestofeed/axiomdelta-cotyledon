'use client';

import { Fragment, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, Kpi, money, num, pct } from '../_components/ui';
import { CUSTOMER_PAYMENT_TERMS, PAYMENT_TERMS_LABELS, type CustomerPaymentTerms } from '../_data/working-capital';
import { SectionSave } from '../_components/SectionSave';
import { MealPlanForm, SequenceTable, emptySequence, valuesOf, type SequenceValues } from '../_components/MealPlanForm';
import { useScenario } from '../_state/scenario-store';
import { useLedger } from '../_state/ledger';
import {
  createCustomer,
  updateCustomer,
  deleteCustomer,
  createCustomerSite,
  updateCustomerSite,
  deleteCustomerSite,
  createCustomerService,
  updateCustomerService,
  deleteCustomerService,
  setVolumePick,
  deleteVolumePick,
  createSiteCalendarRange,
  deleteSiteCalendarRange,
  setCustomerRating,
} from '../_lib/customer-actions';
import { RatingPill } from '../_components/MarkRating';
import { MARK, NOT_RATED } from '../_data/mark';
import { assignMenuCycle, createMenuCycle, updateMenuCycle, deleteMenuCycle } from '../_lib/order-actions';
import {
  CUSTOMER_KIND_LABELS,
  CUSTOMER_STATUS_LABELS,
  type CustomerDef,
  type CustomerKind,
  type CustomerSiteDef,
  type CustomerStatus,
  type CustomerSiteStatus,
  type SiteCalendarKind,
} from '../_data/customers';
import { WEEKDAY_LABELS, type MenuCycleDef, type OrderDef } from '../_data/menu-cycles';
import { siteParticipation } from '../_engine/participation';
import { copyCycleToPlan, mealPlansOf, savedCycles } from '../_engine/meal-plans';
import { normalizePicks, volumeOn } from '../_engine/services';
import { FORECAST_HORIZON_OPTIONS, type ForecastHorizonYears, type ResolvedServiceForecast, type ResolvedSiteForecast } from '../_engine/demand';

/**
 * Customers (Roadmap N4a). Two kinds of edit, never mixed:
 *
 *   * the RECORD — the customer, its sites, each site's services and dated
 *     volume picks, its service calendar and the customer's meal plan. Facts of
 *     record, written to the database, super admins only.
 *   * the OPEN FORECAST — which customers it includes, a service's volume picks
 *     and weekdays, and its own copy of a customer's meal plan. Written to the
 *     forecast's overlay only; the record never moves. Anything the forecast
 *     has not edited follows the record.
 */

type Msg = { kind: 'ok' | 'err'; text: string } | null;
type Mode = 'record' | 'forecast';

interface CustomerForm {
  name: string; kind: CustomerKind; channel: number; status: CustomerStatus;
  pricePerMeal: number | ''; paymentTerms: CustomerPaymentTerms | ''; contractStart: string; contractEnd: string; notes: string;
}
interface SiteForm { name: string; siteId: string; gradeGroups: string[]; enrollment: number | ''; status: CustomerSiteStatus; notes: string }
interface ServiceForm { name: string; weekdays: number[]; status: 'active' | 'inactive'; notes: string }

const emptyCustomer = (channel: number): CustomerForm => ({ name: '', kind: channel === 1 ? 'district' : channel === 2 ? 'company' : 'marketplace', channel, status: 'prospect', pricePerMeal: '', paymentTerms: '', contractStart: '', contractEnd: '', notes: '' });
const emptySite = (): SiteForm => ({ name: '', siteId: '', gradeGroups: [], enrollment: '', status: 'active', notes: '' });
const weekdayText = (w: readonly number[]) => (w.length ? [...w].sort().map((d) => WEEKDAY_LABELS[d]).join(' ') : 'no weekday');

let localSeq = 0;
const localId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(localSeq++).toString(36)}`;

export function CustomersClient({
  canEdit,
  today,
  cycles,
  orders,
  deliverySites,
  actualMealsBySiteId,
  actualMealsBySiteName,
}: {
  canEdit: boolean;
  today: string;
  /** Saved menu cycles and every customer's meal plans, as on the record. */
  cycles: MenuCycleDef[];
  /** Stored orders, for participation: confirmed and delivered only are counted. */
  orders: OrderDef[];
  deliverySites: { id: string; name: string }[];
  actualMealsBySiteId: Record<string, number>;
  actualMealsBySiteName: Record<string, number>;
}) {
  const { resolved, setForecast } = useScenario();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  // The bar's Plan / Actual toggle picks where volume and meal-plan edits go (Roadmap N6 slice 3).
  const { kind: ledgerKind } = useLedger();
  const mode: Mode = ledgerKind === 'plan' ? 'forecast' : 'record';
  const [customerForm, setCustomerForm] = useState<{ mode: 'create' | 'edit'; id?: string; form: CustomerForm } | null>(null);
  const [siteForm, setSiteForm] = useState<{ mode: 'create' | 'edit'; customerId: string; id?: string; form: SiteForm } | null>(null);
  const [serviceForm, setServiceForm] = useState<{ mode: 'create' | 'edit'; siteId: string; id?: string; form: ServiceForm } | null>(null);
  const [pickForm, setPickForm] = useState<{ serviceId: string; effectiveDate: string; meals: number | '' } | null>(null);
  const [rangeForm, setRangeForm] = useState<{ siteId: string; kind: SiteCalendarKind; label: string; startDate: string; endDate: string } | null>(null);
  const [planForm, setPlanForm] = useState<{ customerId: string; id?: string; initial: SequenceValues } | null>(null);
  const [assignForm, setAssignForm] = useState<{ customerId: string; cycleId: string; startDate: string; customerServiceId: string } | null>(null);

  const demand = resolved.demand;
  const forecast = resolved.forecast;
  const byChannel = resolved.phases.map((p) => ({ phase: p.phase, market: p.market, price: p.pricePerMeal, row: demand.byChannel[p.phase] }));
  const siteById = useMemo(() => new Map(demand.sites.map((s) => [s.id, s])), [demand.sites]);
  const recipeNames = useMemo(() => Object.fromEntries(resolved.recipes.map((r) => [r.code, r.name])), [resolved.recipes]);
  const saved = useMemo(() => savedCycles(cycles), [cycles]);
  const cycleName = useMemo(() => new Map(cycles.map((c) => [c.id, c.name])), [cycles]);
  const recordMode = mode === 'record' && canEdit;

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okText: string) {
    start(async () => {
      const res = await fn();
      if (res.ok) {
        setMsg({ kind: 'ok', text: okText });
        setCustomerForm(null);
        setSiteForm(null);
        setServiceForm(null);
        setPickForm(null);
        setRangeForm(null);
        setPlanForm(null);
        setAssignForm(null);
        router.refresh();
      } else setMsg({ kind: 'err', text: res.error });
    });
  }
  const note = (text: string) => setMsg({ kind: 'ok', text });

  // ── Record forms ──────────────────────────────────────────────────────────
  const openEditCustomer = (c: CustomerDef) =>
    setCustomerForm({ mode: 'edit', id: c.id, form: { name: c.name, kind: c.kind, channel: c.channel, status: c.status, pricePerMeal: c.pricePerMealCents === null ? '' : c.pricePerMealCents / 100, paymentTerms: c.paymentTerms ?? '', contractStart: c.contractStart ?? '', contractEnd: c.contractEnd ?? '', notes: c.notes ?? '' } });
  function submitCustomer() {
    if (!customerForm) return;
    const f = customerForm.form;
    const payload = { name: f.name, kind: f.kind, channel: f.channel, status: f.status, pricePerMealCents: f.pricePerMeal === '' ? null : Math.round(f.pricePerMeal * 100), paymentTerms: f.paymentTerms || null, contractStart: f.contractStart || null, contractEnd: f.contractEnd || null, schoolId: null, notes: f.notes || null };
    run(() => (customerForm.mode === 'edit' ? updateCustomer({ ...payload, id: customerForm.id }) : createCustomer(payload)), `Saved ${f.name}.`);
  }
  function submitSite() {
    if (!siteForm) return;
    const f = siteForm.form;
    const payload = { customerId: siteForm.customerId, siteId: f.siteId || null, name: f.name, gradeGroups: f.gradeGroups, enrollment: f.enrollment === '' ? null : f.enrollment, status: f.status, notes: f.notes || null };
    run(() => (siteForm.mode === 'edit' ? updateCustomerSite({ ...payload, id: siteForm.id }) : createCustomerSite(payload)), `Saved site ${f.name}.`);
  }
  function submitService() {
    if (!serviceForm) return;
    const f = serviceForm.form;
    const payload = { name: f.name, weekdays: f.weekdays, status: f.status, notes: f.notes || null };
    run(() => (serviceForm.mode === 'edit' ? updateCustomerService({ ...payload, id: serviceForm.id }) : createCustomerService({ ...payload, customerSiteId: serviceForm.siteId })), `Saved service ${f.name}.`);
  }

  // ── Forecast edits (the overlay) ──────────────────────────────────────────
  const setIncluded = (customerId: string, included: boolean) =>
    setForecast((d) => {
      const all = (d.customers ??= {});
      if (included) delete all[customerId];
      else all[customerId] = { included: false };
    });
  const forecastPicks = (sv: ResolvedServiceForecast) => normalizePicks(sv.picks);
  const setForecastPicks = (serviceId: string, picks: { effectiveDate: string; meals: number }[] | undefined) =>
    setForecast((d) => {
      const all = (d.services ??= {});
      const row = (all[serviceId] ??= {});
      row.picks = picks;
    });
  const setForecastWeekdays = (serviceId: string, weekdays: number[] | undefined) =>
    setForecast((d) => {
      const all = (d.services ??= {});
      const row = (all[serviceId] ??= {});
      row.weekdays = weekdays;
    });
  const forecastPlansOf = (customerId: string): MenuCycleDef[] | null => forecast.mealPlans?.[customerId] ?? null;
  const setForecastPlans = (customerId: string, plans: MenuCycleDef[] | undefined) =>
    setForecast((d) => {
      const all = (d.mealPlans ??= {});
      if (plans === undefined) delete all[customerId];
      else all[customerId] = plans;
      if (Object.keys(all).length === 0) delete d.mealPlans;
    });

  function submitPick() {
    if (!pickForm || pickForm.meals === '') return;
    const { serviceId, effectiveDate, meals } = pickForm;
    if (recordMode) {
      run(() => setVolumePick({ serviceId, effectiveDate, meals }), `From ${effectiveDate}: ${num(meals)} meals per service.`);
      return;
    }
    const sv = demand.sites.flatMap((s) => s.services).find((x) => x.id === serviceId);
    if (!sv) return;
    setForecastPicks(serviceId, [...forecastPicks(sv).filter((p) => p.effectiveDate !== effectiveDate), { effectiveDate, meals }]);
    setPickForm(null);
    note(`In this forecast, from ${effectiveDate}: ${num(meals)} meals per service.`);
  }

  function submitPlan(v: SequenceValues) {
    if (!planForm) return;
    const customer = resolved.customers.find((c) => c.id === planForm.customerId);
    if (!customer) return;
    if (recordMode) {
      const payload = { ...v, customerId: customer.id };
      const id = planForm.id;
      run(async () => (id ? updateMenuCycle({ ...payload, id }) : createMenuCycle(payload)), `Saved ${customer.name}'s meal plan.`);
      return;
    }
    const current = forecastPlansOf(customer.id) ?? [];
    const base = current.find((p) => p.id === planForm.id);
    const next: MenuCycleDef = {
      id: base?.id ?? localId('FPLAN'),
      channel: null,
      customerId: customer.id,
      fromCycleId: base?.fromCycleId ?? null,
      source: 'user_built',
      ...v,
    };
    setForecastPlans(customer.id, [...current.filter((p) => p.id !== next.id), next]);
    setPlanForm(null);
    note(`${customer.name}'s meal plan edited in this forecast.`);
  }

  function submitAssign() {
    if (!assignForm) return;
    const cycle = saved.find((c) => c.id === assignForm.cycleId);
    const customer = resolved.customers.find((c) => c.id === assignForm.customerId);
    if (!cycle || !customer) return;
    const customerServiceId = assignForm.customerServiceId || null;
    if (recordMode) {
      run(() => assignMenuCycle({ cycleId: cycle.id, customerIds: [customer.id], customerServiceId, startDate: assignForm.startDate }), `${cycle.name} copied onto ${customer.name}'s meal plan.`);
      return;
    }
    const current = forecastPlansOf(customer.id) ?? [];
    setForecastPlans(customer.id, [...current, copyCycleToPlan(cycle, customer.id, localId('FPLAN'), { startDate: assignForm.startDate, customerServiceId })]);
    setAssignForm(null);
    note(`${cycle.name} copied onto ${customer.name}'s meal plan in this forecast.`);
  }

  const actualFor = (s: CustomerSiteDef) => (s.siteId ? actualMealsBySiteId[s.siteId] : undefined) ?? actualMealsBySiteName[s.name] ?? 0;
  const statusBadge = (c: CustomerDef) =>
    c.source !== 'seed' ? null : c.status === 'contracted' ? (
      <span className="muse-badge stated ml-2!" title={c.notes ?? ''}>Stated</span>
    ) : (
      <span className="muse-badge placeholder ml-2!" title={c.notes ?? ''}>Placeholder seed</span>
    );

  // ── Rendering ─────────────────────────────────────────────────────────────
  function renderPlans(c: CustomerDef, included: boolean) {
    const recordPlans = mealPlansOf(cycles, c.id);
    const forecastPlans = forecastPlansOf(c.id);
    const shown = mode === 'forecast' && forecastPlans ? forecastPlans : recordPlans;
    const editable = recordMode || (mode === 'forecast' && forecastPlans !== null);
    const services = c.sites.flatMap((s) => s.services.map((sv) => ({ id: sv.id, label: c.sites.length > 1 ? `${s.name} · ${sv.name}` : sv.name })));
    const serviceLabel = (id: string | null) => (id ? services.find((x) => x.id === id)?.label ?? 'a removed service' : 'every service');
    return (
      <div className="mt-[0.6rem]!">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="muse-kpi-sub">
            <span className="muse-c-ink font-semibold">Meal plan</span>
            {mode === 'forecast' && (forecastPlans ? ' · this forecast’s own copy' : ' · as on the record')}
          </span>
          {included && (
            <span className="inline-flex gap-[0.3rem]">
              {mode === 'forecast' && !forecastPlans && (
                <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => { setForecastPlans(c.id, structuredClone(recordPlans)); note(`${c.name}'s meal plan copied into this forecast; the record is unchanged.`); }}>Edit in this forecast</button>
              )}
              {mode === 'forecast' && forecastPlans && (
                <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => { setForecastPlans(c.id, undefined); note(`${c.name} follows the record's meal plan again.`); }}>Use the record’s plan</button>
              )}
              {editable && (
                <>
                  <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" disabled={pending || saved.length === 0} onClick={() => setAssignForm({ customerId: c.id, cycleId: saved[0]?.id ?? '', startDate: saved[0]?.startDate ?? today, customerServiceId: '' })}>Assign a saved cycle</button>
                  <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" disabled={pending} onClick={() => setPlanForm({ customerId: c.id, initial: emptySequence(today, `${c.name} meal plan`) })}>Program a sequence</button>
                </>
              )}
            </span>
          )}
        </div>
        {shown.length === 0 && <p className="muse-kpi-sub">No meal plan. This customer&rsquo;s services generate no forecast orders until one is assigned or programmed.</p>}
        {shown.map((p) => (
          <div key={p.id} className="muse-scroll-x mt-[0.35rem]!">
            <div className="muse-kpi-sub">
              {p.name} · {p.fromCycleId ? `copied from ${cycleName.get(p.fromCycleId) ?? 'a removed cycle'}` : 'programmed for this customer'} · serves {serviceLabel(p.customerServiceId)} · from {p.startDate}{p.endDate ? ` to ${p.endDate}` : ''} · {p.lengthDays}-day sequence on {weekdayText(p.weekdays)} · {p.status}
              {editable && (
                <span className="inline-flex gap-[0.3rem] ml-[0.6rem]!">
                  <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" disabled={pending} onClick={() => setPlanForm({ customerId: c.id, id: p.id, initial: valuesOf(p) })}>Edit</button>
                  <button
                    type="button"
                    className="muse-btn py-[0.1rem]! px-[0.4rem]!"
                    disabled={pending}
                    onClick={() => (recordMode ? run(() => deleteMenuCycle({ id: p.id }), `Removed a meal plan from ${c.name}.`) : setForecastPlans(c.id, (forecastPlans ?? []).filter((x) => x.id !== p.id)))}
                  >
                    Remove
                  </button>
                </span>
              )}
            </div>
            <SequenceTable plan={p} recipeNames={recipeNames} />
          </div>
        ))}
        {assignForm?.customerId === c.id && (
          <div className="mt-2! flex flex-wrap gap-3 items-end">
            <label className="muse-kpi-sub">Saved cycle<br />
              <select className="muse-select" value={assignForm.cycleId} onChange={(e) => setAssignForm({ ...assignForm, cycleId: e.target.value })}>
                {saved.map((cy) => <option key={cy.id} value={cy.id}>{cy.name}</option>)}
              </select>
            </label>
            <label className="muse-kpi-sub">Starts<br /><input className="muse-input" type="date" value={assignForm.startDate} onChange={(e) => e.target.value && setAssignForm({ ...assignForm, startDate: e.target.value })} /></label>
            {services.length > 1 && (
              <label className="muse-kpi-sub">Serves<br />
                <select className="muse-select" value={assignForm.customerServiceId} onChange={(e) => setAssignForm({ ...assignForm, customerServiceId: e.target.value })}>
                  <option value="">Every service</option>
                  {services.map((s) => <option key={s.id} value={s.id}>{s.label} only</option>)}
                </select>
              </label>
            )}
            <button type="button" className="muse-btn primary" disabled={pending || !assignForm.cycleId} onClick={submitAssign}>Assign</button>
            <button type="button" className="muse-btn" disabled={pending} onClick={() => setAssignForm(null)}>Cancel</button>
            <span className="muse-kpi-sub">A copy: later edits to the saved cycle reach this plan only when applied to it.</span>
          </div>
        )}
        {planForm?.customerId === c.id && (
          <MealPlanForm
            key={planForm.id ?? 'new'}
            title={`${planForm.id ? 'Edit' : 'Program'} ${c.name}'s meal plan${recordMode ? '' : ' — this forecast'}`}
            initial={planForm.initial}
            recipes={resolved.recipes}
            channel={c.channel}
            services={services.length > 1 ? services : []}
            pending={pending}
            onSave={submitPlan}
            onCancel={() => setPlanForm(null)}
          />
        )}
      </div>
    );
  }

  function renderCalendar(s: CustomerSiteDef, r: ResolvedSiteForecast | undefined) {
    const calendar = s.calendar;
    return (
      <div className="muse-kpi-sub mt-[0.35rem]!">
        <span className="muse-c-ink">Service calendar</span>
        {' · '}
        {calendar.length === 0
          ? 'no term dates on file — the site takes meals on every service weekday the kitchen is open'
          : calendar.map((x) => `${x.kind === 'term' ? 'Term' : 'Break'}${x.label ? ` “${x.label}”` : ''} ${x.startDate} to ${x.endDate}`).join(' · ')}
        {r && !r.calendarOnFile && calendar.length > 0 ? ' · breaks only, no term: every other service weekday counts' : ''}
        {canEdit && (
          <span className="inline-flex gap-[0.3rem] ml-[0.6rem]! flex-wrap">
            {calendar.map((x) => (
              <button key={x.id} type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" disabled={pending} onClick={() => run(() => deleteSiteCalendarRange({ id: x.id }), `Removed ${x.kind} ${x.startDate} to ${x.endDate}.`)}>× {x.kind} {x.startDate}</button>
            ))}
            <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" disabled={pending} onClick={() => setRangeForm({ siteId: s.id, kind: calendar.some((x) => x.kind === 'term') ? 'break' : 'term', label: '', startDate: today, endDate: today })}>Add dates</button>
          </span>
        )}
        {rangeForm?.siteId === s.id && (
          <div className="mt-[0.4rem]! flex flex-wrap gap-3 items-end">
            <label>Kind<br />
              <select className="muse-select" value={rangeForm.kind} onChange={(e) => setRangeForm({ ...rangeForm, kind: e.target.value as SiteCalendarKind })}>
                <option value="term">Term — takes meals</option><option value="break">Break — no meals</option>
              </select>
            </label>
            <label>Label<br /><input className="muse-input w-56!" value={rangeForm.label} onChange={(e) => setRangeForm({ ...rangeForm, label: e.target.value })} /></label>
            <label>From<br /><input className="muse-input" type="date" value={rangeForm.startDate} onChange={(e) => e.target.value && setRangeForm({ ...rangeForm, startDate: e.target.value })} /></label>
            <label>To<br /><input className="muse-input" type="date" value={rangeForm.endDate} onChange={(e) => e.target.value && setRangeForm({ ...rangeForm, endDate: e.target.value })} /></label>
            <button type="button" className="muse-btn primary" disabled={pending || rangeForm.endDate < rangeForm.startDate} onClick={() => run(() => createSiteCalendarRange({ customerSiteId: s.id, kind: rangeForm.kind, label: rangeForm.label || null, startDate: rangeForm.startDate, endDate: rangeForm.endDate }), `Added a ${rangeForm.kind} to ${s.name}.`)}>Save</button>
            <button type="button" className="muse-btn" disabled={pending} onClick={() => setRangeForm(null)}>Cancel</button>
          </div>
        )}
      </div>
    );
  }

  function renderServices(c: CustomerDef, s: CustomerSiteDef, r: ResolvedSiteForecast | undefined, included: boolean) {
    return (
      <div className="muse-scroll-x mt-[0.4rem]!">
        <table className="muse-table">
          <thead>
            <tr>
              <th>Service</th><th>Runs on</th><th className="num">Meals / service at {forecast.startDate}</th><th>Volume changes</th><th className="num">Service dates, year</th><th className="num">Meals, year</th><th />
            </tr>
          </thead>
          <tbody>
            {s.services.map((sv) => {
              const rs = r?.services.find((x) => x.id === sv.id);
              const picks = rs ? forecastPicks(rs) : normalizePicks(sv.picks);
              const shownPicks = mode === 'record' ? normalizePicks(sv.picks) : picks;
              const recordPicks = new Map(sv.picks.map((p) => [p.effectiveDate, p]));
              const weekdays = mode === 'record' ? sv.weekdays : rs?.weekdays ?? sv.weekdays;
              const overlay = forecast.services?.[sv.id];
              return (
                <Fragment key={sv.id}>
                  <tr>
                    <td>
                      {sv.name}
                      <div className="muse-c-faint muse-fs-xs">{sv.status}{mode === 'forecast' && rs?.edited ? ' · edited in this forecast' : ''}</div>
                    </td>
                    <td>
                      {mode === 'forecast' && included ? (
                        <span className="inline-flex gap-[0.35rem] flex-wrap">
                          {WEEKDAY_LABELS.map((w, i) => (
                            <label key={w} className="inline-flex! gap-[0.15rem]! items-center! muse-fs-xs">
                              <input type="checkbox" checked={weekdays.includes(i)} onChange={(e) => { const next = e.target.checked ? [...weekdays, i].sort() : weekdays.filter((x) => x !== i); setForecastWeekdays(sv.id, JSON.stringify(next) === JSON.stringify([...sv.weekdays].sort()) ? undefined : next); }} />{w}
                            </label>
                          ))}
                        </span>
                      ) : (
                        weekdayText(weekdays)
                      )}
                    </td>
                    <td className="num">{num(volumeOn(shownPicks, forecast.startDate))}</td>
                    <td>
                      {shownPicks.length === 0 && <span className="muse-kpi-sub">none — no volume</span>}
                      {shownPicks.map((p) => {
                        const rec = recordPicks.get(p.effectiveDate);
                        return (
                          <div key={p.effectiveDate} className="muse-fs-sm">
                            from {p.effectiveDate}: {num(p.meals)}
                            {recordMode && rec && <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]! ml-[0.35rem]!" disabled={pending} onClick={() => run(() => deleteVolumePick({ id: rec.id }), `Removed the change from ${p.effectiveDate}.`)}>×</button>}
                            {mode === 'forecast' && included && <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]! ml-[0.35rem]!" onClick={() => setForecastPicks(sv.id, shownPicks.filter((x) => x.effectiveDate !== p.effectiveDate))}>×</button>}
                          </div>
                        );
                      })}
                    </td>
                    <td className="num">{mode === 'forecast' || !overlay ? num(rs?.serviceDates ?? 0) : '—'}</td>
                    <td className="num">{mode === 'forecast' || !overlay ? num(Math.round(rs?.annualMeals ?? 0)) : '—'}</td>
                    <td className="num">
                      <span className="inline-flex gap-[0.3rem]">
                        {(recordMode || (mode === 'forecast' && included)) && (
                          <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" disabled={pending} onClick={() => setPickForm({ serviceId: sv.id, effectiveDate: forecast.startDate, meals: '' })}>Change volume</button>
                        )}
                        {mode === 'forecast' && overlay && (
                          <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => setForecast((d) => { if (d.services) delete d.services[sv.id]; })}>Use the record</button>
                        )}
                        {canEdit && (
                          <>
                            <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" disabled={pending} onClick={() => setServiceForm({ mode: 'edit', siteId: s.id, id: sv.id, form: { name: sv.name, weekdays: sv.weekdays, status: sv.status, notes: sv.notes ?? '' } })}>Edit</button>
                            <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" disabled={pending} onClick={() => run(() => deleteCustomerService({ id: sv.id }), `Removed service ${sv.name}.`)}>×</button>
                          </>
                        )}
                      </span>
                    </td>
                  </tr>
                  {pickForm?.serviceId === sv.id && (
                    <tr>
                      <td colSpan={7}>
                        <div className="flex flex-wrap gap-3 items-end">
                          <label className="muse-kpi-sub">From<br /><input className="muse-input" type="date" value={pickForm.effectiveDate} onChange={(e) => e.target.value && setPickForm({ ...pickForm, effectiveDate: e.target.value })} /></label>
                          <label className="muse-kpi-sub">Meals per service<br /><input className="muse-input w-26!" type="number" min={0} value={pickForm.meals} onChange={(e) => setPickForm({ ...pickForm, meals: e.target.value === '' ? '' : Math.max(0, Number(e.target.value)) })} /></label>
                          <button type="button" className="muse-btn primary" disabled={pending || pickForm.meals === ''} onClick={submitPick}>Save</button>
                          <button type="button" className="muse-btn" disabled={pending} onClick={() => setPickForm(null)}>Cancel</button>
                          <span className="muse-kpi-sub">The volume carries forward from this date until the next change{recordMode ? '' : '. Written to this forecast only'}.</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {s.services.length === 0 && <tr><td colSpan={7} className="muse-kpi-sub">No services. The site generates no orders until one is added.</td></tr>}
            {serviceForm?.siteId === s.id && (
              <tr>
                <td colSpan={7}>
                  <div className="flex flex-wrap gap-3 items-end">
                    <label className="muse-kpi-sub">Service name<br /><input className="muse-input w-56!" value={serviceForm.form.name} onChange={(e) => setServiceForm({ ...serviceForm, form: { ...serviceForm.form, name: e.target.value } })} /></label>
                    <div className="muse-kpi-sub">Runs on<br />
                      <span className="inline-flex gap-2 mt-[0.2rem]!">
                        {WEEKDAY_LABELS.map((w, i) => (
                          <label key={w} className="inline-flex! gap-[0.2rem]! items-center!">
                            <input type="checkbox" checked={serviceForm.form.weekdays.includes(i)} onChange={(e) => setServiceForm({ ...serviceForm, form: { ...serviceForm.form, weekdays: e.target.checked ? [...serviceForm.form.weekdays, i].sort() : serviceForm.form.weekdays.filter((x) => x !== i) } })} />{w}
                          </label>
                        ))}
                      </span>
                    </div>
                    <label className="muse-kpi-sub">Status<br />
                      <select className="muse-select" value={serviceForm.form.status} onChange={(e) => setServiceForm({ ...serviceForm, form: { ...serviceForm.form, status: e.target.value as 'active' | 'inactive' } })}>
                        <option value="active">active</option><option value="inactive">inactive</option>
                      </select>
                    </label>
                    <label className="muse-kpi-sub flex-1! min-w-48!">Notes<br /><input className="muse-input w-full!" value={serviceForm.form.notes} onChange={(e) => setServiceForm({ ...serviceForm, form: { ...serviceForm.form, notes: e.target.value } })} /></label>
                    <button type="button" className="muse-btn primary" disabled={pending || !serviceForm.form.name.trim() || serviceForm.form.weekdays.length === 0} onClick={submitService}>Save</button>
                    <button type="button" className="muse-btn" disabled={pending} onClick={() => setServiceForm(null)}>Cancel</button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {canEdit && <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]! mt-[0.3rem]!" disabled={pending} onClick={() => setServiceForm({ mode: 'create', siteId: s.id, form: { name: '', weekdays: [1, 2, 3, 4, 5], status: 'active', notes: '' } })}>Add service</button>}
        <span className="muse-kpi-sub ml-[0.6rem]!">
          {r ? `${num(r.serviceDates)} service dates · ${num(Math.round(r.annualMeals))} meals in the year from ${forecast.startDate}` : 'Not in this forecast'} · actual to date {num(Math.round(actualFor(s)))}
        </span>
      </div>
    );
  }

  return (
    <>
      {msg && <div className={`muse-scenariobar-msg ${msg.kind} mt-4`} role="status">{msg.text}</div>}

      <Card title="Editing" className="mt-4">
        <div className="flex flex-wrap gap-4 items-end">
          <span className="muse-kpi-sub">{mode === 'forecast' ? 'Plan: volume and meal-plan edits go to the open forecast.' : 'Actual: volume and meal-plan edits go to the customer record.'} Switch with Plan / Actual in the forecast bar. Customers, sites, services and calendars are the master list in both.</span>
          {mode === 'forecast' && (
            <label className="muse-kpi-sub">Forecast starts<br />
              <input className="muse-input" type="date" value={forecast.startDate} onChange={(e) => e.target.value && setForecast((d) => { d.startDate = e.target.value; })} />
            </label>
          )}
          {mode === 'forecast' && (
            <label className="muse-kpi-sub">Timeline runs<br />
              <select className="muse-select" value={forecast.horizonYears} onChange={(e) => setForecast((d) => { d.horizonYears = Number(e.target.value) as ForecastHorizonYears; })}>
                {FORECAST_HORIZON_OPTIONS.map((y) => <option key={y} value={y}>{y} year{y === 1 ? '' : 's'} from the start</option>)}
              </select>
            </label>
          )}
        </div>
        <p className="muse-kpi-sub mt-2">
          {mode === 'record'
            ? 'Changes here are facts of record: the customer, its sites, their services and dated volume, each site’s calendar and the customer’s meal plan. Real operations run on them.'
            : 'Changes here stay in the open forecast: which customers it includes, service volume and weekdays, and its own copy of a meal plan. The record does not move; anything not edited here follows it.'}
        </p>
        <SectionSave sections={['forecast']} title="the forecast's customers" />
      </Card>

      <div className="grid gap-3 mt-4 muse-autofit-11">
        {byChannel.map((c) => {
          const meals = Math.round(c.row?.annualMeals ?? 0);
          const contracted = Math.round(c.row?.contractedAnnualMeals ?? 0);
          return (
            <Kpi
              key={c.phase}
              value={num(meals)}
              label={`${c.market}, meals in the year`}
              sub={`${num(Math.round(c.row?.mealsPerDay ?? 0))} per service date · ${c.row?.customers ?? 0} customer${(c.row?.customers ?? 0) === 1 ? '' : 's'}, ${c.row?.sites.length ?? 0} site${(c.row?.sites.length ?? 0) === 1 ? '' : 's'} · ${num(contracted)} contracted, ${num(meals - contracted)} planned`}
            />
          );
        })}
        <Kpi
          value={num(Math.round(demand.totalAnnualMeals))}
          label="Meals in the year, all channels"
          sub={`${demand.window.from} to ${demand.window.to} · ${num(Math.round(demand.contractedAnnualMeals))} contracted · what the allocation sliders act on`}
        />
      </div>

      {byChannel.map((ch) => {
        const customers = resolved.customers.filter((c) => c.channel === ch.phase);
        return (
          <Card key={ch.phase} title={ch.market} className="mt-4">
            {customers.length === 0 && <p className="muse-kpi-sub">No customers on this channel.</p>}
            {customers.map((c) => {
              const included = c.status !== 'inactive' && forecast.customers?.[c.id]?.included !== false;
              return (
                <div key={c.id} className={`mb-6! ${(mode === 'forecast' && !included ? 'opacity-[0.6]' : 'opacity-[1]')}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <span className="font-semibold">{c.name}</span>
                      <span className="ml-2!"><RatingPill rating={c.erra ?? NOT_RATED} /></span>
                      {canEdit && (
                        <select
                          className="muse-select ml-[0.4rem]! muse-fs-xs py-[0.05rem]! px-[0.3rem]!"
                          aria-label={`${MARK.label} rating Muse Kitchen assigns ${c.name}`}
                          value={c.erra?.status === 'rated' ? String(c.erra.stars) : c.erra?.status ?? 'not_rated'}
                          disabled={pending}
                          onChange={(e) => {
                            const v = e.target.value;
                            const stars = v === '1' || v === '2' || v === '3' ? (Number(v) as 1 | 2 | 3) : null;
                            run(() => setCustomerRating({ id: c.id, status: stars ? 'rated' : v, stars, ratedOn: v === 'not_rated' ? null : today }), `${c.name}: ${MARK.label} rating set.`);
                          }}
                        >
                          <option value="not_rated">Not yet rated</option>
                          <option value="in_review">In review</option>
                          <option value="1">1 star</option>
                          <option value="2">2 stars</option>
                          <option value="3">3 stars</option>
                        </select>
                      )}
                      <span className="muse-kpi-sub ml-[0.6rem]!">
                        {CUSTOMER_KIND_LABELS[c.kind]} · {CUSTOMER_STATUS_LABELS[c.status]} ·{' '}
                        {c.pricePerMealCents === null ? `channel price ${money(ch.price)}` : `${money(c.pricePerMealCents / 100)} contracted`}
                        {' · '}{c.paymentTerms ? PAYMENT_TERMS_LABELS[c.paymentTerms] : 'no payment terms on file'}
                        {c.contractStart ? ` · ${c.contractStart}${c.contractEnd ? ` to ${c.contractEnd}` : ''}` : ''}
                      </span>
                      {statusBadge(c)}
                    </div>
                    <div className="flex gap-[0.4rem] items-center">
                      {mode === 'forecast' && c.status !== 'inactive' && (
                        <label className="muse-kpi-sub inline-flex! gap-1! items-center!">
                          <input type="checkbox" checked={included} onChange={(e) => setIncluded(c.id, e.target.checked)} />In this forecast
                        </label>
                      )}
                      {canEdit && (
                        <>
                          <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => setSiteForm({ mode: 'create', customerId: c.id, form: emptySite() })} disabled={pending}>Add site</button>
                          <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => openEditCustomer(c)} disabled={pending}>Edit</button>
                          <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => run(() => deleteCustomer({ id: c.id }), `Removed ${c.name}.`)} disabled={pending}>Remove</button>
                        </>
                      )}
                    </div>
                  </div>
                  {c.notes && <p className="muse-kpi-sub mt-[0.2rem]!">{c.notes}</p>}
                  {c.sites.map((s) => {
                    const r = siteById.get(s.id);
                    const part = siteParticipation(s.id, s.enrollment, orders);
                    return (
                      <div key={s.id} className="mt-[0.6rem]! pl-[0.6rem] border-l-2 border-l-[color:var(--muse-line,#ddd)]">
                        <div className="muse-kpi-sub">
                          <span className="muse-c-ink font-semibold">{s.name}</span>
                          {' · '}{s.status}{s.gradeGroups.length ? ` · grades ${s.gradeGroups.join(', ')}` : ''}{s.siteId ? ` · delivery site ${s.siteId}` : ''}
                          {' · '}enrollment {s.enrollment === null ? 'not entered' : num(s.enrollment)}
                          {' · '}participation{' '}
                          {part.participation !== null
                            ? `${pct(part.participation)} (${num(Math.round(part.mealsPerService ?? 0))} meals per service over ${num(part.services)} confirmed or delivered service${part.services === 1 ? '' : 's'})`
                            : part.services === 0
                              ? 'no confirmed or delivered orders yet'
                              : `${num(Math.round(part.mealsPerService ?? 0))} meals per service — enter enrollment to calculate`}
                          {canEdit && (
                            <span className="inline-flex gap-[0.3rem] ml-[0.6rem]!">
                              <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" disabled={pending} onClick={() => setSiteForm({ mode: 'edit', customerId: c.id, id: s.id, form: { name: s.name, siteId: s.siteId ?? '', gradeGroups: s.gradeGroups, enrollment: s.enrollment ?? '', status: s.status, notes: s.notes ?? '' } })}>Edit site</button>
                              <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" disabled={pending} onClick={() => run(() => deleteCustomerSite({ id: s.id }), `Removed site ${s.name}.`)}>×</button>
                            </span>
                          )}
                        </div>
                        {renderCalendar(s, r)}
                        {renderServices(c, s, r, included)}
                      </div>
                    );
                  })}
                  {c.sites.length === 0 && <p className="muse-kpi-sub">No sites. This customer adds no demand until a site is added.</p>}
                  {renderPlans(c, included)}
                </div>
              );
            })}
            {canEdit && (
              <button type="button" className="muse-btn" onClick={() => setCustomerForm({ mode: 'create', form: emptyCustomer(ch.phase) })} disabled={pending}>Add customer on {ch.market}</button>
            )}
          </Card>
        );
      })}

      {customerForm && (
        <Card title={customerForm.mode === 'edit' ? 'Edit customer' : 'Add customer'} className="mt-4">
          <div className="flex flex-wrap gap-3 items-end">
            <label className="muse-kpi-sub">Name<br /><input className="muse-input w-56!" value={customerForm.form.name} onChange={(e) => setCustomerForm({ ...customerForm, form: { ...customerForm.form, name: e.target.value } })} /></label>
            <label className="muse-kpi-sub">Kind<br />
              <select className="muse-select" value={customerForm.form.kind} onChange={(e) => setCustomerForm({ ...customerForm, form: { ...customerForm.form, kind: e.target.value as CustomerKind } })}>
                {(Object.keys(CUSTOMER_KIND_LABELS) as CustomerKind[]).map((k) => <option key={k} value={k}>{CUSTOMER_KIND_LABELS[k]}</option>)}
              </select>
            </label>
            <label className="muse-kpi-sub">Channel<br />
              <select className="muse-select" value={customerForm.form.channel} onChange={(e) => setCustomerForm({ ...customerForm, form: { ...customerForm.form, channel: Number(e.target.value) } })}>
                {byChannel.map((c) => <option key={c.phase} value={c.phase}>{c.market}</option>)}
              </select>
            </label>
            <label className="muse-kpi-sub">Status<br />
              <select className="muse-select" value={customerForm.form.status} onChange={(e) => setCustomerForm({ ...customerForm, form: { ...customerForm.form, status: e.target.value as CustomerStatus } })}>
                {(Object.keys(CUSTOMER_STATUS_LABELS) as CustomerStatus[]).map((k) => <option key={k} value={k}>{CUSTOMER_STATUS_LABELS[k]}</option>)}
              </select>
            </label>
            <label className="muse-kpi-sub">Price / meal $ (blank = channel)<br /><input className="muse-input w-26!" type="number" min={0} step={0.01} value={customerForm.form.pricePerMeal} onChange={(e) => setCustomerForm({ ...customerForm, form: { ...customerForm.form, pricePerMeal: e.target.value === '' ? '' : Number(e.target.value) } })} /></label>
            <label className="muse-kpi-sub">Payment terms<br />
              <select className="muse-select" value={customerForm.form.paymentTerms} onChange={(e) => setCustomerForm({ ...customerForm, form: { ...customerForm.form, paymentTerms: e.target.value as CustomerPaymentTerms | '' } })}>
                <option value="">No terms on file</option>
                {CUSTOMER_PAYMENT_TERMS.map((t) => <option key={t} value={t}>{PAYMENT_TERMS_LABELS[t]}</option>)}
              </select>
            </label>
            <label className="muse-kpi-sub">Contract start<br /><input className="muse-input" type="date" value={customerForm.form.contractStart} onChange={(e) => setCustomerForm({ ...customerForm, form: { ...customerForm.form, contractStart: e.target.value } })} /></label>
            <label className="muse-kpi-sub">Contract end<br /><input className="muse-input" type="date" value={customerForm.form.contractEnd} onChange={(e) => setCustomerForm({ ...customerForm, form: { ...customerForm.form, contractEnd: e.target.value } })} /></label>
            <label className="muse-kpi-sub flex-1! min-w-56!">Notes<br /><input className="muse-input w-full!" value={customerForm.form.notes} onChange={(e) => setCustomerForm({ ...customerForm, form: { ...customerForm.form, notes: e.target.value } })} /></label>
            <button type="button" className="muse-btn primary" onClick={submitCustomer} disabled={pending || !customerForm.form.name.trim()}>Save</button>
            <button type="button" className="muse-btn" onClick={() => setCustomerForm(null)} disabled={pending}>Cancel</button>
          </div>
          <p className="muse-kpi-sub mt-2">
            A Forecast Customer carries figures entered for planning, is used in forecasts and is never on Actual: no stored order or delivery is recorded against it.
          </p>
        </Card>
      )}

      {siteForm && (
        <Card title={siteForm.mode === 'edit' ? 'Edit site' : 'Add site'} className="mt-4">
          <div className="flex flex-wrap gap-3 items-end">
            <label className="muse-kpi-sub">Site name<br /><input className="muse-input w-56!" value={siteForm.form.name} onChange={(e) => setSiteForm({ ...siteForm, form: { ...siteForm.form, name: e.target.value } })} /></label>
            <label className="muse-kpi-sub">Delivery site<br />
              <select className="muse-select" value={siteForm.form.siteId} onChange={(e) => { const ds = deliverySites.find((d) => d.id === e.target.value); setSiteForm({ ...siteForm, form: { ...siteForm.form, siteId: e.target.value, name: siteForm.form.name || ds?.name || '' } }); }}>
                <option value="">Not linked</option>
                {deliverySites.map((d) => <option key={d.id} value={d.id}>{d.id} — {d.name}</option>)}
              </select>
            </label>
            <div className="muse-kpi-sub">Grade groups<br />
              <span className="inline-flex gap-[0.6rem] mt-[0.2rem]!">
                {['K-5', '6-8', '9-12'].map((g) => (
                  <label key={g} className="inline-flex! gap-1! items-center!">
                    <input type="checkbox" checked={siteForm.form.gradeGroups.includes(g)} onChange={(e) => setSiteForm({ ...siteForm, form: { ...siteForm.form, gradeGroups: e.target.checked ? [...siteForm.form.gradeGroups, g] : siteForm.form.gradeGroups.filter((x) => x !== g) } })} />{g}
                  </label>
                ))}
              </span>
            </div>
            <label className="muse-kpi-sub">Enrollment<br /><input className="muse-input w-26!" type="number" min={0} value={siteForm.form.enrollment} onChange={(e) => setSiteForm({ ...siteForm, form: { ...siteForm.form, enrollment: e.target.value === '' ? '' : Math.max(0, Math.round(Number(e.target.value))) } })} /></label>
            <label className="muse-kpi-sub">Status<br />
              <select className="muse-select" value={siteForm.form.status} onChange={(e) => setSiteForm({ ...siteForm, form: { ...siteForm.form, status: e.target.value as CustomerSiteStatus } })}>
                {(['active', 'planned', 'inactive'] as CustomerSiteStatus[]).map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
            <label className="muse-kpi-sub flex-1! min-w-56!">Notes<br /><input className="muse-input w-full!" value={siteForm.form.notes} onChange={(e) => setSiteForm({ ...siteForm, form: { ...siteForm.form, notes: e.target.value } })} /></label>
            <button type="button" className="muse-btn primary" onClick={submitSite} disabled={pending || !siteForm.form.name.trim()}>Save</button>
            <button type="button" className="muse-btn" onClick={() => setSiteForm(null)} disabled={pending}>Cancel</button>
          </div>
          <p className="muse-kpi-sub mt-2">
            Enrollment is entered when a school account is set up. Participation is calculated from it: the meals per service on
            confirmed and delivered orders, against enrollment. It is a sales figure; demand runs on meals per service.
            {siteForm.mode === 'create' ? ' A new site starts with one service and no volume. Enter its service calendar, its services’ weekdays and meals per service after saving.' : ''}
          </p>
        </Card>
      )}

      <p className="muse-kpi-sub mt-4">
        Demand on <Link className="muse-link" href="/muse/financials/pnl">P&amp;L</Link> and{' '}
        <Link className="muse-link" href="/muse/production-planning">Production Planning</Link> is the meals per service on every date each service runs.
        Saved menu cycles are on <Link className="muse-link" href="/muse/orders">Orders</Link>. Actual meals to date come from delivery records on{' '}
        <Link className="muse-link" href="/muse/actuals">Actuals</Link>.
      </p>
    </>
  );
}
