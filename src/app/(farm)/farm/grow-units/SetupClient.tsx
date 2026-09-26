'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card, Kpi, StatusBadge, num } from '@/components/ui';
import { EditableNumber } from '@/components/EditableNumber';
import { PageControls } from '@/components/PageControls';
import { EQUIPMENT_SETTINGS, EQUIPMENT_SETTING_LABELS, type EquipmentSetting } from '@/data/capex';
import { LIGHT_FIXTURES } from '@/data/inputs-catalog';
import { traysPerUnit } from '@/engine/grow-capacity';
import { updateEquipment } from '@/server/equipment-actions';
import { useScenario } from '@/state/scenario-store';
import { EquipmentClient } from '@/app/(farm)/farm/grow-units/EquipmentClient';
import { BuildOutCard } from '@/components/setup/BuildOutCard';
import { LoansCard } from '@/components/setup/LoansCard';
import { FixedCostsCard } from '@/components/setup/FixedCostsCard';

/**
 * The farm set up two ways. Home: the grow racks, the home equipment list and the home running
 * costs. Commercial: a rented facility's size, its equipment, build-out, loans and the rent,
 * utilities and business costs. Both feed the same forecast; commercial fields count only once
 * a forecast fills them in.
 */
export function SetupClient({ canEdit }: { canEdit: boolean }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const setting: EquipmentSetting = params.get('setting') === 'commercial' ? 'commercial' : 'home';
  const setSetting = useCallback(
    (s: EquipmentSetting) => {
      const next = new URLSearchParams(params.toString());
      next.set('setting', s);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, router, pathname],
  );
  return (
    <>
      <PageControls group="view">
        {EQUIPMENT_SETTINGS.map((s) => (
          <button key={s} type="button" className={`farm-btn${setting === s ? ' primary' : ' ghost'}`} aria-pressed={setting === s} onClick={() => setSetting(s)}>{EQUIPMENT_SETTING_LABELS[s]}</button>
        ))}
      </PageControls>
      {setting === 'home' ? (
        <>
          <RacksCard canEdit={canEdit} />
          <div className="mt-4"><EquipmentClient canEdit={canEdit} setting="home" /></div>
          <FixedCostsCard setting="home" title="Home running costs" className="mt-4" />
        </>
      ) : (
        <>
          <FacilityCard />
          <div className="mt-4"><EquipmentClient canEdit={canEdit} setting="commercial" /></div>
          <BuildOutCard className="mt-4" />
          <LoansCard className="mt-4" />
          <FixedCostsCard setting="commercial" title="Rent, utilities and business costs" className="mt-4" />
        </>
      )}
    </>
  );
}

