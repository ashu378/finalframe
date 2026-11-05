import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { recipeHash } from '../src/lib/production/recipes/compiler';

type ReadCtx = QueryCtx | MutationCtx;
const MAX_RETRIEVED_FACTS = 24;
const MAX_CANDIDATES = 64;
type FactKind = Doc<'projectMemoryFacts'>['kind'];

function sourceFacts(snapshot: unknown): Array<{ kind: FactKind; text: string }> {
  const value = snapshot && typeof snapshot === 'object' ? snapshot as Record<string, unknown> : {};
  const result: Array<{ kind: FactKind; text: string }> = [];
  function add(kind: FactKind, text: unknown) {
    if (typeof text !== 'string' || !text.trim()) return;
    if (text.length > 4000) throw new Error('Keep each accepted memory fact within 4000 characters.');
    result.push({ kind, text: text.trim() });
  }
  add('SUMMARY', value.summary);
  for (const text of Array.isArray(value.facts) ? value.facts : []) add('FACT', text);
  for (const text of Array.isArray(value.unresolvedThreads) ? value.unresolvedThreads : []) add('THREAD', text);
  add('CLIFFHANGER', value.cliffhanger);
  add('PAYOFF', value.nextEpisodePayoff);
  for (const raw of Array.isArray(value.characterStates) ? value.characterStates : []) {
    const state = raw as Record<string, unknown>;
    add('CHARACTER', `${String(state.resourceId)}. ${String(state.knowledge ?? '')} ${String(state.relationships ?? '')}`);
  }
  if (result.length > 256) throw new Error('Keep accepted episode memory within 256 facts.');
  return result;
}

/** A materialized fact never makes a stale, replaced or foreign story current. */
export async function currentMemorySource(ctx: ReadCtx, projectId: Id<'projects'>, stateId: Id<'episodeStoryStates'>) {
  const state = await ctx.db.get(stateId);
  if (!state || state.projectId !== projectId || !state.timelineId) return null;
  const [episode, version, timeline] = await Promise.all([ctx.db.get(state.episodeId), ctx.db.get(state.productionVersionId), ctx.db.get(state.timelineId)]);
  if (!episode || episode.projectId !== projectId || episode.acceptedStoryStateId !== state._id || episode.continuityStatus !== 'CURRENT'
    || !version || version.productionId !== episode.productionId || version.status !== 'APPROVED'
    || !timeline || timeline.projectId !== projectId || timeline.productionId !== episode.productionId) return null;
  const production = await ctx.db.get(episode.productionId);
  if (!production || production.projectId !== projectId || production.currentVersionId !== version._id) return null;
  for (const [type, id] of [['episodeStoryState', state._id], ['timeline', timeline._id]] as const) {
    const approval = await ctx.db.query('resourceStates').withIndex('by_project_resource', q => q.eq('projectId', projectId).eq('resourceType', type).eq('resourceId', id)).unique();
    if (!approval || !['APPROVED','LOCKED'].includes(approval.state)) return null;
  }
  return { state, episode, sourceHash: await recipeHash(state.snapshot) };
}

/** Accepted facts append once, preserving every earlier source for audit. */
export async function materializeAcceptedMemory(ctx: MutationCtx, projectId: Id<'projects'>, stateId: Id<'episodeStoryStates'>) {
  const source = await currentMemorySource(ctx, projectId, stateId);
  if (!source) throw new Error('Only a current approved episode can supply project memory.');
  const facts = sourceFacts(source.state.snapshot);
  const existing = await ctx.db.query('projectMemoryFacts').withIndex('by_story_state', q => q.eq('storyStateId', stateId)).take(257);
  if (existing.length > 256) throw new Error('Accepted memory source exceeds its bounds.');
  for (const [ordinal, fact] of facts.entries()) {
    const found = existing.find(row => row.ordinal === ordinal);
    if (found) {
      if (found.projectId !== projectId || found.sourceHash !== source.sourceHash || found.kind !== fact.kind || found.text !== fact.text) throw new Error('An accepted memory snapshot changed.');
      continue;
    }
    await ctx.db.insert('projectMemoryFacts', { projectId, episodeId: source.episode._id, episodeNumber: source.episode.episodeNumber,
      storyStateId: stateId, productionVersionId: source.state.productionVersionId, timelineId: source.state.timelineId!,
      kind: fact.kind, ordinal, text: fact.text, sourceHash: source.sourceHash, createdAt: source.state.createdAt });
  }
  return facts.length - existing.length;
}

/** Search is project-filtered, then each ranked result is reauthorized against
 * its exact accepted source. Older episodes remain eligible indefinitely. */
export async function retrieveApprovedMemory(ctx: ReadCtx, projectId: Id<'projects'>, beforeEpisodeNumber: number | undefined, query: string) {
  const search = query.trim().slice(0, 256);
  const candidates = search
    ? await ctx.db.query('projectMemoryFacts').withSearchIndex('search_text', q => q.search('text', search).eq('projectId', projectId)).take(MAX_CANDIDATES)
    : await ctx.db.query('projectMemoryFacts').withIndex('by_project_episode', q => q.eq('projectId', projectId)).order('desc').take(MAX_CANDIDATES);
  const sources = new Map<string, Awaited<ReturnType<typeof currentMemorySource>>>();
  const facts = [];
  let bytes = 0;
  for (const fact of candidates) {
    if (fact.projectId !== projectId || beforeEpisodeNumber !== undefined && fact.episodeNumber >= beforeEpisodeNumber) continue;
    if (!sources.has(fact.storyStateId)) sources.set(fact.storyStateId, await currentMemorySource(ctx, projectId, fact.storyStateId));
    const source = sources.get(fact.storyStateId);
    if (!source || source.sourceHash !== fact.sourceHash || source.episode._id !== fact.episodeId || source.state.productionVersionId !== fact.productionVersionId || source.state.timelineId !== fact.timelineId) continue;
    const accepted=sourceFacts(source.state.snapshot)[fact.ordinal];
    if(!accepted||accepted.kind!==fact.kind||accepted.text!==fact.text)continue;
    const next = { factId: fact._id, kind: fact.kind, text: fact.text, episodeId: fact.episodeId, episodeNumber: fact.episodeNumber,
      storyStateId: fact.storyStateId, productionVersionId: fact.productionVersionId, timelineId: fact.timelineId, sourceHash: fact.sourceHash };
    const size = new TextEncoder().encode(JSON.stringify(next)).byteLength;
    if (bytes + size > 24_000 || facts.length === MAX_RETRIEVED_FACTS) break;
    bytes += size;
    facts.push(next);
  }
  return { version: 1 as const, projectId, query: search, facts, hasMoreCandidates: candidates.length === MAX_CANDIDATES };
}
