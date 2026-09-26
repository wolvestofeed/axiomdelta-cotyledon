import 'server-only';
import { and, eq } from 'drizzle-orm';
import { farmStaff } from '@/db';
import { db } from '@/lib/db';

/**
 * MicroFarm — a sign-in matched to the staff register (Roadmap O5).
 *
 * An active person on the register whose email is the signed-in user's primary
 * email holds the operator role and sees their own record. Emails are stored
 * lowercased. A failed lookup grants nothing.
 */
export async function activeStaffByEmail(email: string): Promise<{ id: string; roles: string[] } | null> {
  try {
    const rows = await db
      .select({ id: farmStaff.id, roles: farmStaff.roles })
      .from(farmStaff)
      .where(and(eq(farmStaff.email, email.toLowerCase()), eq(farmStaff.status, 'active')))
      .limit(1);
    return rows[0] ?? null;
  } catch {
    return null;
  }
}
