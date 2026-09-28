/**
 * What a signed-in external user sees until their account is reviewed and linked to its record (Roadmap P3,
 * P5): the review policy, and no data.
 */
export function PortalPending({ portal, email }: { portal: string; email: string | null }) {
  return (
    <div className="farm-card max-w-160!">
      <div className="farm-card-title">Your account is under review</div>
      <p className="farm-fs-md farm-c-soft leading-[1.55]">
        Thank you for creating an account{email ? ` (${email})` : ''} on the {portal}. New accounts are reviewed by the farm&rsquo;s staff
        before they are committed to production; you will be able to use the portal once your account is linked. Please call the farm
        for faster service.
      </p>
    </div>
  );
}
