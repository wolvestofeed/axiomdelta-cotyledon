'use client';

import { useMemo, useState } from 'react';
import { PageHeader, Card, Notice, StatusBadge, money, num } from '@/app/(muse)/muse/_components/ui';
import { EntityPicker } from '@/app/(muse)/muse/_components/EntityPicker';
import { useLinkedEntity } from '@/app/(muse)/muse/_components/useLinkedEntities';
import { entityRef } from '@/app/(muse)/muse/_engine/entity-links';
import { parentPlanProducts } from '@/app/(muse)/muse/_data/parent-portal';
import {
  type MealPlan,
  type Cadence,
  type ParentAccount,
  PLAN_LABEL,
  mealsPerDay,
  mealsPerWeek,
  weeklyCost,
  monthlyCost,
} from '@/app/(muse)/muse/_engine/parent-portal';

const WEEKS_PER_MONTH = 4.33;

// The common major allergens parents flag. A free-text note covers anything
// else (sensitivities, intolerances, preferences).
const ALLERGENS = [
  'Milk',
  'Egg',
  'Wheat / gluten',
  'Soy',
  'Peanut',
  'Tree nut',
  'Fish',
  'Shellfish',
  'Sesame',
] as const;

export function EnrollClient({ pricePerMeal }: { pricePerMeal: number }) {

  const [plan, setPlan] = useState<MealPlan>('lunch');
  // The school is picked from the same directory Sales and Sites & Delivery use,
  // so an enrolment names a real record rather than typed-in text.
  const [schoolId, setSchoolId] = useState<string | undefined>(undefined);
  const school = useLinkedEntity(schoolId ? entityRef('school', schoolId) : undefined);
  const [kids, setKids] = useState(1);
  const [daysPerWeek, setDaysPerWeek] = useState(5);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [foodNotes, setFoodNotes] = useState('');
  const [selected, setSelected] = useState<Cadence | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const toggleAllergen = (a: string) =>
    setAllergies((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));

  const pseudo: ParentAccount = useMemo(
    () => ({
      id: 'preview',
      schoolId: schoolId ?? '',
      guardian: '',
      kids,
      plan,
      daysPerWeek,
      cadence: 'per-month',
      status: 'active',
      since: '',
    }),
    [kids, plan, daysPerWeek, schoolId],
  );

  const mpw = mealsPerWeek(pseudo);
  const weekly = weeklyCost(pseudo, pricePerMeal);
  const monthly = monthlyCost(pseudo, pricePerMeal);
  const perDay = mealsPerDay(plan) * kids * pricePerMeal;
  const mealsPerMonth = Math.round(mpw * WEEKS_PER_MONTH);

  function priceFor(cadence: Cadence): { big: string; sub: string } {
    switch (cadence) {
      case 'per-meal':
        return { big: `${money(pricePerMeal)} / meal`, sub: `≈ ${money(perDay)} per day for ${kids} child${kids === 1 ? '' : 'ren'}` };
      case 'per-week':
        return { big: `${money(weekly)} / week`, sub: `${num(mpw)} meals per week` };
      case 'per-month':
        return { big: `${money(monthly)} / month`, sub: `≈ ${num(mealsPerMonth)} meals per month` };
    }
  }

  const selectedProduct = parentPlanProducts.find((p) => p.cadence === selected) ?? null;

  return (
    <>
      <PageHeader
        title="Parent Portal"
        purpose="Choose how to pay for your child's school meals."
        status="designed"
      />

      <Notice title="Preview — placeholder pricing">
        This is a display of the parent signup flow. Prices are illustrative (computed from the plan&apos;s
        per-meal basis) and no payment is connected yet. Product names and prices are placeholders.
      </Notice>

      <Card title="Your child's school" className="mt-4">
        <EntityPicker
          kinds={['school']}
          linked={school}
          canEdit
          label="school"
          ariaLabel="Search for your child's school"
          placeholder="Search school name or ZIP…"
          onLink={setSchoolId}
        />
        <p className="muse-kpi-sub mt-2">
          Meals are delivered to the school, so the plan starts with the school. The list is the
          kitchen&apos;s school directory; a school that is not listed yet is not being served.
        </p>
      </Card>

      <Card title="Your options" className="mt-4">
        <div className="grid gap-5 muse-autofit-14">
          <div>
            <div className="muse-kpi-label mb-[0.4rem]!">Meals</div>
            <div className="flex gap-2 flex-wrap">
              {(['lunch', 'breakfast-lunch'] as MealPlan[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`muse-btn${plan === m ? ' primary' : ''}`}
                  onClick={() => setPlan(m)}
                >
                  {PLAN_LABEL[m]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="muse-kpi-label" htmlFor="kids">Children</label>
            <input id="kids" type="number" min={1} max={10} value={kids} onChange={(e) => setKids(Math.max(1, Number(e.target.value) || 1))} className="muse-num-input block! mt-[0.4rem]! w-24!" />
          </div>
          <div>
            <label className="muse-kpi-label" htmlFor="days">Days per week</label>
            <input id="days" type="number" min={1} max={5} value={daysPerWeek} onChange={(e) => setDaysPerWeek(Math.min(5, Math.max(1, Number(e.target.value) || 1)))} className="muse-num-input block! mt-[0.4rem]! w-24!" />
            <div className="muse-kpi-sub mt-1!">Applies to the weekly and monthly plans.</div>
          </div>
        </div>
      </Card>

      <Card title="Allergies & food notes" className="mt-4">
        <div className="muse-kpi-label mb-2!">
          Check any allergens to avoid for your child
        </div>
        <div className="flex flex-wrap gap-y-[0.4rem] gap-x-5">
          {ALLERGENS.map((a) => (
            <label key={a} className="inline-flex! items-center! gap-[0.4rem]! muse-fs-base muse-c-ink">
              <input
                type="checkbox"
                checked={allergies.includes(a)}
                onChange={() => toggleAllergen(a)}
                className="[accent-color:var(--muse-forest)]!"
              />
              {a}
            </label>
          ))}
        </div>
        <div className="mt-4!">
          <label className="muse-kpi-label" htmlFor="foodnotes">
            Food notes — sensitivities, intolerances, or preferences
          </label>
          <textarea
            id="foodnotes"
            value={foodNotes}
            onChange={(e) => setFoodNotes(e.target.value)}
            rows={3}
            placeholder="e.g. lactose sensitivity, no pork, prefers milder spice"
            className="block! w-full! mt-[0.4rem]! py-2! px-[0.6rem]! border! border-[color:var(--muse-line)]! rounded-[0.4rem]! font-[inherit]! muse-fs-base muse-c-ink bg-[color:var(--muse-surface)]! [resize:vertical]!"
          />
        </div>
        <p className="muse-kpi-sub mt-2">
          Allergen information is passed to the kitchen with the order. The base bowl is free of peanut,
          tree nut, wheat, egg, soy, fish, shellfish, and sesame; cheese is packed separately.
        </p>
      </Card>

      <div className="grid gap-4 mt-4 muse-autofit-16">
        {parentPlanProducts.map((product) => {
          const price = priceFor(product.cadence);
          const isSelected = selected === product.cadence;
          return (
            <div
              key={product.id}
              className={`muse-card border! ${isSelected ? 'border-[color:var(--muse-forest)]! shadow-[0_0_0_2px_var(--muse-accent-soft)]!' : 'border-[color:var(--muse-line)]!'}`}
            >
              <div className="flex items-center justify-between gap-2!">
                <div className="muse-card-title m-0!">{product.name}</div>
                <StatusBadge status="PLACEHOLDER" title="Placeholder product — not yet a real Stripe price" />
              </div>
              <div className="muse-fs-xl font-semibold muse-c-ink mt-[0.6rem]! [font-variant-numeric:lining-nums_tabular-nums]">
                {price.big}
              </div>
              <div className="muse-kpi-sub mt-[0.15rem]!">{price.sub}</div>
              <p className="muse-fs-sm muse-c-soft mt-3! mr-0! mb-4! ml-0! leading-[1.45]">{product.blurb}</p>
              <button
                type="button"
                className={`muse-btn${isSelected ? ' primary' : ''} w-full!`}
                onClick={() => {
                  setSelected(product.cadence);
                  setNote(null);
                }}
              >
                {isSelected ? 'Selected' : 'Choose this plan'}
              </button>
            </div>
          );
        })}
      </div>

      {selectedProduct && (
        <Card title="Review & continue" className="mt-4">
          <table className="muse-table">
            <tbody>
              <tr><td>School</td><td className="num">{school ? school.name : 'Not selected'}</td></tr>
              <tr><td>Plan</td><td className="num">{selectedProduct.name}</td></tr>
              <tr><td>Meals</td><td className="num">{PLAN_LABEL[plan]}</td></tr>
              <tr><td>Children</td><td className="num">{num(kids)}</td></tr>
              <tr><td>Days per week</td><td className="num">{num(daysPerWeek)}</td></tr>
              <tr><td>Allergens to avoid</td><td className="num">{allergies.length > 0 ? allergies.join(', ') : 'None selected'}</td></tr>
              {foodNotes.trim() && (
                <tr><td>Food notes</td><td className="num max-w-88! whitespace-normal!">{foodNotes.trim()}</td></tr>
              )}
              <tr className="total"><td>Price</td><td className="num">{priceFor(selectedProduct.cadence).big}</td></tr>
            </tbody>
          </table>
          <div className="mt-4! flex gap-2 items-center flex-wrap">
            <button
              type="button"
              className="muse-btn primary"
              disabled={!school}
              onClick={() => setNote(`Payment isn't connected in this preview. This is where checkout for the ${selectedProduct.name} at ${school?.name ?? 'the selected school'} would open.`)}
            >
              Continue to payment
            </button>
            <span className="muse-kpi-sub">
              {school ? 'Secure checkout — not connected in this preview.' : 'Choose your school above to continue.'}
            </span>
          </div>
          {note && (
            <div className="muse-section-save-msg ok mt-[0.6rem]!" role="status">
              {note}
            </div>
          )}
        </Card>
      )}

    </>
  );
}
