import Image from 'next/image';
import Link from 'next/link';
import { getSession } from '@/app/(farm)/farm/_lib/session';
import icon from '@/app/(farm)/farm/_assets/farm-icon-512.png';
import { withWorkspace } from '@/app/(farm)/farm/_lib/workspace';

/**
 * `/farm` — the welcome page: the brand stacked as in the OS header — the mark,
 * FARM FARM in the logo's dark green, IMPACT OS in copper — set in the sky, and one way in. Signed in, the
 * button goes straight to the router; signed out, to the one sign-in.
 */
export default async function FrontDoorPage() {
  return withWorkspace(() => FrontDoorPageInner());
}

async function FrontDoorPageInner() {
  const { userId } = await getSession();
  return (
    <div className="farm-front-welcome">
      <div className="farm-front-brand" aria-label="MicroFarm">
        <Image src={icon} alt="" className="farm-brand-icon" priority sizes="15rem" />
        <span className="farm-brand-wordmark">MicroFarm</span>
        <span className="farm-brand-tagline">MicroFarm</span>
      </div>
      <h1 className="farm-front-title">Welcome to the operating system built specifically for regenerative, scratch farms</h1>
      <Link className="farm-btn primary farm-front-enter" href={userId ? '/farm/enter' : '/farm/sign-in'}>
        Login
      </Link>
    </div>
  );
}
