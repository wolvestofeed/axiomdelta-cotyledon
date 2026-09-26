import Link from 'next/link';
import { FrontDoorSignUp } from '@/app/(farm)/farm/_components/PortalAuth';

/** The front door's sign-up: a new person creates their account here and the router sends them on. */
export default function Page() {
  return (
    <div className="farm-front-welcome">
      <FrontDoorSignUp />
      <div className="farm-front-links">
        <Link className="farm-link" href="/farm">Back to the welcome page</Link>
      </div>
    </div>
  );
}
