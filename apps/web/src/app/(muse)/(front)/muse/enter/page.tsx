import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMuseAccess } from '@/app/(muse)/muse/_lib/access';
import { LANDING_HREF, landingFor } from '@/app/(muse)/muse/_engine/front-door';

export const dynamic = 'force-dynamic';

/**
 * The router (Roadmap P7): after sign-in, each person goes to their own surface by the list their email is on
 * (`_engine/front-door.ts`). Staff holding both work roles choose; anyone on no list sees the review policy.
 */
export default async function EnterPage() {
  const access = await getMuseAccess();
  if (!access.userId) redirect('/muse/sign-in');

  const landing = landingFor(access);
  if (landing === 'admin' || landing === 'floor' || landing === 'sales') redirect(LANDING_HREF[landing]);

  if (landing === 'choose') {
    return (
      <div className="muse-card muse-front-card">
        <div className="muse-card-title">Where to</div>
        <p className="muse-front-text">You hold both the Operator and Sales work roles on the staff register.</p>
        <div className="muse-front-choices">
          <Link className="muse-btn primary muse-front-enter" href={LANDING_HREF.floor}>The Floor</Link>
          <Link className="muse-btn primary muse-front-enter" href={LANDING_HREF.sales}>The Sales Portal</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="muse-card muse-front-card">
      <div className="muse-card-title">Your account is under review</div>
      <p className="muse-front-text">
        Thank you for signing in{access.email ? ` (${access.email})` : ''}. New accounts are reviewed by Muse Kitchen staff before they
        are committed to production; you will be able to enter once your account is linked. Please call the kitchen for faster service.
      </p>
    </div>
  );
}
