import Link from 'next/link';
import { redirect } from 'next/navigation';
import { OrganizationList } from '@clerk/nextjs';
import { getFarmAccess } from '@/server/access';
import { withWorkspace } from '@/server/workspace';
import { LANDING_HREF, landingFor } from '@/engine/front-door';

export const dynamic = 'force-dynamic';

/**
 * The router: after sign-in, each person goes to their own surface by their role in the farm's
 * organization (`_engine/front-door.ts`). No organization active: choose or create a farm. Staff
 * holding both work roles choose a surface; anyone with no role sees the review policy.
 */
export default async function EnterPage() {
  return withWorkspace(() => EnterPageInner());
}

async function EnterPageInner() {
  const access = await getFarmAccess();
  if (!access.userId) redirect('/farm/sign-in');

  if (!access.orgId) {
    return (
      <div className="farm-card farm-front-card">
        <div className="farm-card-title">Choose a farm</div>
        <p className="farm-front-text">Each farm is an organization. Open the one you belong to, or create one for a new farm.</p>
        <OrganizationList hidePersonal afterSelectOrganizationUrl="/farm/enter" afterCreateOrganizationUrl="/farm/enter" />
      </div>
    );
  }

  const landing = landingFor(access);
  if (landing === 'admin' || landing === 'growRoom' || landing === 'sales') redirect(LANDING_HREF[landing]);

  if (landing === 'choose') {
    return (
      <div className="farm-card farm-front-card">
        <div className="farm-card-title">Where to</div>
        <p className="farm-front-text">You hold both the Operator and Sales work roles on the staff register.</p>
        <div className="farm-front-choices">
          <Link className="farm-btn primary farm-front-enter" href={LANDING_HREF.growRoom}>The Grow Room</Link>
          <Link className="farm-btn primary farm-front-enter" href={LANDING_HREF.sales}>The Sales Portal</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="farm-card farm-front-card">
      <div className="farm-card-title">Your account is under review</div>
      <p className="farm-front-text">
        Thank you for signing in{access.email ? ` (${access.email})` : ''}. Your account is not yet a member of this farm&rsquo;s
        organization. An admin of the farm can add you; you will be able to enter once they do.
      </p>
    </div>
  );
}
