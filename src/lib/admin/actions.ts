'use server';

import { api } from '../../../convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import { requireAdmin } from '@/lib/guards';

export async function getAdminOperations() {
  const client = await getAuthenticatedConvexClient();
  return client.query(api.app.adminOperations, {});
}

/**
 * Development-only maintenance action. Convex performs the final admin and
 * feature-flag checks, so this cannot be used as a public credit endpoint.
 */
export async function grantDevelopmentTestCredits(input: {
  amount: number;
  reason: string;
  idempotencyKey: string;
}) {
  const profile = await requireAdmin();
  const client = await getAuthenticatedConvexClient();
  const current = await client.query(api.account.current, {});
  const studioExternalId = current.studio?.externalId ?? profile.studio_name;
  if (!studioExternalId) throw new Error('No studio is associated with the admin account.');
  try {
    return await client.mutation(api.credits.grantTestCredits, {
      studioExternalId,
      amount: input.amount,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
    });
  } catch {
    throw new Error('Test credits could not be granted. Check the development flag and admin access.');
  }
}
