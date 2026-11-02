import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireMember, requireProjectAccess } from './authorization';
import { createProjectForMember } from './projects';
import { getStarterTemplate, STARTER_TEMPLATES } from '../src/lib/templates/catalog';

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function savedIds(metadata: unknown) {
  const ids = metadataRecord(metadata).savedTemplateIds;
  return Array.isArray(ids) ? STARTER_TEMPLATES.filter((entry) => ids.includes(entry.id)).map((entry) => entry.id) : [];
}

export const list = query({
  args: { studioExternalId: v.string() },
  returns: v.array(v.object({ id: v.string(), saved: v.boolean() })),
  handler: async (ctx, args) => {
    const { studio } = await requireMember(ctx, args.studioExternalId);
    const saved = savedIds(studio.metadata);
    return STARTER_TEMPLATES.map((entry) => ({ id: entry.id, saved: saved.includes(entry.id) }));
  },
});

export const setSaved = mutation({
  args: { studioExternalId: v.string(), templateId: v.string(), saved: v.boolean() },
  returns: v.object({ saved: v.boolean() }),
  handler: async (ctx, args) => {
    const { studio } = await requireMember(ctx, args.studioExternalId);
    if (!getStarterTemplate(args.templateId)) throw new Error('Choose an available template.');
    const ids = new Set(savedIds(studio.metadata));
    if (args.saved) ids.add(args.templateId); else ids.delete(args.templateId);
    await ctx.db.patch(studio._id, { metadata: { ...metadataRecord(studio.metadata), savedTemplateIds: [...ids], savedTemplateVersions: Object.fromEntries(STARTER_TEMPLATES.filter((entry) => ids.has(entry.id)).map((entry) => [entry.id, entry.version])) }, updatedAt: Date.now() });
    return { saved: args.saved };
  },
});

export const createProject = mutation({
  args: { studioExternalId: v.string(), templateId: v.string(), projectName: v.string(), requestId: v.string() },
  returns: v.object({ projectId: v.id('projects'), externalId: v.string(), replayed: v.boolean() }),
  handler: async (ctx, args) => {
    const member = await requireMember(ctx, args.studioExternalId);
    const template = getStarterTemplate(args.templateId);
    if (!template) throw new Error('Choose an available template.');
    const name = args.projectName.trim();
    if (!name || name.length > 200) throw new Error('Use a project name between 1 and 200 characters.');
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(args.requestId)) throw new Error('A valid creation request is required.');
    const externalId = `template_${member.studio._id}_${member.user._id}_${args.requestId}`;
    const existing = await ctx.db.query('projects').withIndex('by_external_id', (q) => q.eq('externalId', externalId)).unique();
    if (existing) {
      // Replaying a receipt never bypasses current project membership.
      await requireProjectAccess(ctx, existing._id);
      const metadata = metadataRecord(existing.metadata);
      const creation = metadataRecord(metadata.templateCreationInput);
      const matchesOriginalInput = Object.keys(creation).length ? creation.templateId === template.id && creation.projectName === name && creation.createdByUserId === member.user._id && creation.requestId === args.requestId : existing.name === name;
      if (existing.studioExternalId !== member.studio.externalId || existing.createdByUserId !== member.user._id || metadata.templateId !== template.id || !matchesOriginalInput) throw new Error('This creation request already belongs to another project.');
      if (existing.deletedAt !== undefined || existing.archivedAt !== undefined || existing.status === 'DELETED' || existing.status === 'ARCHIVED') throw new Error('This project is inactive. Start a new template project.');
      return { projectId: existing._id, externalId, replayed: true };
    }
    const project = await createProjectForMember(ctx, {
      name, description: template.brief, projectType: template.videoType,
      contentType: template.category === 'ugc' ? 'ugc' : template.category === 'explainer' ? 'explainer' : 'commercial',
    }, {
      studioExternalId: member.studio.externalId, externalId,
      metadata: { videoType: template.videoType, templateId: template.id, templateVersion: template.version, templateDefaults: { ...template }, templateCreationInput: { templateId: template.id, templateVersion: template.version, projectName: name, requestId: args.requestId, createdByUserId: member.user._id } },
    });
    return { projectId: project.projectId, externalId, replayed: false };
  },
});
