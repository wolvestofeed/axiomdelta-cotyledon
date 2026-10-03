'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { PREVIEW_COOKIE, PREVIEW_TTL_DAYS, issuePreviewToken, passwordMatches, previewPassword, safeNextPath } from '@/server/preview-gate';

/** The gate's one form: a correct password sets the signed cookie and sends the visitor on; a wrong one returns to the gate. */
export async function enterPreview(formData: FormData): Promise<void> {
  const expected = previewPassword();
  const next = safeNextPath(typeof formData.get('next') === 'string' ? (formData.get('next') as string) : null);
  if (!expected) redirect(next);
  const submitted = typeof formData.get('password') === 'string' ? (formData.get('password') as string) : '';
  if (!passwordMatches(submitted, expected)) {
    redirect(`/enter?bad=1&next=${encodeURIComponent(next)}`);
  }
  const jar = await cookies();
  jar.set(PREVIEW_COOKIE, await issuePreviewToken(expected), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: PREVIEW_TTL_DAYS * 86_400,
  });
  redirect(next);
}