/** The home grow room's racks: 24x48 wire shelving with a 4-ft LED fixture a tier, and the trays they hold. */
function RacksCard({ canEdit }: { canEdit: boolean }) {
  const { resolved } = useScenario();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const racks = useMemo(() => {
    const home = new Set(resolved.equipment.filter((l) => l.setting === 'home').map((l) => l.key));
    return (resolved.capacityInputs.growUnits ?? []).filter((u) => home.has(u.key));
  }, [resolved.equipment, resolved.capacityInputs.growUnits]);
  const rowOf = (key: string) => resolved.equipment.find((l) => l.key === key);
  const save = (key: string, patch: { qty?: number; shelves?: number }) => {
    const id = rowOf(key)?.id;
    if (!id || !canEdit) return;
    start(async () => {
      const r = await updateEquipment({ id, ...patch });
      if (!r.ok) setError(r.error);
      else {
        setError(null);
        router.refresh();
      }
    });
  };
  const trays = racks.reduce((s, u) => s + traysPerUnit(u, 'flat-1020') * u.units, 0);
  const tiers = racks.reduce((s, u) => s + u.shelves * u.units, 0);
  return (
    <>
      <div className="grid gap-3 farm-autofit-11">
        <Kpi value={num(racks.reduce((s, u) => s + u.units, 0))} label="Racks" sub="Grow units on the home list" />
        <Kpi value={num(tiers)} label="Lit tiers" sub="One 4-ft LED fixture a tier" />
        <Kpi value={num(trays)} label="1020 flats at once" sub="Four a 48-inch tier" />
      </div>
      <Card title="Grow racks" className="mt-4">
        {racks.length === 0 ? (
          <p className="farm-kpi-sub">No rack is on the home list. A row with shelves, a shelf width and a fixture is a rack; enter them on the home equipment below.</p>
        ) : (
          <div className="farm-scroll-x">
            <table className="farm-table">
              <thead><tr><th>Rack</th><th className="num">Racks</th><th className="num">Lit tiers a rack</th><th className="num">Shelf width, in</th><th>Fixture</th><th className="num">1020 flats a rack</th><th className="num">1020 flats in all</th></tr></thead>
              <tbody>
                {racks.map((u) => (
                  <tr key={u.key}>
                    <td>{u.item}</td>
                    <td className="num">{canEdit ? <EditableNumber value={u.units} onChange={(v) => save(u.key, { qty: Math.max(0, Math.round(v)) })} step={1} min={0} ariaLabel={`${u.item} racks`} showBadge={false} /> : num(u.units)}</td>
                    <td className="num">{canEdit ? <EditableNumber value={u.shelves} onChange={(v) => save(u.key, { shelves: Math.max(0, Math.round(v)) })} step={1} min={0} ariaLabel={`${u.item} lit tiers`} showBadge={false} /> : num(u.shelves)}</td>
                    <td className="num">{num(u.shelfWidthIn)}</td>
                    <td>{LIGHT_FIXTURES.find((f) => f.key === u.fixtureKey)?.name ?? '—'}</td>
                    <td className="num">{num(traysPerUnit(u, 'flat-1020'))}</td>
                    <td className="num">{num(traysPerUnit(u, 'flat-1020') * u.units)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pending && <p className="farm-kpi-sub mt-1">Saving…</p>}
        {error && <p className="farm-kpi-sub farm-c-over mt-1">{error}</p>}
        <p className="farm-kpi-sub mt-2">
          A 24x48 wire rack holds four 1020 flats a 48-inch tier, so one rack with five lit tiers holds 20. Adding racks adds grow units: a sowing is what one rack takes, and{' '}
          <Link className="farm-link" href="/farm/capacity">Capacity</Link> shows what the racks sustain over the cycle. The LED fixtures are their own row below; the count is entered there.
        </p>
      </Card>
    </>
  );
}

/** A rented commercial facility: its floor area, and where it is laid out. */
function FacilityCard() {
  const { resolved, setCapexFinance } = useScenario();
  const sqFt = resolved.facilitySqFt;
  return (
    <Card title="Rented facility">
      <table className="farm-table">
        <tbody>
          <tr>
            <td>Floor area, sq ft</td>
            <td className="num">
              <span className="inline-flex items-center gap-2">
                <EditableNumber value={sqFt ?? 0} onChange={(v) => setCapexFinance('facilitySqFt', v > 0 ? v : undefined)} step={100} min={0} suffix="sq ft" ariaLabel="Facility floor area" showBadge={false} />
                {sqFt === null ? <StatusBadge status="PLACEHOLDER" title="No facility stated in this forecast" /> : <StatusBadge status="STATED" title="Entered in this forecast" />}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <p className="farm-kpi-sub mt-2">
        A commercial facility is a forecast of its own: its floor area here, its equipment selected below, its build-out, loans, rent and utilities, then the forecast is the pro forma for the build-out and becomes the plan of record once the facility operates. Nothing on this tab counts until it is entered.
        The floor plan is laid out on <Link className="farm-link" href="/farm/sustainability/facility">Facility</Link>.
      </p>
    </Card>
  );
}
