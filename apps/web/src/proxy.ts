import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

/** Everything under /farm requires sign-in except the front door and each portal's own sign-in and sign-up. */
const isProtected = createRouteMatcher(['/farm(.*)']);

const isPublicPortalAuth = createRouteMatcher([
  '/farm',
  '/farm/sign-in(.*)',
  '/farm/sign-up(.*)',
  '/farm/subscriber-portal/sign-in(.*)',
  '/farm/subscriber-portal/sign-up(.*)',
  '/farm/supplier-portal/sign-in(.*)',
  '/farm/supplier-portal/welcome(.*)',
]);

/** A signed-out visit to a portal's own pages goes to that portal's sign-in, not the shared one. */
const PORTAL_BASES = ['/farm/subscriber-portal', '/farm/supplier-portal'];

export default clerkMiddleware(async (auth, req) => {
  const portal = PORTAL_BASES.find((b) => req.nextUrl.pathname === b || req.nextUrl.pathname.startsWith(`${b}/`));
  if (portal && !isPublicPortalAuth(req)) {
    const { userId } = await auth();
    if (!userId) return NextResponse.redirect(new URL(`${portal}/sign-in`, req.url));
  }
  if (isProtected(req) && !isPublicPortalAuth(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
