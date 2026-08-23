import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { requireIdentity } from './identity';
import { requireMember } from './authorization';

const now = () => Date.now();

export const create = mutation({
  args: { name: v.string(), description: v.string(), contentType: v.string(), outcomeGoal: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const studio = await ctx.db.query('studios').withIndex('by_owner', q => q.eq('ownerExternalId', identity.externalId)).first();
    if (!studio) throw new Error('Create your studio before starting a video.');
    const externalId = `project_${identity.subject}_${Date.now()}`;
    const project = await ctx.db.insert('projects', { externalId, studioExternalId: studio.externalId, studioId: studio._id, name: args.name, description: args.description, status: 'DRAFT', metadata: { contentType: args.contentType, outcomeGoal: args.outcomeGoal }, createdByExternalId: identity.externalId, createdAt: now(), updatedAt: now() });
    return { projectId: project, externalId, studioId: studio._id, studioExternalId: studio.externalId };
  },
});

export const list = query({
  args: { studioExternalId: v.string() },
  handler: async (ctx, args) => { await requireMember(ctx, args.studioExternalId); return await ctx.db.query('projects').withIndex('by_studio', q => q.eq('studioExternalId', args.studioExternalId)).order('desc').collect(); },
});
