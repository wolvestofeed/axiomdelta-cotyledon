import Link from 'next/link';
import { PageHeader, Card } from '@/app/(muse)/muse/_components/ui';

/**
 * Accept a supplier invitation (Roadmap P1b, P4): suppliers join by a link Muse Kitchen sends from the
 * supplier's record (Robert, 2026-09-16). The UI surface only: invitations, the verification email and the
 * admin notification are not connected yet.
 */
export default function SupplierWelcomePage() {
  return (
    <>
      <PageHeader
        title="Welcome, supplier"
        purpose="Confirm your contact details to accept Muse Kitchen's invitation to the Supplier Portal."
        status="designed"
      />
      <Card title="Your contact details">
        <div className="grid gap-[0.7rem] max-w-144">
          <label className="muse-kpi-sub">Operation<br /><input className="muse-input w-full!" disabled placeholder="Set by the invitation" /></label>
          <label className="muse-kpi-sub">Your name<br /><input className="muse-input w-full!" /></label>
          <label className="muse-kpi-sub">Email<br /><input type="email" className="muse-input w-full!" /></label>
          <label className="muse-kpi-sub">Phone<br /><input type="tel" className="muse-input w-full!" /></label>
          <button type="button" className="muse-btn primary" disabled>Accept invitation</button>
        </div>
        <p className="muse-kpi-sub mt-3">
          Your contact details are kept on your operation&rsquo;s record at Muse Kitchen — the same record our staff
          work from. We send a verification email, and staff are told when you join. Supplier submissions are
          reviewed by staff before they are committed to production. Please call the kitchen for faster service.
        </p>
        <p className="muse-kpi-sub mt-2">Already have an account? <Link className="muse-link" href="/muse/supplier-portal/sign-in">Sign in</Link>.</p>
      </Card>
    </>
  );
}
