/** Private online-only transaction verification. No adapter import or provider request. */
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import type { FunctionReference } from 'convex/server';
import { v } from 'convex/values';
import { object, workerEnabled } from './generationWorkerContracts';
const modules = internal as unknown as Record<string, Record<string, FunctionReference<any, 'internal', any, any>>>;
function guard(key: string) {
  if (workerEnabled() || process.env.FINALFRAME_DEV_FIXTURES !== 'true' || process.env.FINALFRAME_DEV_FIXTURE_ENV !== 'development' || !process.env.FINALFRAME_DEV_FIXTURE_KEY || key !== process.env.FINALFRAME_DEV_FIXTURE_KEY) throw new Error('Private online fixture configuration is required.');
}
export const convertFixture = internalMutation({
  args: { fixtureKey: v.string(), jobId: v.id('generationJobs'), storageId: v.id('_storage') }, returns: v.null(),
  handler: async (ctx, args) => {
    guard(args.fixtureKey); const job = await ctx.db.get(args.jobId);
    if (!job?.projectId || job.provider !== 'fixture' || object(job.request).fixtureMarker !== 'finalframe-worker-online-verification-v1' || !job.studioExternalId.startsWith('creator-worker-verification-')) throw new Error('Isolated fixture required.');
    const assetId = await ctx.db.insert('assets', { studioExternalId: job.studioExternalId, studioId: job.studioId, projectId: job.projectId, productionId: job.productionId, scope: 'PROJECT', storageId: args.storageId, source: 'FIXTURE', mimeType: 'audio/wav', roles: ['RECORDING'], metadata: { fixtureOnly: true }, createdAt: Date.now() });
    await ctx.db.patch(job._id, { operation: 'PREPARATION', modality: 'TEXT', capability: 'TRANSCRIPTION', shotId: undefined, shotVersionId: undefined, request: { fixtureMarker: 'finalframe-worker-online-verification-v1', preparationKind: 'TRANSCRIPT', sourceAssetId: assetId, referenceAssetIds: [assetId] } });
    return null;
  },
});
export const inspect = internalQuery({
  args: { fixtureKey: v.string(), jobId: v.id('generationJobs') }, returns: v.any(),
  handler: async (ctx, args) => {
    guard(args.fixtureKey); const job = await ctx.db.get(args.jobId);
    if (!job || job.provider !== 'fixture' || object(job.request).fixtureMarker !== 'finalframe-worker-online-verification-v1') throw new Error('Isolated fixture required.');
    const transcripts = await ctx.db.query('transcripts').withIndex('by_production', q => q.eq('productionId', job.productionId)).take(20);
    const entries = job.canonicalReservationId ? await ctx.db.query('ledger').withIndex('by_reservation', q => q.eq('reservationId', job.canonicalReservationId)).take(20) : [];
    return { job, transcripts, entries };
  },
});
export const run = internalAction({
  args: { fixtureKey: v.string(), runId: v.string() }, returns: v.any(),
  handler: async (ctx, args): Promise<any> => {
    guard(args.fixtureKey); const fixture = await ctx.runMutation(modules.devFixtures.seedGenerationWorkerVerification, args);
    const jobId = fixture.jobIds[0]; const checked: string[] = [];
    function assert(condition: unknown, label: string) { if (!condition) throw new Error(`Preparation verification: ${label}`); checked.push(label); }
    try {
      // Valid minimal empty PCM WAV header: fixture only, never billed or advertised as generated speech.
      const wave = new ArrayBuffer(44); const view = new DataView(wave); const bytes = new Uint8Array(wave);
      for (const [offset, value] of [[0, 'RIFF'], [8, 'WAVE'], [12, 'fmt '], [36, 'data']] as const) for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i);
      view.setUint32(4, 36, true); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 8000, true); view.setUint32(28, 16000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
      const storageId = await ctx.storage.store(new Blob([wave], { type: 'audio/wav' }));
      await ctx.runMutation(modules.preparationVerification.convertFixture, { fixtureKey: args.fixtureKey, jobId, storageId });
      const claimed = await ctx.runMutation(modules.generationWorkerVerification.claimFixture, { fixtureKey: args.fixtureKey, jobId });
      assert(claimed.claimed, 'preparation uses the same exclusive generation lease');
      const lease = { jobId, leaseId: claimed.leaseId };
      const fenced = await ctx.runMutation(modules.generationJobs.fenceSubmission, lease);
      assert(fenced.allowed, 'preparation uses the same pre-submit reservation fence');
      const result = { ...lease, actualModel: 'fixture/no-network', text: 'Private online transcript fixture.', segments: [], providerCostUsd: 0, providerRequestId: 'fixture-preparation-no-provider' };
      await ctx.runMutation(modules.generationJobs.completePreparation, result);
      await ctx.runMutation(modules.generationJobs.completePreparation, result);
      const state = await ctx.runQuery(modules.preparationVerification.inspect, { fixtureKey: args.fixtureKey, jobId });
      assert(state.job.status === 'COMPLETED' && !state.job.shotVersionId, 'non-shot preparation completes without creating a take');
      assert(state.transcripts.length === 1 && state.transcripts[0].segments.text === result.text, 'transcription stores one durable project source relationship');
      assert(state.entries.filter((entry: { entryType: string }) => entry.entryType === 'COMMIT').length === 1, 'duplicate completion settles one credit reservation');
      assert(!(await ctx.runMutation(modules.generationWorkerVerification.claimFixture, { fixtureKey: args.fixtureKey, jobId })).claimed, 'completed preparation cannot be purchased again');
      return { ok: true, checks: checked, liveProviderCalls: 0, fixture };
    } finally {
      await ctx.runMutation(modules.generationWorkerVerification.closeFixtureBudget, { fixtureKey: args.fixtureKey, jobIds: fixture.jobIds });
    }
  },
});
