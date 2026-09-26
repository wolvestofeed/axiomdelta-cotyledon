'use client';

import { SignIn as ClerkSignIn } from '@clerk/nextjs';

/** The Supplier portal's sign-in (Roadmap P3): no sign-up link — suppliers join by invitation. */
export function SignIn() {
  return (
    <div className="flex justify-center py-6 px-0">
      <ClerkSignIn routing="path" path="/farm/supplier-portal/sign-in" forceRedirectUrl="/farm/supplier-portal" appearance={{ elements: { footerAction: { display: 'none' } } }} />
    </div>
  );
}
