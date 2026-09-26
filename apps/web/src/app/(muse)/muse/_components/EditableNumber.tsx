'use client';

/**
 * A live numeric input bound to the scenario store. Recomputes on every
 * keystroke (the "live calculator" behaviour), and flags a "Your input" badge
 * whenever the value differs from the plan-data default — so an edited figure
 * reads differently from a maintained one, without touching the provenance
 * badges (SOURCED / PLACEHOLDER / …) that describe the default's source.
 */
export function EditableNumber({
  value,
  defaultValue,
  onChange,
  step = 0.01,
  min = 0,
  max,
  prefix,
  suffix,
  ariaLabel,
  showBadge = true,
  disabled = false,
}: {
  value: number;
  /** The plan-data default; drives the edited/badge state. */
  defaultValue?: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  prefix?: string;
  suffix?: string;
  ariaLabel?: string;
  showBadge?: boolean;
  /** Read-only: shown, not editable (a forecast edit on Actual, Roadmap N6 slice 3). */
  disabled?: boolean;
}) {
  const edited =
    defaultValue !== undefined && Math.abs(value - defaultValue) > 1e-9;

  return (
    <span className="muse-editnum">
      {prefix && <span className="muse-editnum-affix">{prefix}</span>}
      <input
        type="number"
        className={`muse-num-input${edited ? ' edited' : ''}`}
        value={Number.isFinite(value) ? value : ''}
        step={step}
        min={min}
        max={max}
        aria-label={ariaLabel}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.value === '') return;
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
      />
      {suffix && <span className="muse-editnum-affix">{suffix}</span>}
      {showBadge && edited && (
        <span className="muse-badge yourinput" title="Edited from the default value">
          Your input
        </span>
      )}
    </span>
  );
}
