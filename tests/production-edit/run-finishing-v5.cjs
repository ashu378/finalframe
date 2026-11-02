const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
  for (const candidate of [request, request.endsWith('.js') ? request.slice(0, -3) + '.ts' : request]) {
    try { return originalResolve.call(this, candidate, parent, isMain, options); } catch {}
  }
  throw new Error(`Cannot resolve finishing test module ${request}`);
};
Module._extensions['.ts'] = function(module, filename) {
  let source = fs.readFileSync(filename, 'utf8');
  if (filename.endsWith('/convex/assembly.ts')) source += '\nexport const __test = {scopeSourceItems,rendererItems,rendererAudioTracks,rendererCaptionTracks,rendererTransitions};';
  module._compile(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }, fileName: filename }).outputText, filename);
};
const originalLoad = Module._load;
const member = { studio: { _id: 'studio_1', externalId: 'studio' }, user: { _id: 'user_1' }, identity: { externalId: 'owner' } };
Module._load = function(request, parent, isMain) {
  if (parent?.filename.includes('/convex/')) {
    if (request === './_generated/server') return { query: value => value, mutation: value => value, internalMutation: value => value, internalAction: value => value };
    if (request === './authorization') return {
      requireMember: async (ctx, studio) => { if (studio !== 'studio' || ctx.role === 'GUEST') throw new Error('Forbidden studio'); return member; },
      requireProjectRole: async (ctx, projectId, roles) => { if (projectId !== 'project_1' || !roles.includes(ctx.role)) throw new Error('Forbidden project'); return { ...member, user: ctx.actorUserId ? {_id:ctx.actorUserId} : member.user, projectRole: ctx.role, project: await ctx.db.get(projectId) }; },
      requireProjectAccess: async (ctx, projectId) => { if (projectId !== 'project_1' || ctx.role === 'GUEST') throw new Error('Forbidden project'); return { ...member, user: ctx.actorUserId ? {_id:ctx.actorUserId} : member.user, projectRole: ctx.role, project: await ctx.db.get(projectId) }; },
    };
    if (request === './resourceStates') return {
      ensureResourceState: async (ctx, args) => { ctx.states.set(`${args.resourceType}:${args.resourceId}`, 'DRAFT'); },
      requireEditable: async (ctx, _project, type, id) => { if (!['DRAFT', 'REVISION_REQUESTED'].includes(ctx.states.get(`${type}:${id}`))) throw new Error('Locked resource'); },
      getEffectiveResourceState: async (ctx, _project, type, id) => ({ currentState: ctx.states.get(`${type}:${id}`), state: { lockedAt: 1, lockedByUserId: 'user_1' } }),
      requireApprovedResource: async (ctx, projectId, type, id) => { const state = ctx.states.get(`${type}:${id}`); if (projectId !== 'project_1' || !['APPROVED', 'LOCKED'].includes(state)) throw new Error('Source needs approval'); return { currentState: state, state: { lockedAt: 1, lockedByUserId: 'user_1' } }; },
    };
    if (request === './approvals') return { transitionResourceState: async () => {} };
    if (request === './_shared') return { now: () => Date.now(), getProduction: async (ctx, id) => { const production = await ctx.db.get(id); if (!production) throw new Error('Missing production'); return production; } };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const editor = require(path.join(root, 'convex/timelineEditor.ts'));
const assembly = require(path.join(root, 'convex/assembly.ts'));
const timeline = require(path.join(root, 'convex/timeline.ts'));
const { validateManifest } = require(path.join(root, 'renderer/src/manifest.ts'));
const { normalizeCaptionTrack } = require(path.join(root, 'convex/finishingContracts.ts'));

function fixture({ music = true, voice = false } = {}) {
  let sequence = 0;
  const rows = new Map(); const tables = new Map(); const states = new Map(); const storage = new Map();
  function put(table, value) { const row = { _creationTime: ++sequence, ...structuredClone(value) }; rows.set(row._id, row); tables.set(row._id, table); return row._id; }
  const db = {
    get: async id => structuredClone(rows.get(id) ?? null),
    normalizeId: (_table, id) => typeof id === 'string' && id ? id : null,
    insert: async (table, value) => put(table, { ...value, _id: `${table}_${++sequence}` }),
    patch: async (id, patch) => { if (!rows.has(id)) throw new Error('Missing row'); rows.set(id, { ...rows.get(id), ...structuredClone(patch) }); },
    system: { get: async (_table, id) => storage.get(id) ?? null },
    query(table) {
      const filters = []; let index; let direction = 'asc';
      const query = {
        withIndex(name, run) { index = name; const q = { eq(key, value) { filters.push([key, value]); return q; } }; if (run) run(q); return query; },
        order(value) { direction = value; return query; },
        async take(count) { const data = [...rows.values()].filter(row => tables.get(row._id) === table && filters.every(([key, value]) => row[key] === value)); data.sort((a,b) => (index === 'by_production_version' ? a.versionNumber - b.versionNumber : a._creationTime - b._creationTime) * (direction === 'desc' ? -1 : 1)); return structuredClone(data.slice(0,count)); },
        async collect() { return query.take(1000); },
        async first() { return (await query.take(1))[0] ?? null; },
        async unique() { const data = await query.take(2); if (data.length > 1) throw new Error('Nonunique row'); return data[0] ?? null; },
      }; return query;
    },
  };
  put('projects', { _id: 'project_1', studioExternalId: 'studio', name: 'Fixture' });
  put('productions', { _id: 'production_1', projectId: 'project_1', studioExternalId: 'studio', studioId: 'studio_1', currentVersionId: 'version_1', outputPreset: 'FULL_HD' });
  put('productionVersions', { _id: 'version_1', productionId: 'production_1', status: 'APPROVED' });
  for (const [id, mimeType] of [['red','video/mp4'],['blue','video/mp4'],['music','audio/wav'],['image','image/png'],['logo','image/png']]) {
    put('assets', { _id: `asset_${id}`, projectId: 'project_1', studioExternalId: 'studio', scope: 'PROJECT', mimeType, durationSeconds: 20, storageId: `storage_${id}`, checksum: `checksum_${id}`, metadata: { technicalProbe: { hasAudio: mimeType.startsWith('video/') } }, rights: { approved: true } });
    states.set(`asset:asset_${id}`, 'APPROVED'); storage.set(`storage_${id}`, { size: 100, contentType: mimeType });
  }
  put('timelines', { _id: 'timeline_1', projectId: 'project_1', productionId: 'production_1', studioExternalId: 'studio', studioId: 'studio_1', versionNumber: 1, status: 'DRAFT', durationSeconds: 8, tracks: { metadata: { productionVersionId: 'version_1', fps: 30 }, productionVersionId: 'version_1' }, outputPreset: 'FULL_HD', createdAt: 1 });
  put('timelineTracks', { _id: 'picture', timelineId: 'timeline_1', kind: 'VIDEO', orderIndex: 0, studioExternalId: 'studio' });
  for (const [index,id] of ['red','blue'].entries()) put('timelineClips', { _id: `clip_${id}`, timelineId: 'timeline_1', trackId: 'picture', studioExternalId: 'studio', assetId: `asset_${id}`, startSeconds: index * 4, durationSeconds: 4, trimStartSeconds: index + 1, volume: 0.7, metadata: { sceneId: `scene_${id}` } });
  if (music || voice) {
    put('timelineTracks', { _id: 'sound', timelineId: 'timeline_1', kind: 'AUDIO', orderIndex: 1, studioExternalId: 'studio' });
    put('timelineClips', { _id: 'clip_sound', timelineId: 'timeline_1', trackId: 'sound', studioExternalId: 'studio', assetId: 'asset_music', startSeconds: 0, durationSeconds: 8, trimStartSeconds: 2, volume: 0.3, metadata: { audioRole: voice ? 'voiceover' : 'music', audio: { fadeOutSeconds: 0.5 } } });
  }
  states.set('timeline:timeline_1', 'DRAFT');
  return { db, rows, states, storageObjects: storage, role: 'OWNER', storage: { getUrl: async id => storage.has(id) ? `https://media.finalframe.app/${id}` : null }, put, async draft(id) { return editor.getDraft.handler(this, { productionId: 'production_1', timelineId: id }); }, lock(id) { states.set(`timeline:${id}`, 'LOCKED'); rows.get(id).status = 'APPROVED'; }, count(table) { return [...tables.values()].filter(value => value === table).length; } };
}
const originalFlag = process.env.FINALFRAME_MANIFEST_V5_ENABLED;
let checks = 0;
async function check(name, run) { await run(); checks++; console.log(`PASS ${name}`); }
let key = 0;
const apply = (ctx, id, kind, input) => editor.apply.handler(ctx, { timelineId: id, kind, input, idempotencyKey: `finishing-test-${++key}` });

async function runFinishingTests() {
  try {
    await check('writer flag off retains caption/non-cut denials with no new timeline', async () => {
      delete process.env.FINALFRAME_MANIFEST_V5_ENABLED; const ctx = fixture(); const before = ctx.count('timelines');
      await assert.rejects(apply(ctx,'timeline_1','updateCaptions',{clipId:'clip_red',cues:[{id:'one',startSeconds:0,durationSeconds:1,text:'Keep every word.'}]}), /not connected/);
      await assert.rejects(apply(ctx,'timeline_1','addTransition',{clipId:'clip_red',transitionKind:'DISSOLVE',durationSeconds:0.5}), /Only cut/);
      assert.equal(ctx.count('timelines'),before); assert.equal((await ctx.draft('timeline_1')).finishingV5Enabled,false);
    });
    process.env.FINALFRAME_MANIFEST_V5_ENABLED = 'true';
    await check('caption authoring snaps complete cues/style into a new immutable timeline', async () => {
      const ctx = fixture(); const before = structuredClone(ctx.rows.get('clip_red'));
      const result = await apply(ctx,'timeline_1','updateCaptions',{clipId:'clip_red',language:'en',style:{fontSize:28,color:'#ffffff',position:'TOP',maxLines:2},cues:[{id:'words',startSeconds:0.19,durationSeconds:1,text:'Keep every word.'}]});
      const draft = await ctx.draft(result.timelineId); const caption = draft.tracks[0].clips[0].metadata.captionTrack;
      assert.equal(caption.cues[0].startFrame,6); assert.equal(caption.cues[0].text,'Keep every word.'); assert.equal(caption.style.position,'TOP');
      assert.deepEqual(ctx.rows.get('clip_red'),before); assert.equal(draft.finishingV5Enabled,true);
      for (const patch of [{style:{fontFamily:'url(bad)'}},{cues:[{id:'a',startSeconds:0,durationSeconds:2,text:'One'},{id:'b',startSeconds:1,durationSeconds:2,text:'Two'}]},{cues:[{id:'x',startSeconds:0,durationSeconds:1,text:'<b>Injected</b>'}]}]) await assert.rejects(apply(ctx,'timeline_1','updateCaptions',{clipId:'clip_red',language:'en',cues:[],...patch}));
    });
    await check('transition retiming requires explicit music tail consent and never drops dialogue', async () => {
      const ctx = fixture(); const source = structuredClone(ctx.rows.get('clip_sound'));
      await assert.rejects(apply(ctx,'timeline_1','addTransition',{clipId:'clip_red',transitionKind:'DISSOLVE',durationSeconds:0.5}), /Explicitly allow/);
      const result = await apply(ctx,'timeline_1','addTransition',{clipId:'clip_red',transitionKind:'DISSOLVE',durationSeconds:0.5,audioPolicy:'CROSSFADE',trimSoundtrackToPicture:true});
      const draft = await ctx.draft(result.timelineId); const visuals = draft.tracks[0].clips; const sound = draft.tracks[1].clips[0];
      assert.equal(visuals[1].startSeconds,3.5); assert.equal(draft.timeline.durationSeconds,7.5); assert.equal(visuals[0].transition.out.audioPolicy,'CROSSFADE');
      assert.equal(sound.startSeconds,0); assert.equal(sound.trimStartSeconds,2); assert.equal(sound.durationSeconds,7.5); assert.equal(sound.metadata.audio.fadeOutSeconds,0.5); assert.deepEqual(ctx.rows.get('clip_sound'),source);
      const dialogue = fixture({music:false,voice:true}); await assert.rejects(apply(dialogue,'timeline_1','addTransition',{clipId:'clip_red',transitionKind:'FADE',durationSeconds:0.5,trimSoundtrackToPicture:true}), /dialogue/);
      const unclassified = fixture(); delete unclassified.rows.get('clip_sound').metadata.audioRole;
      await assert.rejects(apply(unclassified,'timeline_1','addTransition',{clipId:'clip_red',transitionKind:'FADE',durationSeconds:0.5,trimSoundtrackToPicture:true}), /dialogue/);
      const short = fixture(); short.rows.get('clip_sound').durationSeconds=6;
      const unchanged = await apply(short,'timeline_1','addTransition',{clipId:'clip_red',transitionKind:'WIPE',durationSeconds:0.5});
      const shortDraft = await short.draft(unchanged.timelineId); assert.equal(shortDraft.tracks[1].clips[0].durationSeconds,6); assert.equal(shortDraft.tracks[1].clips[0].trimStartSeconds,2);
    });
    await check('gated canonical assembly carries captions, exact transition windows and soundtrack', async () => {
      const ctx = fixture();
      const captioned = await apply(ctx,'timeline_1','updateCaptions',{clipId:'clip_red',language:'en',style:{fontSize:28,position:'TOP'},cues:[{id:'words',startSeconds:0.2,durationSeconds:1,text:'Exact words.'}]});
      let draft = await ctx.draft(captioned.timelineId);
      const changed = await apply(ctx,captioned.timelineId,'addTransition',{clipId:draft.tracks[0].clips[0].id,transitionKind:'SLIDE',durationSeconds:0.5,trimSoundtrackToPicture:true}); ctx.lock(changed.timelineId);
      const assembled = await assembly.createJob.handler(ctx,{productionId:'production_1',timelineId:changed.timelineId,idempotencyKey:'assembly-v5-test'});
      const manifest = assembled.manifest; assert.equal(manifest.version,5); assert.equal(validateManifest(manifest).ok,true); assert.equal(manifest.output.durationInFrames,225);
      assert.deepEqual(manifest.items.map(item=>[item.startFrame,item.durationInFrames,item.trimStartInFrames,item.volume]),[[0,120,30,0.7],[105,120,60,0.7]]);
      assert.equal(manifest.transitions[0].durationInFrames,15); assert.equal(manifest.captionTracks[0].cues[0].startFrame,6); assert.equal(manifest.audioTracks[0].durationInFrames,225);
      await assert.rejects(assembly.createJob.handler(ctx,{productionId:'production_1',timelineId:changed.timelineId,selectionScope:'SCENES',selectedSceneIds:['scene_red'],idempotencyKey:'partial-transition'}),/part of a transition/);
      const selected = await assembly.createJob.handler(ctx,{productionId:'production_1',timelineId:changed.timelineId,selectionScope:'SCENES',selectedSceneIds:['scene_red','scene_blue'],idempotencyKey:'whole-transition'}); assert.equal(validateManifest(selected.manifest).ok,true);
      const imported = await timeline.createVersion.handler(ctx,{productionId:'production_1',manifestId:assembled.manifestId,idempotencyKey:'lossless-import-v5'}); ctx.lock(imported._id);
      const roundTrip = await assembly.createJob.handler(ctx,{productionId:'production_1',timelineId:imported._id,idempotencyKey:'round-trip-v5'});
      assert.equal(validateManifest(roundTrip.manifest).ok,true);
      assert.deepEqual(roundTrip.manifest.items.map(item=>[item.kind,item.startFrame,item.durationInFrames,item.trimStartInFrames,item.volume]),manifest.items.map(item=>[item.kind,item.startFrame,item.durationInFrames,item.trimStartInFrames,item.volume]));
      assert.deepEqual(roundTrip.manifest.captionTracks.map(track=>[track.language,track.style,track.cues]),manifest.captionTracks.map(track=>[track.language,track.style,track.cues]));
      assert.deepEqual(roundTrip.manifest.audioTracks.map(track=>[track.startFrame,track.durationInFrames,track.trimStartInFrames,track.volume,track.fadeOutFrames]),manifest.audioTracks.map(track=>[track.startFrame,track.durationInFrames,track.trimStartInFrames,track.volume,track.fadeOutFrames]));
      const manifestRecord = await ctx.db.get(assembled.manifestId);
      ctx.put('renderJobs',{_id:'render_done',projectId:'project_1',productionId:'production_1',manifestId:manifestRecord._id,status:'COMPLETED'});
      ctx.storageObjects.set('storage_export',{size:1234,contentType:'video/mp4'});
      ctx.put('exports',{_id:'export_done',projectId:'project_1',productionId:'production_1',manifestId:manifestRecord._id,renderJobId:'render_done',status:'COMPLETED',storageId:'storage_export'});
      const sidecars = await assembly.captionSidecars.handler(ctx,{manifestId:manifestRecord._id,exportId:'export_done'}); assert.match(sidecars[0].srt,/00:00:00,200 --> 00:00:01,200\nExact words\./);
      ctx.storageObjects.set('storage_export',{size:1234,contentType:'video/webm'});
      await assert.rejects(assembly.captionSidecars.handler(ctx,{manifestId:manifestRecord._id,exportId:'export_done'}), /media type/);
      ctx.storageObjects.set('storage_export',{size:1234,contentType:'video/mp4'}); ctx.rows.get('export_done').mimeType='video/webm';
      await assert.rejects(assembly.captionSidecars.handler(ctx,{manifestId:manifestRecord._id,exportId:'export_done'}), /media type/); delete ctx.rows.get('export_done').mimeType;
      const savedPayload = structuredClone(ctx.rows.get(manifestRecord._id).manifest);
      for (const [field, foreignValue] of [['projectId','project_other'],['productionId','production_other'],['manifestId','manifest_other'],['version',4]]) {
        ctx.rows.get(manifestRecord._id).manifest = { ...structuredClone(savedPayload), [field]: foreignValue };
        await assert.rejects(assembly.captionSidecars.handler(ctx,{manifestId:manifestRecord._id,exportId:'export_done'}), /caption manifest is unavailable/, `${field} must match its canonical stored record`);
      }
      ctx.rows.get(manifestRecord._id).manifest = null;
      await assert.rejects(assembly.captionSidecars.handler(ctx,{manifestId:manifestRecord._id,exportId:'export_done'}), /caption manifest is unavailable/);
      ctx.rows.get(manifestRecord._id).manifest = savedPayload;
      ctx.rows.get('render_done').status='PROCESSING'; await assert.rejects(assembly.captionSidecars.handler(ctx,{manifestId:manifestRecord._id,exportId:'export_done'}),/unavailable/); ctx.rows.get('render_done').status='COMPLETED';
      ctx.role='GUEST'; await assert.rejects(assembly.captionSidecars.handler(ctx,{manifestId:manifestRecord._id,exportId:'export_done'}),/Forbidden/); ctx.role='OWNER';
      delete process.env.FINALFRAME_MANIFEST_V5_ENABLED;
      assert.equal((await assembly.createJob.handler(ctx,{productionId:'production_1',timelineId:changed.timelineId,idempotencyKey:'assembly-v5-test'})).manifestId,assembled.manifestId,'retained v5 remains readable on rollback');
      await assert.rejects(assembly.createJob.handler(ctx,{productionId:'production_1',timelineId:changed.timelineId,idempotencyKey:'downgrade-blocked'}),/not implemented|silently omit/);
      process.env.FINALFRAME_MANIFEST_V5_ENABLED='true';
    });
    await check('scoped caption and audio ranges clip/rebase from the same selected picture windows', () => {
      const sources = [
        {timelineClipId:'first',trackKind:'VIDEO',trackId:'picture',startSeconds:4,durationSeconds:4,orderIndex:0},
        {timelineClipId:'second',trackKind:'VIDEO',trackId:'picture',startSeconds:12,durationSeconds:4,orderIndex:1},
        {timelineClipId:'music',trackKind:'AUDIO',trackId:'sound',startSeconds:0,durationSeconds:20,trimStartSeconds:2,orderIndex:2},
        {timelineClipId:'captions',trackKind:'CAPTIONS',trackId:'captions',startSeconds:0,durationSeconds:20,orderIndex:3,captionFps:30,captionTracks:[normalizeCaptionTrack({language:'en',cues:[{id:'one',startSeconds:6,durationSeconds:1,text:'First selected line.'},{id:'two',startSeconds:13,durationSeconds:1,text:'Second selected line.'}]},20,30,'captions')]},
      ];
      const scoped = assembly.__test.scopeSourceItems(sources,'SCENES'); const tracks = assembly.__test.rendererCaptionTracks(scoped,30);
      assert.deepEqual(tracks.flatMap(track=>track.cues.map(cue=>[cue.startFrame,cue.durationInFrames,cue.text])),[[60,30,'First selected line.'],[150,30,'Second selected line.']]);
      assert.deepEqual(scoped.filter(source=>source.trackKind==='AUDIO').map(source=>[source.startSeconds,source.trimStartSeconds]),[[0,6],[4,14]]);
      assert.equal(sources[0].startSeconds,4);
    });
    await check('authoring/import keep role, source approval and lock fences', async () => {
      const ctx = fixture(); ctx.role='VIEWER'; await assert.rejects(apply(ctx,'timeline_1','trim',{clipId:'clip_red',trimStartSeconds:1,trimEndSeconds:3}),/Forbidden/);
      ctx.role='OWNER'; ctx.lock('timeline_1'); await assert.rejects(apply(ctx,'timeline_1','trim',{clipId:'clip_red',trimStartSeconds:1,trimEndSeconds:3}),/Locked/);
      ctx.states.set('asset:asset_red','REVISION_REQUESTED'); await assert.rejects(assembly.createJob.handler(ctx,{productionId:'production_1',timelineId:'timeline_1',idempotencyKey:'revoked-asset'}),/approval/);
    });
    await check('v5 revisions ignore stale import order and reject unwired legacy effects', async () => {
      const ctx = fixture({music:false}); ctx.rows.get('clip_red').metadata.rendererOrderIndex=7; ctx.rows.get('clip_blue').metadata.rendererOrderIndex=8;
      const changed=await apply(ctx,'timeline_1','addTransition',{clipId:'clip_red',transitionKind:'DISSOLVE',durationSeconds:0.5}); ctx.lock(changed.timelineId);
      const exported=await assembly.createJob.handler(ctx,{productionId:'production_1',timelineId:changed.timelineId,idempotencyKey:'new-order-accepted'}); assert.equal(validateManifest(exported.manifest).ok,true);
      for (const kind of ['captions','incoming']) {
        const legacy=fixture({music:false});
        if(kind==='captions') legacy.rows.get('clip_red').metadata.cues=[{startSeconds:0,durationSeconds:1,text:'Must not disappear.'}];
        else legacy.rows.get('clip_blue').transition={in:{kind:'FADE',durationSeconds:0.5}};
        legacy.lock('timeline_1'); await assert.rejects(assembly.createJob.handler(legacy,{productionId:'production_1',timelineId:'timeline_1',idempotencyKey:`legacy-${kind}-denied`}),/ambiguous legacy/);
      }
    });
    console.log(`Finishing v5 backend: ${checks} PASS; actual handlers with in-memory storage/auth fixtures, no database/provider calls.`);
  } finally { if (originalFlag === undefined) delete process.env.FINALFRAME_MANIFEST_V5_ENABLED; else process.env.FINALFRAME_MANIFEST_V5_ENABLED=originalFlag; }
}
module.exports={fixture,editor,assembly,apply};
if(require.main===module)runFinishingTests().catch(error=>{console.error(error);process.exitCode=1;});
