import { query } from "./_generated/server";
import { selectProjectProduction } from "./projectProductions";
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
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

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
      const versionDetail = version.status === "DRAFT" ? "Editable planning snapshot" : "Immutable approved production snapshot";
      addNode(versionNodeId, "productionVersion", `Version ${version.versionNumber}`, friendlyState(version.status), "productionVersions", version._id, versionDetail);
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

  const timelinePage = await ctx.db.query("timelines").withIndex("by_production", (q) => q.eq("productionId", production._id)).order('desc').take(201);
  const timelines = timelinePage.slice(0,200).sort((a, b) => b.versionNumber - a.versionNumber);
  const manifests = new Map<string, Doc<'manifests'> | null>();
  async function ownedManifest(id: string | undefined) {
    if(!id)return null;
    if(manifests.has(id))return manifests.get(id)??null;
    const manifest=await ctx.db.get(id as Doc<'manifests'>['_id']);
    const payload=record(manifest?.manifest);
    const valid=manifest&&manifest.productionId===production._id&&manifest.projectId===production.projectId&&manifest.studioExternalId===production.studioExternalId&&payload.productionId===production._id&&payload.projectId===production.projectId;
    manifests.set(id,valid?manifest:null);return valid?manifest:null;
  }
  async function timelineVersion(timeline: Doc<'timelines'>) {
    if(timeline.productionId!==production._id||timeline.studioExternalId!==production.studioExternalId||timeline.projectId&&timeline.projectId!==production.projectId)return null;
    const tracks=record(timeline.tracks),metadata=record(tracks.metadata);
    const ids=[tracks.productionVersionId,metadata.productionVersionId].filter((id):id is string=>typeof id==='string'&&id.length>0);
    if(timeline.manifestId){const manifest=await ownedManifest(timeline.manifestId);const id=record(manifest?.manifest).productionVersionId;if(!manifest||typeof id!=='string')return null;ids.push(id);}
    if(!ids.length){
      const indexed=await ctx.db.query('manifests').withIndex('by_timeline',q=>q.eq('timelineId',timeline._id)).order('desc').take(2);
      for(const candidate of indexed){const manifest=await ownedManifest(candidate._id);const payload=record(manifest?.manifest);if(!manifest||payload.timelineId!==timeline._id||typeof payload.productionVersionId!=='string')return null;ids.push(payload.productionVersionId);}
    }
    return ids.length&&new Set(ids).size===1?ids[0]:null;
  }
  const currentTimelineIds=new Set<string>();
  for(const timeline of timelines)if(production.currentVersionId&&await timelineVersion(timeline)===production.currentVersionId)currentTimelineIds.add(timeline._id);
  const latestTimeline = timelines.find(timeline=>currentTimelineIds.has(timeline._id));
  if (latestTimeline) {
    const timelineNodeId = `timeline:${latestTimeline._id}`;
    addNode(timelineNodeId, "timeline", `Edit version ${latestTimeline.versionNumber}`, friendlyState(latestTimeline.status), "timelines", latestTimeline._id, `${latestTimeline.durationSeconds}s timeline`);
    addEdge(`placed:${productionNodeId}:${timelineNodeId}`, productionNodeId, timelineNodeId, "placedOn");
  }

  const reviewPage = await ctx.db.query("reviews").withIndex("by_production", (q) => q.eq("productionId", production._id)).order('desc').take(201);
  const reviews = reviewPage.slice(0,200).sort((a, b) => b.createdAt - a.createdAt);
  async function currentManifest(id: string | undefined) {
    const manifest=await ownedManifest(id),payload=record(manifest?.manifest);
    return manifest&&production.currentVersionId&&payload.productionVersionId===production.currentVersionId&&typeof payload.timelineId==='string'&&currentTimelineIds.has(payload.timelineId)?manifest:null;
  }
  let review: Doc<'reviews'> | undefined;
  for(const candidate of reviews){const manifest=await currentManifest(candidate.manifestId);if(manifest&&candidate.timelineId===record(manifest.manifest).timelineId&&(!candidate.projectId||candidate.projectId===production.projectId)&&candidate.studioExternalId===production.studioExternalId){review=candidate;break;}}
  if (review) {
    const reviewNodeId = `review:${review._id}`;
    addNode(reviewNodeId, "review", "Review", friendlyState(review.status), "reviews", review._id, "Comments, approval, and requested changes");
    addEdge(`reviewed:${productionNodeId}:${reviewNodeId}`, productionNodeId, reviewNodeId, "reviewedBy");
  }

  const exportPage = await ctx.db.query("exports").withIndex("by_production", (q) => q.eq("productionId", production._id)).order('desc').take(201);
  const exports = exportPage.slice(0,200).sort((a, b) => b.createdAt - a.createdAt);
  let exportRecord: Doc<'exports'> | undefined;
  for(const candidate of exports){
    if(candidate.projectId&&candidate.projectId!==production.projectId||candidate.studioExternalId!==production.studioExternalId)continue;
    let manifestId=candidate.manifestId;
    if(!manifestId&&candidate.renderJobId){const job=await ctx.db.get(candidate.renderJobId);if(job?.productionId===production._id&&job.projectId===production.projectId)manifestId=job.manifestId;}
    if(await currentManifest(manifestId)){exportRecord=candidate;break;}
  }
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
      hasReview: review?.status==='APPROVED',
      hasExport: exportRecord?.status==='COMPLETED'&&Boolean(exportRecord.storageId),
      finishingHistoryLimited: timelinePage.length>200||reviewPage.length>200||exportPage.length>200,
    },
  };
}

export const get = query({
  args: { productionId: v.id("productions") },
  handler: async (ctx, args) => buildGraph(ctx, await getProduction(ctx, args.productionId.toString())),
});

export const getByProject = query({
  args: { projectExternalId: v.string(), productionId: v.optional(v.id("productions")) },
  handler: async (ctx, args) => {
    const project = await ctx.db.query("projects").withIndex("by_external_id", (q) => q.eq("externalId", args.projectExternalId)).unique();
    if (!project) return null;
    const production = await selectProjectProduction(ctx, project, args.productionId);
    if (!production) return null;
    return buildGraph(ctx, await getProduction(ctx, production._id.toString()));
  },
});
