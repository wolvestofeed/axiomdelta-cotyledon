/**
 * Which world an operations page is running in (Roadmap N6 slice 3). Plan is the
 * open forecast's own run and records nothing; Actual is the real farm.
 */
export function WorldNote({ isPlan, children }: { isPlan: boolean; children?: React.ReactNode }) {
  return (
    <div
      className="mb-4 border! border-[color:var(--farm-line)]! bg-[color:var(--farm-surface-2)]! rounded-[0.6rem]! py-[0.6rem]! px-[1.1rem]! farm-fs-sm farm-c-soft"
      role="status"
    >
      {isPlan ? (
        <>
          <strong className="farm-c-ink">Plan</strong> — the open forecast&rsquo;s own run: its subscribers, services and flat plans with the forecast&rsquo;s edits, and only the stock its own sowings make. Nothing is recorded here; switch to Actual in the scenario bar to record.
        </>
      ) : (
        <>
          <strong className="farm-c-ink">Actual</strong> — the real farm: the subscriber records&rsquo; services and flat plans, the orders on file, and recorded stock, receipts and purchase orders. Forecast edits are made on Plan.
        </>
      )}
      {children}
    </div>
  );
}
