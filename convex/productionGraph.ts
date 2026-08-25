import { query } from "./_generated/server";
import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { getProduction } from "./_shared";

type GraphCtx = QueryCtx;

function friendlyState(status: string | undefined): "ready" | "working" | "needsApproval" | "outdated" | "failed" | "blocked" | "locked" {
  switch (status) {
    case "COMPLETED":
    case "APPROVED":
    case "READY":
    case "ACTIVE":
      return "ready";
    case "QUEUED":
    case "PROCESSING":
    case "SUBMITTED":
    case "POLLING":
    case "IN_PROGRESS":
      return "working";
    case "FAILED":
    case "CANCELLED":
    case "CANCELED":
      return "failed";
    case "SUPERSEDED":
      return "outdated";
    case "LOCKED":
      return "locked";
    default:
      return "needsApproval";
  }
}

function node(id: string, kind: string, label: string, state: ReturnType<typeof friendlyState>, resourceType: string, resourceId: string, detail?: string) {
  return { id, kind, label, state, resourceType, resourceId, detail };
}

function edge(id: string, source: string, target: string, kind: string) {
  return { id, source, target, kind };
}

async function buildGraph(ctx: GraphCtx, production: Doc<"productions">) {
  const nodes: ReturnType<typeof node>[] = [];
  const edges: ReturnType<typeof edge>[] = [];
  const addNode = (...args: Parameters<typeof node>) => nodes.push(node(...args));
  const addEdge = (...args: Parameters<typeof edge>) => edges.push(edge(...args));

  const productionNodeId = `production:${production._id}`;
  addNode(productionNodeId, "production", "Video project", friendlyState(production.status), "productions", production._id, production.workflow.replaceAll("_", " ").toLowerCase());

  if (production.currentPlanId) {
    const plan = await ctx.db.get(production.currentPlanId);
    if (plan) {
      const planNodeId = `plan:${plan._id}`;
      addNode(planNodeId, "plan", "Plan", friendlyState(plan.status), "directorPlans", plan._id, "Creative direction and ordered video plan");
      addEdge(`contains:${productionNodeId}:${planNodeId}`, productionNodeId, planNodeId, "contains");
    }
  }

  if (production.currentVersionId) {
    const version = await ctx.db.get(production.currentVersionId);
    if (version) {
      const versionNodeId = `version:${version._id}`;
      addNode(versionNodeId, "productionVersion", `Version ${version.versionNumber}`, friendlyState(version.status), "productionVersions", version._id, "Approved production snapshot");
      addEdge(`contains:${productionNodeId}:${versionNodeId}`, productionNodeId, versionNodeId, "contains");

      const sequences = (await ctx.db.query("sequences").withIndex("by_version", (q) => q.eq("productionVersionId", version._id)).collect()).sort((a, b) => a.orderIndex - b.orderIndex);
      for (const sequence of sequences) {
        const sequenceNodeId = `sequence:${sequence._id}`;
        addNode(sequenceNodeId, "sequence", sequence.title, friendlyState(sequence.status), "sequences", sequence._id, sequence.description);
        addEdge(`contains:${versionNodeId}:${sequenceNodeId}`, versionNodeId, sequenceNodeId, "contains");

        const scenes = (await ctx.db.query("scenes").withIndex("by_sequence", (q) => q.eq("sequenceId", sequence._id)).collect()).sort((a, b) => a.orderIndex - b.orderIndex);
        for (const scene of scenes) {
          const sceneNodeId = `scene:${scene._id}`;
          addNode(sceneNodeId, "scene", scene.title, friendlyState(scene.status), "scenes", scene._id, scene.purpose);
          addEdge(`contains:${sequenceNodeId}:${sceneNodeId}`, sequenceNodeId, sceneNodeId, "contains");

          const shots = (await ctx.db.query("shots").withIndex("by_scene", (q) => q.eq("sceneId", scene._id)).collect()).sort((a, b) => a.orderIndex - b.orderIndex);
          for (const shot of shots) {
            const shotNodeId = `shot:${shot._id}`;
            addNode(shotNodeId, "shot", shot.title, friendlyState(shot.status), "shots", shot._id, `${shot.durationSeconds}s take`);
            addEdge(`contains:${sceneNodeId}:${shotNodeId}`, sceneNodeId, shotNodeId, "contains");

            const versions = await ctx.db.query("shotVersions").withIndex("by_shot", (q) => q.eq("shotId", shot._id)).collect();
            const latest = versions.sort((a, b) => b.versionNumber - a.versionNumber)[0];
            if (latest) {
              const takeNodeId = `take:${latest._id}`;
              addNode(takeNodeId, "videoTake", `Take ${latest.versionNumber}`, friendlyState(latest.status), "shotVersions", latest._id, latest.model ? `Generated with ${latest.model}` : "Awaiting a generated take");
              addEdge(`feeds:${shotNodeId}:${takeNodeId}`, shotNodeId, takeNodeId, "feeds");
              if (latest.assetId) {
                const asset = await ctx.db.get(latest.assetId);
                if (asset) {
                  const assetNodeId = `asset:${asset._id}`;
                  addNode(assetNodeId, "image", asset.name || "Generated media", friendlyState(asset.lifecycle), "assets", asset._id, asset.mimeType || "Media");
                  addEdge(`derived:${takeNodeId}:${assetNodeId}`, takeNodeId, assetNodeId, "derivedFrom");
                }
              }
            }
          }
        }
      }
    }
  }

  const timelines = (await ctx.db.query("timelines").withIndex("by_production", (q) => q.eq("productionId", production._id)).collect()).sort((a, b) => b.versionNumber - a.versionNumber);
  const latestTimeline = timelines[0];
  if (latestTimeline) {
    const timelineNodeId = `timeline:${latestTimeline._id}`;
    addNode(timelineNodeId, "timeline", `Edit version ${latestTimeline.versionNumber}`, friendlyState(latestTimeline.status), "timelines", latestTimeline._id, `${latestTimeline.durationSeconds}s timeline`);
    addEdge(`placed:${productionNodeId}:${timelineNodeId}`, productionNodeId, timelineNodeId, "placedOn");
  }

  const reviews = (await ctx.db.query("reviews").withIndex("by_production", (q) => q.eq("productionId", production._id)).collect()).sort((a, b) => b.createdAt - a.createdAt);
  const review = reviews[0];
  if (review) {
    const reviewNodeId = `review:${review._id}`;
    addNode(reviewNodeId, "review", "Review", friendlyState(review.status), "reviews", review._id, "Comments, approval, and requested changes");
    addEdge(`reviewed:${productionNodeId}:${reviewNodeId}`, productionNodeId, reviewNodeId, "reviewedBy");
  }

  const exports = (await ctx.db.query("exports").withIndex("by_production", (q) => q.eq("productionId", production._id)).collect()).sort((a, b) => b.createdAt - a.createdAt);
  const exportRecord = exports[0];
  if (exportRecord) {
    const exportNodeId = `export:${exportRecord._id}`;
    addNode(exportNodeId, "export", "Download", friendlyState(exportRecord.status), "exports", exportRecord._id, exportRecord.mimeType || "Final export");
    addEdge(`renders:${productionNodeId}:${exportNodeId}`, productionNodeId, exportNodeId, "rendersTo");
  }

  return {
    production,
    nodes,
    edges,
    summary: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      hasPlan: Boolean(production.currentPlanId),
      hasVersion: Boolean(production.currentVersionId),
      hasTimeline: Boolean(latestTimeline),
      hasReview: Boolean(review),
      hasExport: Boolean(exportRecord),
    },
  };
}

export const get = query({
  args: { productionId: v.id("productions") },
  handler: async (ctx, args) => buildGraph(ctx, await getProduction(ctx, args.productionId.toString())),
});

export const getByProject = query({
  args: { projectExternalId: v.string() },
  handler: async (ctx, args) => {
    const production = await ctx.db.query("productions").withIndex("by_project", (q) => q.eq("externalProjectId", args.projectExternalId)).unique();
    if (!production) return null;
    return buildGraph(ctx, await getProduction(ctx, production._id.toString()));
  },
});
