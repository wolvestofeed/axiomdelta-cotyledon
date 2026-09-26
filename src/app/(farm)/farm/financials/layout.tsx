import { getFarmAccess } from '@/server/access';
import { AdminOnlyNotice } from '@/components/AdminOnly';
import { withWorkspace } from '@/server/workspace';

/**
 * Financials & Accounting are admin-only (Roadmap O5). The server pages here
 * gate on their own before loading anything; this layout covers the client
 * pages (Unit Economics, P&L, Capital & Financing), which read the scenario
 * store and load no server data of their own.
 */
export default async function FinancialsLayout(props: Parameters<typeof FinancialsLayoutInner>[0]) {
  return withWorkspace(() => FinancialsLayoutInner(props));
}

async function FinancialsLayoutInner({ children }: { children: React.ReactNode }) {
  const access = await getFarmAccess();
  if (!access.isSuperAdmin) return <AdminOnlyNotice area="Financials & Accounting" />;
  return <>{children}</>;
}
