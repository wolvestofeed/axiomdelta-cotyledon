import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getFarmAccess } from '@/app/(farm)/farm/_lib/access';
import { LANDING_HREF, landingFor } from '@/app/(farm)/farm/_engine/front-door';

export const dynamic = 'force-dynamic';

/**
 * The router (Roadmap P7): after sign-in, each person goes to their own surface by the list their email is on
 * (`_engine/front-door.ts`). Staff holding both work roles choose; anyone on no list sees the review policy.
 */
export default async function EnterPage() {
  const access = await getFarmAccess();
  if (!access.userId) redirect('/farm/sign-in');

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
        Thank you for signing in{access.email ? ` (${access.email})` : ''}. New accounts are reviewed by MicroFarm staff before they
        are committed to production; you will be able to enter once your account is linked. Please call the farm for faster service.
      </p>
    </div>
  );
}
