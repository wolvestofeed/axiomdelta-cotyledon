import Image from 'next/image';
import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import icon from '@/app/(muse)/muse/_assets/muse-kitchen-icon-512.png';

/**
 * `/muse` — the welcome page (Roadmap P7; Robert, 2026-09-16): the brand stacked as in the OS header — the mark,
 * MUSE KITCHEN in the logo's dark green, IMPACT OS in copper — set in the sky, and one way in. Signed in, the
 * button goes straight to the router; signed out, to the one sign-in.
 */
export default async function FrontDoorPage() {
  const { userId } = await auth();
  return (
    <div className="muse-front-welcome">
      <div className="muse-front-brand" aria-label="Muse Kitchen Impact OS">
        <Image src={icon} alt="" className="muse-brand-icon" priority sizes="15rem" />
        <span className="muse-brand-wordmark">Muse Kitchen</span>
        <span className="muse-brand-tagline">Impact OS</span>
      </div>
      <h1 className="muse-front-title">Welcome to the operating system built specifically for regenerative, scratch kitchens</h1>
      <Link className="muse-btn primary muse-front-enter" href={userId ? '/muse/enter' : '/muse/sign-in'}>
        Login
      </Link>
    </div>
  );
}
