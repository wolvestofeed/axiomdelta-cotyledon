'use client';

import { useState, useTransition } from 'react';
import { useScenario } from '@/state/scenario-store';
import { useLedger } from '@/state/ledger';
import type { FarmScenarioConfig } from '@/engine/scenario';
import { saveScenario, saveAndApply, openForecast, closeForecast } from '@/server/scenario-actions';

export interface SavedScenarioItem {
  id: string;
  label: string;
  ownerTier: string;
  isActive: boolean;
  config: FarmScenarioConfig;
}

/**
 * The scenario bar in the Farm shell.
 *
 * Plan of record, forecasts, actuals. The bar says which of the first two the
 * person is looking at, whether the working copy has unsaved edits, and
 * carries the actions: open a forecast (every page, client and server, then
 * renders it), save the working copy back to it or as a new forecast, return
 * to the plan of record, and — super admin only — set a forecast as the plan
 * of record. Actuals are not a scenario; they are recorded facts and are not
 * built yet.
 */
export function ScenarioBar({
  isSuperAdmin,
  basis,
  openId,
  openLabel,
  planLabel,
  saved,
}: {
  isSuperAdmin: boolean;
  basis: 'plan' | 'forecast';
  openId: string | null;
  openLabel: string | null;
  planLabel: string | null;
  saved: SavedScenarioItem[];
}) {
  const { config, isDirty, dirtySections, resetAll, loadConfig, commitBaseline } =
    useScenario();
  const ledger = useLedger();

  const [name, setName] = useState(openLabel ?? '');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const dirtyCount = dirtySections.length;
  const viewingForecast = basis === 'forecast' && openId !== null;

  function handleOpen(id: string) {
    const found = saved.find((s) => s.id === id);
    if (!found) return;
    startTransition(async () => {
      if (found.isActive) {
        await closeForecast();
      } else {
        const res = await openForecast({ scenarioId: id });
        if (!res.ok) {
          setMsg({ kind: 'err', text: res.error });
          return;
        }
      }
      loadConfig(found.config);
      commitBaseline(found.config);
      setName(found.label);
      setMsg(null);
    });
  }

  function handleBackToPlan() {
    startTransition(async () => {
      await closeForecast();
      const plan = saved.find((s) => s.isActive);
      const cfg = plan?.config ?? {};
      loadConfig(cfg);
      commitBaseline(cfg);
      setName(plan?.label ?? '');
      setMsg(null);
    });
  }

  function handleSave(asNew: boolean) {
    if (!name.trim()) {
      setMsg({ kind: 'err', text: 'Name the forecast first.' });
      return;
    }
    startTransition(async () => {
      const updateInPlace = viewingForecast && !asNew;
      const res = await saveScenario({
        ...(updateInPlace ? { scenarioId: openId } : {}),
        label: name.trim(),
        config,
      });
      if (!res.ok) {
        setMsg({ kind: 'err', text: res.error });
        return;
      }
      if (!updateInPlace) {
        const opened = await openForecast({ scenarioId: res.id });
        if (!opened.ok) {
          setMsg({ kind: 'err', text: opened.error });
          return;
        }
      }
      commitBaseline(config);
      setMsg({
        kind: 'ok',
        text: updateInPlace
          ? `Saved “${name.trim()}”.`
          : `Saved “${name.trim()}” as a forecast and opened it.`,
      });
    });
  }

  function handleSetPlan() {
    if (!name.trim()) {
      setMsg({ kind: 'err', text: 'Name the forecast before setting it as the plan of record.' });
      return;
    }
    startTransition(async () => {
      const res = await saveAndApply({
        ...(viewingForecast ? { scenarioId: openId } : {}),
        label: name.trim(),
        config,
      });
      if (res.ok) {
        await closeForecast();
        commitBaseline(config);
        setMsg({ kind: 'ok', text: `“${name.trim()}” is now the plan of record.` });
      } else {
        setMsg({ kind: 'err', text: res.error });
      }
    });
  }

  return (
    <div className="farm-scenariobar">
      <div className="farm-scenariobar-status">
        <span role="group" aria-label="Ledger" className="inline-flex gap-1 mr-[0.6rem]!">
          {(['plan', 'actual'] as const).map((k) => (
            <span key={k} className="relative inline-flex">
              <button
                type="button"
                className={`farm-btn${ledger.kind === k ? ' primary' : ' farm-btn-light'} py-[0.1rem]! px-[0.55rem]!`}
                aria-pressed={ledger.kind === k}
                disabled={ledger.switching}
                onClick={() => ledger.kind !== k && ledger.setKind(k)}
                title={k === 'plan' ? 'Statements from the open forecast, unsaved edits included' : 'Statements from recorded documents only'}
              >
                {k === 'plan' ? 'Plan' : 'Actual'}
              </button>
            </span>
          ))}
        </span>
        <span className="farm-scenariobar-live">
          {viewingForecast ? (
            <>Forecast: <strong>{openLabel}</strong></>
          ) : (
            <>Plan of record: <strong>{planLabel ?? 'Plan defaults'}</strong></>
          )}
        </span>
        {isDirty ? (
          <span className="farm-dirty" title={dirtySections.join(', ')}>
            Unsaved edits · {dirtyCount} section{dirtyCount === 1 ? '' : 's'}
          </span>
        ) : (
          <span className="farm-scenariobar-clean">
            {viewingForecast ? 'Saved' : 'No unsaved edits'}
          </span>
        )}
      </div>

      <div className="farm-scenariobar-actions">
        {saved.length > 0 && (
          <select
            className="farm-select w-[162px]! min-w-0! truncate"
            aria-label="Open a forecast"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) handleOpen(e.target.value);
              e.target.value = '';
            }}
            disabled={pending}
          >
            <option value="" disabled>
              Open forecast…
            </option>
            {saved.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
                {s.isActive ? ' (plan of record)' : ''}
              </option>
            ))}
          </select>
        )}

        <input
          className="farm-input w-[162px]! min-w-0!"
          type="text"
          value={name}
          placeholder="Forecast name"
          onChange={(e) => setName(e.target.value)}
          disabled={pending}
        />

        {isDirty && (
          <button
            type="button"
            className="farm-btn"
            onClick={() => {
              resetAll();
              setMsg(null);
            }}
            disabled={pending}
          >
            {viewingForecast ? 'Revert to saved' : 'Revert to plan of record'}
          </button>
        )}

        {viewingForecast && (
          <button type="button" className="farm-btn" onClick={handleBackToPlan} disabled={pending}>
            Back to plan of record
          </button>
        )}

        <button type="button" className="farm-btn" onClick={() => handleSave(false)} disabled={pending}>
          {viewingForecast ? 'Save forecast' : 'Save as forecast'}
        </button>

        {viewingForecast && (
          <button type="button" className="farm-btn" onClick={() => handleSave(true)} disabled={pending}>
            Save as new forecast
          </button>
        )}

        {isSuperAdmin && (
          <button
            type="button"
            className="farm-btn primary"
            onClick={handleSetPlan}
            disabled={pending}
          >
            Set as plan of record
          </button>
        )}
      </div>

      {msg && (
        <div className={`farm-scenariobar-msg ${msg.kind}`} role="status">
          {msg.text}
        </div>
      )}
    </div>
  );
}
