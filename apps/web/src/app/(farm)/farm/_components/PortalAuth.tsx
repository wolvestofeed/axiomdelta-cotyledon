'use client';

import { SignIn, SignUp } from '@clerk/nextjs';

/**
 * A portal's own sign-in and sign-up (Roadmap P3): Clerk's forms inside the portal shell, returning the
 * person to their portal. The pages are public in `proxy.ts`; everything else under `/farm` stays signed-in.
 */
export function PortalSignIn({ base }: { base: string }) {
  return (
    <div className="flex justify-center py-6 px-0">
      <SignIn routing="path" path={`${base}/sign-in`} signUpUrl={`${base}/sign-up`} forceRedirectUrl={base} signUpForceRedirectUrl={base} />
    </div>
  );
}

export function PortalSignUp({ base }: { base: string }) {
  return (
    <div className="flex justify-center py-6 px-0">
      <SignUp routing="path" path={`${base}/sign-up`} signInUrl={`${base}/sign-in`} forceRedirectUrl={base} signInForceRedirectUrl={base} />
    </div>
  );
}

/**
 * The front door's one sign-in (Roadmap P7). Clerk's own footer is hidden; the page carries the "Create account"
 * link to the front door's sign-up, so a new person never leaves the MicroFarm pages.
 */
export function FrontDoorSignIn() {
  return (
    <SignIn
      routing="path"
      path="/farm/sign-in"
      signUpUrl="/farm/sign-up"
      forceRedirectUrl="/farm/enter"
      signUpForceRedirectUrl="/farm/enter"
      appearance={{ elements: { footerAction: { display: 'none' } } }}
    />
  );
}

/**
 * The front door's sign-up: anyone creates their own account; the lists decide what it opens.
 * The router sends an address on the admin list or the staff register to its surface and everyone else to review.
 */
export function FrontDoorSignUp() {
  return (
    <SignUp
      routing="path"
      path="/farm/sign-up"
      signInUrl="/farm/sign-in"
      forceRedirectUrl="/farm/enter"
      signInForceRedirectUrl="/farm/enter"
    />
  );
}
