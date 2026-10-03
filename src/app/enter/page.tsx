import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { enterPreview } from '@/app/enter/actions';
import { PREVIEW_COOKIE, previewGate, previewPassword, safeNextPath, verifyPreviewToken } from '@/server/preview-gate';
import '@/components/farm.css';

export const dynamic = 'force-dynamic';

/** The private preview's door: one password, handed out by Rob. Not shown when no gate is set. */
export default async function EnterPage({ searchParams }: { searchParams: Promise<{ next?: string; bad?: string }> }) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next);
  if (!previewGate()) redirect(next);
  const token = (await cookies()).get(PREVIEW_COOKIE)?.value;
  if (await verifyPreviewToken(token, previewPassword()!)) redirect(next);
  const bad = sp.bad === '1';
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-4 px-4 py-12">
      <h1 className="text-xl font-semibold">Cotyledon</h1>
      <p className="text-sm">A private preview, powered by Ember OS. Enter the password you were given.</p>
      <form action={enterPreview} className="flex flex-col gap-3">
        <input type="hidden" name="next" value={next} />
        <label className="farm-field flex flex-col gap-1 text-sm">
          <span>Password</span>
          <input className="farm-input" type="password" name="password" autoComplete="current-password" autoFocus required aria-invalid={bad || undefined} aria-describedby={bad ? 'enter-error' : undefined} />
        </label>
        {bad && <p id="enter-error" role="alert" className="text-sm">That password did not open the preview.</p>}
        <button type="submit" className="farm-btn">Enter</button>
      </form>
    </main>
  );
}
