'use client';

import { useState } from 'react';

/**
 * Cotyledon — in-table editing controls, shared by the definition
 * libraries (Equipment, Packaging). A value is saved when the field is left or
 * Enter is pressed. Controls size to their content; `.farm-input`'s 12rem floor
 * is for forms, not table cells.
 */

export const cellControl: React.CSSProperties = { fontSize: '0.78rem', minWidth: 0, padding: '0.3rem 0.5rem' };

/** A control width that shows its longest value, its arrow or picker, and padding. */
export const fit = (width: string): React.CSSProperties => ({ ...cellControl, width });

/** The button filling a collapsing library's group header row (`tr.farm-group-row`). */
export const groupRowButton: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: '1rem',
  padding: '0.55rem 0.7rem',
  background: 'none',
  border: 'none',
  font: 'inherit',
  color: 'var(--farm-ink)',
  textAlign: 'left',
  cursor: 'pointer',
};

const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
};

/** A number typed in place. `nullable` lets an emptied field save as null. */
export function InlineNumber({
  value,
  onCommit,
  disabled,
  step,
  label,
  minChars = 3,
  nullable = false,
}: {
  value: number | null;
  onCommit: (n: number | null) => void;
  disabled: boolean;
  step: number;
  label: string;
  minChars?: number;
  nullable?: boolean;
}) {
  const shown = value === null ? '' : String(value);
  const [text, setText] = useState(shown);
  const [seen, setSeen] = useState(shown);
  if (seen !== shown) {
    setSeen(shown);
    setText(shown);
  }
  const commit = () => {
    if (text.trim() === '') {
      if (nullable && value !== null) onCommit(null);
      else if (!nullable) setText(shown);
      return;
    }
    const n = Number(text);
    if (!Number.isFinite(n) || n < 0) {
      setText(shown);
      return;
    }
    if (n !== value) onCommit(n);
  };
  return (
    <input
      type="number"
      min={0}
      step={step}
      className="farm-input text-right!"
      style={{ ...fit(`calc(${Math.max(minChars, text.length)}ch + 3rem)`) }}
      value={text}
      disabled={disabled}
      aria-label={label}
      placeholder={nullable ? '—' : undefined}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={blurOnEnter}
    />
  );
}

/** Text typed in place; an emptied field saves as null. */
export function InlineText({
  value,
  onCommit,
  disabled,
  label,
  minChars = 8,
  placeholder,
}: {
  value: string | null;
  onCommit: (s: string | null) => void;
  disabled: boolean;
  label: string;
  minChars?: number;
  placeholder?: string;
}) {
  const shown = value ?? '';
  const [text, setText] = useState(shown);
  const [seen, setSeen] = useState(shown);
  if (seen !== shown) {
    setSeen(shown);
    setText(shown);
  }
  const commit = () => {
    const next = text.trim();
    if (next === shown.trim()) return;
    onCommit(next === '' ? null : next);
  };
  return (
    <input
      type="text"
      className="farm-input"
      style={fit(`calc(${Math.max(minChars, text.length)}ch + 1.25rem)`)}
      value={text}
      disabled={disabled}
      aria-label={label}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={blurOnEnter}
    />
  );
}
