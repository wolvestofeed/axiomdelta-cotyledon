import Link from 'next/link';
import { FrontDoorSignUp } from '@/app/(muse)/muse/_components/PortalAuth';

/** The front door's sign-up: a new person creates their account here and the router sends them on. */
export default function Page() {
  return (
    <div className="muse-front-welcome">
      <FrontDoorSignUp />
      <div className="muse-front-links">
        <Link className="muse-link" href="/muse">Back to the welcome page</Link>
      </div>
    </div>
  );
}
