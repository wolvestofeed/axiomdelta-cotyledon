'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { accessRefusal, requireFarmSuperAdmin } from '@/server/access';
import { approveStandardVersion, type StandardApproval } from '@/server/standard-approval';
import { withWorkspace } from '@/server/workspace';

/**
 * MicroFarm — approving a standard-cost version (Roadmap J5) from the Grow plans page. Super admin
 * only; the approval itself is `standard-approval.ts`, which a time study's approval also runs.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

const ApproveInput = z.object({
  growPlanCode: z.string().min(1),
  effectiveFrom: isoDate,
  notes: z.string().max(400).nullable().default(null),
});

export async function approveStandard(...args: Parameters<typeof approveStandardInner>): ReturnType<typeof approveStandardInner> {
  return withWorkspace(() => approveStandardInner(...args));
}

async function approveStandardInner(input: unknown): Promise<StandardApproval> {
  const parsed = ApproveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  let access;
  try {
    access = await requireFarmSuperAdmin();
  } catch (e) {
    const refused = accessRefusal(e);
    if (refused) return refused;
    throw e;
  }
  const result = await approveStandardVersion(access, parsed.data);
  if (result.ok) revalidatePath('/farm', 'layout');
  return result;
}
