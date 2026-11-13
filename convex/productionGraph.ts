import { query } from "./_generated/server";
import { selectProjectProduction } from "./projectProductions";
import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
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

async function buildGraph(ctx: GraphCtx, production: Doc<"productions">, requestedTimelineId?: Id<"timelines">, preferDraft = false) {
  // Authoring may show the exact current draft while approved finishing keeps
  // the persisted currentVersionId. Never rewrite either pointer in a read.
  let selectedVersionId = production.currentVersionId;
  let selectedVersion = selectedVersionId ? await ctx.db.get(selectedVersionId) : null;
  if (selectedVersion && selectedVersion.productionId !== production._id) throw new Error('Production version is unavailable.');
  if (preferDraft && production.currentPlanId) {
    const plan = await ctx.db.get(production.currentPlanId);
    if (!plan || plan.productionId !== production._id || plan.studioExternalId && plan.studioExternalId !== production.studioExternalId || record(plan).projectId && record(plan).projectId !== production.projectId) throw new Error('Current draft plan is unavailable.');
    const matches = await ctx.db.query('productionVersions').withIndex('by_source_plan', q => q.eq('sourcePlanId', production.currentPlanId!)).take(2);
    if (!matches.length && ['DRAFT','READY'].includes(plan.status)) throw new Error('Current draft version is unavailable.');
    if (matches.length > 1 || matches.some(version => version.productionId !== production._id || record(version).projectId && record(version).projectId !== production.projectId)) throw new Error('Current draft version is unavailable.');
    if (matches[0]?.status === 'DRAFT') { selectedVersion = matches[0]; selectedVersionId = selectedVersion._id; }
  }
  const viewContext = selectedVersion?.status === 'DRAFT' ? 'DRAFT' : selectedVersion?.status === 'APPROVED' ? 'APPROVED' : selectedVersion ? 'RETAINED' : 'UNPLANNED';
  const nodes: ReturnType<typeof node>[] = [];
  const edges: ReturnType<typeof edge>[] = [];
  const knownNodes = new Set<string>();
  const knownEdges = new Set<string>();
  const addNode = (...args: Parameters<typeof node>) => { if (!knownNodes.has(args[0])) { knownNodes.add(args[0]); nodes.push(node(...args)); } };
  let sourceHistoryLimited = false;
  let shownShots = 0;
  const activeOwned = (row: {status?:string;productionId?:Id<"productions">;projectId?:Id<"projects">;productionVersionId?:Id<"productionVersions">}) => !["ARCHIVED","DELETED"].includes(row.status??"") && row.productionId===production._id && (!row.productionVersionId||row.productionVersionId===selectedVersionId) && (!row.projectId||row.projectId===production.projectId);
  const ownedAssets = new Map<string, Doc<'assets'>>();
  const knownTakes = new Map<string, Doc<'shotVersions'>>();
  const denied = (value: unknown) => { const data = record(value); return data.approved === false || data.consent === false || ['REVOKED','DENIED','REJECTED','BLOCKED','QUARANTINED','RESTRICTED'].includes(String(data.status ?? data.state ?? value ?? '').toUpperCase()); };
  async function assetNode(id: Id<'assets'>) {
    const asset = ownedAssets.get(id) ?? await ctx.db.get(id);
    if (!asset || asset.projectId !== production.projectId || asset.studioExternalId !== production.studioExternalId || asset.scope !== 'PROJECT' || asset.deletedAt) return null;
    ownedAssets.set(id, asset);
    addNode(`asset:${id}`, 'image', asset.name || 'Project media', friendlyState(asset.lifecycle), 'assets', id, asset.mimeType || 'Media');
    return asset;
  }
  async function frameNode(frame: Doc<'storyboardFrames'>, shot: Doc<'shots'>, selected: boolean) {
    if(frame.shotId!==shot._id||frame.projectId!==production.projectId||frame.productionId!==production._id||frame.productionVersionId!==selectedVersionId||!await assetNode(frame.assetId))return false;
    addNode(`frame:${frame._id}`, 'imageEdit', `Storyboard frame${selected?' · selected':''}`, 'needsApproval', 'storyboardFrames', frame._id, selected?'Explicit visual guide for this shot':'Retained alternative composition; not automatically a shot');
    addEdge(`frame-asset:${frame._id}`,`asset:${frame.assetId}`,`frame:${frame._id}`,'derivedFrom');
    if(selected)addEdge(`frame-guide:${frame._id}:${shot._id}`,`frame:${frame._id}`,`shot:${shot._id}`,'references');
    return true;
  }
  async function addTake(shot: Doc<'shots'>, take: Doc<'shotVersions'>) {
    if (take.projectId !== production.projectId || take.productionId !== production._id || take.productionVersionId !== selectedVersionId || take.shotId !== shot._id || !activeOwned(shot) || shot.productionVersionId !== selectedVersionId) return;
    knownTakes.set(take._id, take);
    addNode(`shot:${shot._id}`, 'shot', shot.title, friendlyState(shot.status), 'shots', shot._id, `${shot.durationSeconds}s take`);
    const approval = production.projectId ? await ctx.db.query('resourceStates').withIndex('by_project_resource', q=>q.eq('projectId',production.projectId!).eq('resourceType','shotVersion').eq('resourceId',take._id)).unique() : null;
    const state = take.status === 'COMPLETED' ? approval?.state ?? 'DRAFT' : take.status;
    addNode(`take:${take._id}`, 'videoTake', `Take ${take.versionNumber}`, friendlyState(state), 'shotVersions', take._id, `${take.status.toLowerCase()}${take.model ? ` · ${take.model}` : ''} · selection belongs to an explicit edit`);
    addEdge(`feeds:${shot._id}:${take._id}`, `shot:${shot._id}`, `take:${take._id}`, 'feeds');
    if (take.assetId && await assetNode(take.assetId)) addEdge(`derived:${take.assetId}:${take._id}`, `asset:${take.assetId}`, `take:${take._id}`, 'derivedFrom');
    const consumed=record(record(take.contextSnapshot).storyboardSelection).frameId;
    if(typeof consumed==='string'){const id=ctx.db.normalizeId('storyboardFrames',consumed),frame=id?await ctx.db.get(id):null;if(frame&&await frameNode(frame,shot,record(record(shot.metadata).storyboard).frameId===consumed))addEdge(`frame-take:${frame._id}:${take._id}`,`frame:${frame._id}`,`take:${take._id}`,'references');}
  }
  const addEdge = (...args: Parameters<typeof edge>) => { if(!knownEdges.has(args[0])){knownEdges.add(args[0]);edges.push(edge(...args));} };

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

  if (selectedVersionId) {
    const version = selectedVersion;
    if (version) {
      const versionNodeId = `version:${version._id}`;
      const versionDetail = version.status === "DRAFT" ? "Editable planning snapshot" : "Immutable approved production snapshot";
      addNode(versionNodeId, "productionVersion", `Version ${version.versionNumber}`, friendlyState(version.status), "productionVersions", version._id, versionDetail);
      addEdge(`contains:${productionNodeId}:${versionNodeId}`, productionNodeId, versionNodeId, "contains");

      const sequencePage = await ctx.db.query("sequences").withIndex("by_version", (q) => q.eq("productionVersionId", version._id)).take(201);
      if(sequencePage.length>200)sourceHistoryLimited=true;
      const sequences = sequencePage.slice(0,200).filter(activeOwned).sort((a, b) => a.orderIndex - b.orderIndex);
      for (const sequence of sequences) {
        if(shownShots>=200){sourceHistoryLimited=true;break;}
        const sequenceNodeId = `sequence:${sequence._id}`;
        addNode(sequenceNodeId, "sequence", sequence.title, friendlyState(sequence.status), "sequences", sequence._id, sequence.description);
        addEdge(`contains:${versionNodeId}:${sequenceNodeId}`, versionNodeId, sequenceNodeId, "contains");

        const scenePage=await ctx.db.query("scenes").withIndex("by_sequence", (q) => q.eq("sequenceId", sequence._id)).take(201);
        if(scenePage.length>200)sourceHistoryLimited=true;
        const scenes = scenePage.slice(0,200).filter(activeOwned).sort((a, b) => a.orderIndex - b.orderIndex);
        for (const scene of scenes) {
          if(shownShots>=200){sourceHistoryLimited=true;break;}
          const sceneNodeId = `scene:${scene._id}`;
          addNode(sceneNodeId, "scene", scene.title, friendlyState(scene.status), "scenes", scene._id, scene.purpose);
          addEdge(`contains:${sequenceNodeId}:${sceneNodeId}`, sequenceNodeId, sceneNodeId, "contains");

          const shotPage=await ctx.db.query("shots").withIndex("by_scene", (q) => q.eq("sceneId", scene._id)).take(201);
          if(shotPage.length>200)sourceHistoryLimited=true;
          const shots = shotPage.slice(0,200).filter(activeOwned).sort((a, b) => a.orderIndex - b.orderIndex);
          for (const shot of shots) {
            if(shownShots>=200){sourceHistoryLimited=true;break;}shownShots++;
            const shotNodeId = `shot:${shot._id}`;
            addNode(shotNodeId, "shot", shot.title, friendlyState(shot.status), "shots", shot._id, `${shot.durationSeconds}s take`);
            addEdge(`contains:${sceneNodeId}:${shotNodeId}`, sceneNodeId, shotNodeId, "contains");

            const takePage = await ctx.db.query('shotVersions').withIndex('by_shot_version', q=>q.eq('shotId',shot._id)).order('desc').take(4);
            if (takePage.length > 3) sourceHistoryLimited = true;
            for (const take of takePage.slice(0,3)) await addTake(shot,take);
            const framePage = await ctx.db.query('storyboardFrames').withIndex('by_shot',q=>q.eq('shotId',shot._id)).order('desc').take(3);
            if (framePage.length > 2) sourceHistoryLimited = true;
            const selection = record(record(shot.metadata).storyboard);
            const frames=framePage.slice(0,2);
            if(typeof selection.frameId==='string'&&!frames.some(frame=>frame._id===selection.frameId)){const id=ctx.db.normalizeId('storyboardFrames',selection.frameId);const selected=id?await ctx.db.get(id):null;if(selected)frames.push(selected);}
            for (const frame of frames) await frameNode(frame,shot,selection.frameId===frame._id);
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
  for(const timeline of timelines)if(selectedVersionId&&await timelineVersion(timeline)===selectedVersionId)currentTimelineIds.add(timeline._id);
  let latestTimeline = timelines.find(timeline=>currentTimelineIds.has(timeline._id));
  if(requestedTimelineId){const requested=await ctx.db.get(requestedTimelineId);if(!requested||await timelineVersion(requested)!==selectedVersionId)throw new Error('Selected edit is unavailable for this production version.');latestTimeline=requested;}
  if (latestTimeline) {
    const timelineNodeId = `timeline:${latestTimeline._id}`;
    addNode(timelineNodeId, "timeline", `Edit version ${latestTimeline.versionNumber}`, friendlyState(latestTimeline.status), "timelines", latestTimeline._id, `${latestTimeline.durationSeconds}s timeline`);
    addEdge(`placed:${productionNodeId}:${timelineNodeId}`, productionNodeId, timelineNodeId, "placedOn");
    const clipPage=await ctx.db.query('timelineClips').withIndex('by_timeline',q=>q.eq('timelineId',latestTimeline!._id)).take(201);
    if(clipPage.length>200)sourceHistoryLimited=true;
    for(const clip of clipPage.slice(0,200)){
      if(clip.studioExternalId!==production.studioExternalId)continue;
      const clipNode=`clip:${clip._id}`;
      addNode(clipNode,'timeline',`Placed clip · ${clip.startSeconds}s`,'ready','timelineClips',clip._id,`${clip.durationSeconds}s · edit ${latestTimeline.versionNumber}`);
      addEdge(`clip-timeline:${clip._id}`,clipNode,timelineNodeId,'placedOn');
      if(clip.shotVersionId){const take=knownTakes.get(clip.shotVersionId)??await ctx.db.get(clip.shotVersionId);const shot=take?await ctx.db.get(take.shotId):null;
        if(take&&shot&&take.assetId===clip.assetId&&take.productionId===production._id&&take.projectId===production.projectId&&take.productionVersionId===selectedVersionId){await addTake(shot,take);addEdge(`take-clip:${take._id}:${clip._id}`,`take:${take._id}`,clipNode,'placedOn');const n=nodes.find(row=>row.id===`take:${take._id}`);if(n)n.detail=`${n.detail ?? ''} · placed in edit ${latestTimeline.versionNumber}`;}}
      if(clip.assetId&&await assetNode(clip.assetId))addEdge(`asset-clip:${clip.assetId}:${clip._id}`,`asset:${clip.assetId}`,clipNode,'references');
    }
  }

  const reviewPage = await ctx.db.query("reviews").withIndex("by_production", (q) => q.eq("productionId", production._id)).order('desc').take(201);
  const reviews = reviewPage.slice(0,200).sort((a, b) => b.createdAt - a.createdAt);
  async function currentManifest(id: string | undefined) {
    const manifest=await ownedManifest(id),payload=record(manifest?.manifest);
    return manifest&&selectedVersionId&&payload.productionVersionId===selectedVersionId&&typeof payload.timelineId==='string'&&currentTimelineIds.has(payload.timelineId)?manifest:null;
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

  const project=production.projectId?await ctx.db.get(production.projectId):null;
  const external=project?.externalId??production.externalProjectId;
  const base=external?`/dashboard/projects/${encodeURIComponent(external)}/workspace`:null;
  const withLinks=await Promise.all(nodes.map(async current=>{
    if(!base)return current;
    const selected=`?production=${encodeURIComponent(production._id)}`;
    let artifactHref= ['production','plan','productionVersion'].includes(current.kind)?`/dashboard/projects/${encodeURIComponent(external!)}/blueprint${selected}`:current.resourceType==='timelines'?`${base}/edit${selected}&timeline=${encodeURIComponent(current.resourceId)}`:current.resourceType==='timelineClips'?`${base}/edit${selected}&timeline=${encodeURIComponent(latestTimeline!._id)}#clip-${encodeURIComponent(current.resourceId)}`:current.resourceType==='reviews'?`${base}/review${selected}`:current.resourceType==='exports'?`${base}/export${selected}`:current.resourceType==='shotVersions'?`${base}/takes${selected}#take-${encodeURIComponent(current.resourceId)}`:`${base}/storyboard${selected}#shot-${encodeURIComponent(current.resourceId)}`;
    const frame=current.resourceType==='storyboardFrames'?await ctx.db.get(current.resourceId as Id<'storyboardFrames'>):null;
    const assetId=current.resourceType==='assets'?current.resourceId:current.resourceType==='shotVersions'?knownTakes.get(current.resourceId)?.assetId:frame?.assetId;
    const asset=assetId?ownedAssets.get(assetId):undefined;
    if(asset&&asset.storageId&&![asset.rights,asset.provenance,asset.moderation].some(denied)){const url=await ctx.storage.getUrl(asset.storageId);if(url)artifactHref=url;}
    return {...current,artifactHref};
  }));
  return {
    production,
    nodes:withLinks,
    edges,
    summary: {
      selectedVersionId: selectedVersionId ?? null,
      selectedVersionStatus: selectedVersion?.status ?? null,
      selectedVersionNumber: selectedVersion?.versionNumber ?? null,
      viewContext,
      nodeCount: nodes.length,
      sourceHistoryLimited,
      edgeCount: edges.length,
      hasPlan: Boolean(production.currentPlanId),
      hasVersion: Boolean(selectedVersionId),
      hasTimeline: Boolean(latestTimeline),
      hasReview: review?.status==='APPROVED',
      hasExport: exportRecord?.status==='COMPLETED'&&Boolean(exportRecord.storageId),
      finishingHistoryLimited: timelinePage.length>200||reviewPage.length>200||exportPage.length>200,
    },
  };
}

export const get = query({
  args: { productionId: v.id("productions"), timelineId:v.optional(v.id("timelines")), preferDraft:v.optional(v.boolean()) },
  returns: v.any(),
  handler: async (ctx, args) => buildGraph(ctx, await getProduction(ctx, args.productionId.toString()),args.timelineId,args.preferDraft),
});

export const getByProject = query({
  args: { projectExternalId: v.string(), productionId: v.optional(v.id("productions")),timelineId:v.optional(v.id("timelines")), preferDraft:v.optional(v.boolean()) },
  returns: v.any(),
  handler: async (ctx, args) => {
    const project = await ctx.db.query("projects").withIndex("by_external_id", (q) => q.eq("externalId", args.projectExternalId)).unique();
    if (!project) return null;
    const production = await selectProjectProduction(ctx, project, args.productionId);
    if (!production) return null;
    return buildGraph(ctx, await getProduction(ctx, production._id.toString()),args.timelineId,args.preferDraft);
  },
});
