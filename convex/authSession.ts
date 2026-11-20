import type { QueryCtx, MutationCtx } from './_generated/server';

/** A valid JWT is not enough after reset/sign-out has revoked its session. */
export async function hasActiveSession(ctx: Pick<QueryCtx | MutationCtx, 'auth' | 'db'>) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return false;
  const [userId, rawSessionId] = identity.subject.split('|');
  if (!userId || !rawSessionId) return false;
  const sessionId = ctx.db.normalizeId('authSessions', rawSessionId);
  if (!sessionId) return false;
  const session = await ctx.db.get(sessionId);
  return !!session && session.userId === userId && session.expirationTime > Date.now();
}
