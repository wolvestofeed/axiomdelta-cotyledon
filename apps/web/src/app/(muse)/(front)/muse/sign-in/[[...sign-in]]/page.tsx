import Link from 'next/link';
import { FrontDoorSignIn } from '@/app/(muse)/muse/_components/PortalAuth';

/** The one sign-in (Roadmap P7): every person signs in here and the router sends them on. */
export default function Page() {
  return (
    <div className="muse-front-welcome">
      <FrontDoorSignIn />
      <div className="muse-front-links">
        <Link className="muse-link" href="/muse/sign-up">Create account</Link>
        <Link className="muse-link" href="/muse">Back to the welcome page</Link>
      </div>
    </div>
  );
}
