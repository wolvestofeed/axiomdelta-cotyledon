'use client';

import { useState, useTransition } from 'react';
import { useScenario } from '../_state/scenario-store';
import { saveScenario } from '../_lib/scenario-actions';
import type { ScenarioSection } from '../_engine/scenario';

/**
 * Per-page Section Save. Placed on a section page for convenience — it shows
 * when this section's inputs differ from what is open (the forecast, or the
 * plan of record), reverts just this section, and saves the whole working copy
 * as a named forecast (the same `saveScenario` the scenario bar uses;
 * persistence is one document, so a save captures the full working copy, not
 * only this section). Setting the plan of record stays the super-admin action
 * on the scenario bar.
 */
export function SectionSave({
  sections,
  title = 'this section',
}: {
  sections: ScenarioSection[];
  title?: string;
}) {
  const { config, dirtySections, resetSection } = useScenario();
  const [name, setName] = useState('');
  const [naming, setNaming] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pending, start] = useTransition();

  const dirty = sections.filter((s) => dirtySections.includes(s));
  if (dirty.length === 0) return null;

  function handleSave() {
    if (!name.trim()) {
      setMsg({ kind: 'err', text: 'Name the forecast first.' });
      return;
    }
    start(async () => {
      const res = await saveScenario({ label: name.trim(), config });
      if (res.ok) {
        setMsg({ kind: 'ok', text: `Saved “${name.trim()}” as a forecast.` });
        setNaming(false);
        setName('');
      } else {
        setMsg({ kind: 'err', text: res.error });
      }
    });
  }

  return (
    <div className="farm-section-save">
      <span className="label">Unsaved changes in {title}</span>
      <button
        type="button"
        className="farm-btn"
        onClick={() => dirty.forEach((s) => resetSection(s))}
        disabled={pending}
      >
        Revert {title}
      </button>

      <span className="spacer" />

      {naming ? (
        <>
          <input
            className="farm-input"
            type="text"
            value={name}
            placeholder="Forecast name"
            onChange={(e) => setName(e.target.value)}
            disabled={pending}
          />
          <button type="button" className="farm-btn primary" onClick={handleSave} disabled={pending}>
            Save
          </button>
          <button
            type="button"
            className="farm-btn"
            onClick={() => {
              setNaming(false);
              setName('');
            }}
            disabled={pending}
          >
            Cancel
          </button>
        </>
      ) : (
        <button type="button" className="farm-btn" onClick={() => setNaming(true)} disabled={pending}>
          Save as forecast
        </button>
      )}

      {msg && (
        <div className={`farm-section-save-msg ${msg.kind}`} role="status">
          {msg.text}
        </div>
      )}
    </div>
  );
}
