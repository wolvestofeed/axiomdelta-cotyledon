import Link from 'next/link';
import { PageHeader, Card } from '@/app/(farm)/farm/_components/ui';

/**
 * Accept a supplier invitation (Roadmap P1b, P4): suppliers join by a link MicroFarm sends from the
 * supplier's record. The UI surface only: invitations, the verification email and the
 * admin notification are not connected yet.
 */
export default function SupplierWelcomePage() {
  return (
    <>
      <PageHeader
        title="Welcome, supplier"
        purpose="Confirm your contact details to accept MicroFarm's invitation to the Supplier Portal."
        status="designed"
      />
      <Card title="Your contact details">
        <div className="grid gap-[0.7rem] max-w-144">
          <label className="farm-kpi-sub">Operation<br /><input className="farm-input w-full!" disabled placeholder="Set by the invitation" /></label>
          <label className="farm-kpi-sub">Your name<br /><input className="farm-input w-full!" /></label>
          <label className="farm-kpi-sub">Email<br /><input type="email" className="farm-input w-full!" /></label>
          <label className="farm-kpi-sub">Phone<br /><input type="tel" className="farm-input w-full!" /></label>
          <button type="button" className="farm-btn primary" disabled>Accept invitation</button>
        </div>
        <p className="farm-kpi-sub mt-3">
          Your contact details are kept on your operation&rsquo;s record at MicroFarm — the same record our staff
          work from. We send a verification email, and staff are told when you join. Supplier submissions are
          reviewed by staff before they are committed to production. Please call the farm for faster service.
        </p>
        <p className="farm-kpi-sub mt-2">Already have an account? <Link className="farm-link" href="/farm/supplier-portal/sign-in">Sign in</Link>.</p>
      </Card>
    </>
  );
}
