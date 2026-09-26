'use client';

/**
 * Impact OS — the month grid (scheduler build plan §5.1). A CSS-grid month,
 * Monday first, each day carrying what the horizon made that date: batches and
 * portions, how much of the plant's cycles the day used, stock expiring, and
 * how many findings the placement raised. Text only — no dots and no icons; a
 * day the plan does not fit is outlined in the accent, and the page tables the
 * same numbers underneath.
 */

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export interface MonthDay {
  date: string;
  /** Lines of text under the day number, in the order they should read. */
  lines: string[];
  /** 0–1; drawn as a bar across the bottom of the cell. Omitted draws nothing. */
  utilisation?: number;
  /** Outlined in the accent: the day does not fit, or something it placed breaks a limit. */
  flagged?: boolean;
  /** Dimmed: outside the month being shown. */
  muted?: boolean;
  selected?: boolean;
}

/** Monday-first weekday index, 0–6. */
const mondayIndex = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number);
  const day = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1)).getUTCDay();
  return (day + 6) % 7;
};

export function MonthGrid({ days, onPick, selectedDate }: { days: MonthDay[]; onPick?: (date: string) => void; selectedDate?: string | null }) {
  if (days.length === 0) return null;
  const lead = mondayIndex(days[0]!.date);
  return (
    <div>
      <div className="grid grid-cols-[repeat(7,minmax(0,1fr))] gap-[0.3rem] mb-[0.3rem]!">
        {WEEKDAYS.map((w) => (
          <div key={w} className="muse-fs-2xs muse-c-faint uppercase tracking-[0.04em]">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-[repeat(7,minmax(0,1fr))] gap-[0.3rem]">
        {Array.from({ length: lead }, (_, i) => <div key={`lead-${i}`} />)}
        {days.map((d) => {
          const selected = d.selected ?? d.date === selectedDate;
          const cell = (
            <>
              <span className={`muse-fs-xs font-semibold ${(d.muted ? 'muse-c-faint' : 'muse-c-ink')}`}>{Number(d.date.slice(8, 10))}</span>
              {d.lines.map((l) => (
                <span key={l} className="block muse-fs-2xs muse-c-soft whitespace-nowrap overflow-hidden [text-overflow:ellipsis]">{l}</span>
              ))}
              {d.utilisation !== undefined && (
                <span className="block mt-[0.2rem]! h-[3px] bg-[color:var(--muse-line)]">
                  <span className={`block h-[3px] ${(d.flagged ? 'bg-[color:var(--muse-accent)]' : 'bg-[color:var(--muse-olive)]')}`} style={{ width: `${Math.min(100, Math.max(0, d.utilisation * 100))}%` }} />
                </span>
              )}
            </>
          );
          const style: React.CSSProperties = {
            minHeight: '5.2rem',
            padding: '0.35rem 0.4rem',
            textAlign: 'left',
            border: d.flagged ? '2px solid var(--muse-accent)' : `1px solid ${selected ? 'var(--muse-ink)' : 'var(--muse-line)'}`,
            borderRadius: '0.35rem',
            background: selected ? 'var(--muse-accent-wash)' : 'var(--muse-surface-2)',
            opacity: d.muted ? 0.55 : 1,
            font: 'inherit',
            color: 'var(--muse-ink)',
            overflow: 'hidden',
          };
          return onPick ? (
            <button key={d.date} type="button" onClick={() => onPick(d.date)} aria-pressed={selected} aria-label={`${d.date}${d.lines.length ? `: ${d.lines.join(', ')}` : ''}`} className="cursor-pointer!" style={{ ...style }}>
              {cell}
            </button>
          ) : (
            <div key={d.date} style={style}>{cell}</div>
          );
        })}
      </div>
    </div>
  );
}
