/**
 * Which world an operations page is running in (Roadmap N6 slice 3). Plan is the
 * open forecast's own run and records nothing; Actual is the real kitchen.
 */
export function WorldNote({ isPlan, children }: { isPlan: boolean; children?: React.ReactNode }) {
  return (
    <div
      className="mb-4 border! border-[color:var(--muse-line)]! bg-[color:var(--muse-surface-2)]! rounded-[0.6rem]! py-[0.6rem]! px-[1.1rem]! muse-fs-sm muse-c-soft"
      role="status"
    >
      {isPlan ? (
        <>
          <strong className="muse-c-ink">Plan</strong> — the open forecast&rsquo;s own run: its customers, services and meal plans with the forecast&rsquo;s edits, and only the stock its own batches make. Nothing is recorded here; switch to Actual in the scenario bar to record.
        </>
      ) : (
        <>
          <strong className="muse-c-ink">Actual</strong> — the real kitchen: the customer records&rsquo; services and meal plans, the orders on file, and recorded stock, receipts and purchase orders. Forecast edits are made on Plan.
        </>
      )}
      {children}
    </div>
  );
}
