import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { devBypass } from '@/server/dev-bypass';
import { PREVIEW_COOKIE, isGateExempt, previewGate, previewPassword, verifyPreviewToken } from '@/server/preview-gate';

/** Everything under /farm requires sign-in except the front door and each portal's own sign-in and sign-up. */
const isProtected = createRouteMatcher(['/farm(.*)']);

const isPublicPortalAuth = createRouteMatcher([
  '/farm',
  '/farm/sign-in(.*)',
  '/farm/sign-up(.*)',
  '/farm/client-portal/sign-in(.*)',
  '/farm/client-portal/sign-up(.*)',
]);

/** A signed-out visit to a portal's own pages goes to that portal's sign-in, not the shared one. */
const PORTAL_BASES = ['/farm/client-portal'];

const withClerk = clerkMiddleware(async (auth, req) => {
  const portal = PORTAL_BASES.find((b) => req.nextUrl.pathname === b || req.nextUrl.pathname.startsWith(`${b}/`));
  if (portal && !isPublicPortalAuth(req)) {
    const { userId } = await auth();
    if (!userId) return NextResponse.redirect(new URL(`${portal}/sign-in`, req.url));
  }
  if (isProtected(req) && !isPublicPortalAuth(req)) {
    await auth.protect();
  }
});

/**
 * The private preview gate (`preview-gate.ts`): with a password set, every request without a valid
 * cookie goes to `/enter`, and the deployment asks search engines not to index it. Behind the gate,
 * and under the local development bypass (`dev-bypass.ts`), nothing else is gated and Clerk is never called.
 */
export default async function proxy(req: NextRequest, evt: NextFetchEvent) {
  if (previewGate()) {
    const path = req.nextUrl.pathname;
    if (!isGateExempt(path) && !(await verifyPreviewToken(req.cookies.get(PREVIEW_COOKIE)?.value, previewPassword()!))) {
      const url = new URL('/enter', req.url);
      url.searchParams.set('next', `${path}${req.nextUrl.search}`);
      return NextResponse.redirect(url);
    }
  }
  const res = devBypass() ? NextResponse.next() : await withClerk(req, evt);
  if (previewGate() && res) res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return res;
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
