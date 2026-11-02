/** Internal-only mutation to exercise administrative revocation guards on an
 * isolated online test profile. This is not a product revocation endpoint. */
import { internalMutation } from './_generated/server';
import { v } from 'convex/values';
export const revokeFixture = internalMutation({
  args: { fixtureKey: v.string(), voiceId: v.id('voices') }, returns: v.null(),
  handler: async (ctx, args) => {
    if (process.env.FINALFRAME_GENERATION_WORKER_ENABLED === 'true' || process.env.FINALFRAME_DEV_FIXTURES !== 'true' || process.env.FINALFRAME_DEV_FIXTURE_ENV !== 'development' || !process.env.FINALFRAME_DEV_FIXTURE_KEY || args.fixtureKey !== process.env.FINALFRAME_DEV_FIXTURE_KEY) throw new Error('Private development fixture configuration is required.');
    const voice = await ctx.db.get(args.voiceId);
    const project = voice ? await ctx.db.get(voice.projectId) : null;
    if (!voice || voice.kind !== 'STOCK' || !project || project.deletedAt || project.projectType !== 'STOCK_VOICE_TEST' || !project.name.startsWith('finalframe-stock-voice-test-')) throw new Error('An isolated stock voice fixture is required.');
    await ctx.db.patch(voice._id, { status: 'REVOKED', revokedAt: Date.now(), updatedAt: Date.now() });
    return null;
  },
});
