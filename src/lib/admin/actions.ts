'use server';

import { api } from '../../../convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';

export async function getAdminOperations() {
  const client = await getAuthenticatedConvexClient();
  return client.query(api.app.adminOperations, {});
}
