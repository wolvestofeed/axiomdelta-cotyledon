import { getMuseAccess } from '../_lib/access';
import { AdminOnlyNotice } from '../_components/AdminOnly';

/**
 * Financials & Accounting are admin-only (Roadmap O5). The server pages here
 * gate on their own before loading anything; this layout covers the client
 * pages (Unit Economics, P&L, Capital & Financing), which read the scenario
 * store and load no server data of their own.
 */
export default async function FinancialsLayout({ children }: { children: React.ReactNode }) {
  const access = await getMuseAccess();
  if (!access.isSuperAdmin) return <AdminOnlyNotice area="Financials & Accounting" />;
  return <>{children}</>;
}
