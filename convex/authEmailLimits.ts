import { internalMutation } from './_generated/server';
import { v } from 'convex/values';
import { checkSendLimit } from '../src/lib/auth/email-policy';

// Invoked only by the password provider before it creates/replaces an OTP.
export const consume = internalMutation({
  args: { identifierHash: v.string() }, returns: v.null(),
  handler: async (ctx, { identifierHash }) => {
    if (!/^[a-f0-9]{64}$/.test(identifierHash)) throw new Error('Invalid mail request.');
    const now = Date.now();
    for (const key of [identifierHash, 'global']) {
      const row = await ctx.db.query('authEmailSendLimits').withIndex('by_key', q => q.eq('key', key)).unique();
      const next = checkSendLimit(row, now, key === 'global');
      if (row) await ctx.db.patch(row._id, next);
      else await ctx.db.insert('authEmailSendLimits', { key, ...next });
    }
    return null;
  },
});
