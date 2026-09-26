'use client';

import { SignIn as ClerkSignIn } from '@clerk/nextjs';

/** The Supplier portal's sign-in (Roadmap P3): no sign-up link — suppliers join by invitation (Robert, 2026-09-16). */
export function SignIn() {
  return (
    <div className="flex justify-center py-6 px-0">
      <ClerkSignIn routing="path" path="/muse/supplier-portal/sign-in" forceRedirectUrl="/muse/supplier-portal" appearance={{ elements: { footerAction: { display: 'none' } } }} />
    </div>
  );
}
