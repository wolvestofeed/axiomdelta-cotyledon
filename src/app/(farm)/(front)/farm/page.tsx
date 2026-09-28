import Image from 'next/image';
import Link from 'next/link';
import { getSession } from '@/server/session';
import logo from '@/assets/cotyledon-stacked.png';
import { withWorkspace } from '@/server/workspace';

/**
 * `/farm` — the welcome page: the stacked lockup, Cotyledon powered by Ember OS on its deep forest tile, set
 * in the sky, and one way in. Signed in, the button goes straight to the router; signed out, to the one sign-in.
 */
export default async function FrontDoorPage() {
  return withWorkspace(() => FrontDoorPageInner());
}

async function FrontDoorPageInner() {
  const { userId } = await getSession();
  return (
    <div className="farm-front-welcome">
      <div className="farm-front-brand">
        <Image src={logo} alt="Cotyledon, powered by Ember OS" className="farm-front-logo" priority sizes="15rem" />
      </div>
      <h1 className="farm-front-title">The operating system for microgreens and sprouts production</h1>
      <Link className="farm-btn primary farm-front-enter" href={userId ? '/farm/enter' : '/farm/sign-in'}>
        Login
      </Link>
    </div>
  );
}
