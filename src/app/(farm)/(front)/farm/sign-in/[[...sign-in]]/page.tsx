import Link from 'next/link';
import { FrontDoorSignIn } from '@/components/PortalAuth';

/** The one sign-in (Roadmap P7): every person signs in here and the router sends them on. */
export default function Page() {
  return (
    <div className="farm-front-welcome">
      <FrontDoorSignIn />
      <div className="farm-front-links">
        <Link className="farm-link" href="/farm/sign-up">Create account</Link>
        <Link className="farm-link" href="/farm">Back to the welcome page</Link>
      </div>
    </div>
  );
}
