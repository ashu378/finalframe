import { cache } from 'react';
import { makeFunctionReference } from 'convex/server';
import { redirect } from 'next/navigation';
import { api } from '../../../convex/_generated/api';
import { requireAuth } from './index';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import type { PlatformRole } from '@/lib/platform-admin/contracts';

const roleQuery = makeFunctionReference<'query', {}, { userId: string; role: PlatformRole } | null>('platformAdministration:currentRole');

const readPlatformRole = cache(async () => {
  await requireAuth();
  return (await getAuthenticatedConvexClient()).query(roleQuery, {});
});

/** Platform roles are explicit grants; studio ownership is never consulted. */
export async function requirePlatformRole(allowed: readonly PlatformRole[] = ['ADMIN', 'SUPPORT', 'MODERATOR']) {
  const role = await readPlatformRole();
  if (!role || !allowed.includes(role.role)) redirect('/dashboard');
  return role;
}

/** Studio operations retain their independent verified membership guard. */
export async function requireStudioAdmin() {
  const { user } = await requireAuth();
  const current = await (await getAuthenticatedConvexClient()).query(api.account.current, {});
  if (!current.studio || (current.role !== 'owner' && current.role !== 'admin')) redirect('/dashboard');
  return { user, studio: current.studio, role: current.role };
}
