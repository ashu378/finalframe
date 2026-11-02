import { internalMutation } from "../_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

/** Additive legacy ownership repair. A studio role alone is never converted
 * to access: both the recorded creator and studio owner must resolve to the
 * same stable, already-provisioned identity. Ambiguous rows are reported. */
export const backfill = internalMutation({
  args: { paginationOpts: paginationOptsValidator, dryRun: v.boolean() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("projects").paginate(args.paginationOpts);
    const repaired: string[] = [];
    const unmapped: string[] = [];
    for (const project of page.page) {
      if (project.ownerUserId) continue;
      const creator = project.createdByExternalId?.split("|")[0];
      const studio = await ctx.db.query("studios").withIndex("by_external_id", (q) => q.eq("externalId", project.studioExternalId)).unique();
      const user = creator ? await ctx.db.query("users").withIndex("by_auth_subject", (q) => q.eq("authSubject", creator)).unique()
        ?? await ctx.db.query("users").withIndex("by_external_id", (q) => q.eq("externalId", creator)).unique() : null;
      if (!creator || !user || !studio || studio.ownerExternalId.split("|")[0] !== creator) { unmapped.push(project._id); continue; }
      repaired.push(project._id);
      if (args.dryRun) continue;
      const timestamp = Date.now();
      await ctx.db.patch(project._id, { ownerUserId: user._id, createdByUserId: project.createdByUserId ?? user._id, updatedAt: timestamp });
      const member = await ctx.db.query("projectMembers").withIndex("by_project_user", (q) => q.eq("projectId", project._id).eq("userId", user._id)).unique();
      if (!member) await ctx.db.insert("projectMembers", { projectId: project._id, userId: user._id, role: "OWNER", status: "ACTIVE", createdAt: timestamp, updatedAt: timestamp });
      // Explicit suspended/removed memberships are never reactivated.
      const studioMember = await ctx.db.query("members").withIndex("by_studio_user", (q) => q.eq("studioId", studio._id).eq("userId", user._id)).unique();
      if (!studioMember) await ctx.db.insert("members", { studioId: studio._id, userId: user._id, role: "owner", status: "active", createdAt: timestamp, updatedAt: timestamp });
      await ctx.db.insert("audit", { studioExternalId: studio.externalId, studioId: studio._id, actorExternalId: "migration:project-ownership-v1", action: "PROJECT_OWNER_BACKFILLED", entityType: "project", entityId: project._id, metadata: { ownerUserId: user._id, policy: "matching-recorded-creator-and-studio-owner" }, createdAt: timestamp });
    }
    return { repaired, unmapped, dryRun: args.dryRun, isDone: page.isDone, continueCursor: page.continueCursor };
  },
});
