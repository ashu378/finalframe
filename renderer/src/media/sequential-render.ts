import { mkdtemp, open, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AssemblyPlan } from '../assembly/plan.js';
import type { RenderManifest, VideoRenderItem } from '../types.js';
import type { FFmpegAdapter, FFprobeAdapter } from './ffmpeg.js';
import { assertProbeUrl } from './remote-probe.js';
import { validateWorkerMediaSource, type WorkerMediaPolicy } from './source-policy.js';

/** Only disjoint, opaque cuts with no composition-wide sound/effects qualify.
 * Everything else keeps the established Remotion path. Never drop a control
 * in order to obtain a faster render. */
export function canRenderSequentially(plan: AssemblyPlan): boolean {
  if (plan.outputCodec !== 'h264' || plan.audioTracks.length || plan.captionTracks.length || plan.transitions.length ||
      !plan.items.some(item => item.kind === 'video') || plan.items.length > 32) return false;
  let end = 0;
  for (const item of plan.items) {
    if (item.startFrame !== end || (item.opacity ?? 1) !== 1 || item.kind === 'image') return false;
    if (item.kind === 'video' && (item.holdAfterFrame !== undefined || item.sourceAudioRestoration ||
        item.fit && item.fit !== 'cover' || item.position && item.position !== 'center' ||
        item.backgroundColor && item.backgroundColor !== '#000' && item.backgroundColor !== '#000000')) return false;
    end += item.durationInFrames;
  }
  return end === plan.durationInFrames;
}

export function sequentialVideoFilter(item: VideoRenderItem, plan: AssemblyPlan): string {
  const start = (item.trimStartInFrames ?? 0) / plan.fps;
  // fps before the frame limit gives the same output-frame clock as Remotion.
  return `trim=start=${start},setpts=PTS-STARTPTS,fps=${plan.fps},trim=end_frame=${item.durationInFrames},` +
    `scale=${plan.width}:${plan.height}:force_original_aspect_ratio=increase:force_divisible_by=2,` +
    `crop=${plan.width}:${plan.height},setsar=1,format=yuv420p`;
}

/** FFmpeg reads only bounded local files. HTTPS downloads reject redirects;
 * production accepts the exact configured Convex Storage host only. */
async function localSource(src: string, path: string, policy: WorkerMediaPolicy, timeout: number): Promise<string> {
  const allowed = validateWorkerMediaSource(src, policy);
  if (!allowed.ok) throw new Error('Unsafe sequential render source.');
  const limit = 64 * 1024 * 1024;
  if (!/^https?:/.test(src)) {
    const local = src.startsWith('file:') ? fileURLToPath(src) : src;
    if ((await stat(local)).size > limit) throw new Error('Sequential source exceeds byte limit.');
    return local;
  }
  try { assertProbeUrl(src, policy.allowedRemoteHosts ?? []); }
  catch { throw new Error('SEQUENTIAL_SOURCE_REQUIRES_BROWSER'); }
  const response = await fetch(src, { redirect: 'error', signal: AbortSignal.timeout(Math.min(timeout, 30_000)) });
  if (!response.ok || !response.body || Number(response.headers.get('content-length')) > limit) throw new Error('Sequential source download failed.');
  const file = await open(path, 'wx', 0o600), reader = response.body.getReader();
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > limit) throw new Error('Sequential source exceeds byte limit.');
      await file.writeFile(part.value);
    }
    if (!bytes) throw new Error('Empty sequential source.');
  } finally { await reader.cancel().catch(() => {}); await file.close(); }
  return path;
}

export async function renderSequentialCuts(plan: AssemblyPlan, manifest: RenderManifest, outputPath: string, options: {
  ffmpeg: FFmpegAdapter; ffprobe: FFprobeAdapter; policy: WorkerMediaPolicy; timeoutMs: number;
  renderGraphic: (manifest: RenderManifest, outputPath: string, timeoutMs: number) => Promise<void>;
}): Promise<void> {
  if (!canRenderSequentially(plan)) throw new Error('Unsupported sequential composition.');
  const directory = await mkdtemp(join(dirname(outputPath), '.cuts-'));
  const deadline = Date.now() + options.timeoutMs;
  const remaining = () => { const ms = deadline - Date.now(); if (ms <= 0) throw new Error('RENDER_PROCESSING_TIMEOUT'); return ms; };
  const sampleRate = manifest.output.audio?.sampleRate ?? 48000;
  const channels = manifest.output.audio?.channels ?? 2;
  let hasAudio = Boolean(manifest.output.audio);
  let retainedBytes = 0;
  try {
    for (const [index, item] of plan.items.entries()) {
      let source: string, filter: string, audio = false, start = 0, gain = 1;
      if (item.kind === 'video') {
        source = await localSource(item.src, join(directory, `source-${index}.mp4`), options.policy, remaining());
        const probe = await options.ffprobe.probe(source, { timeoutMs: Math.min(remaining(), 30_000) });
        const video = probe.streams.find(s => s.codec_type === 'video');
        // The browser handles rotation/SAR and unusual source timestamps. Keep
        // those on its path until matching equivalence tests exist.
        if (!video || video.sample_aspect_ratio && !['1:1', '0:1'].includes(String(video.sample_aspect_ratio)) ||
            video.side_data_list && (video.side_data_list as Array<Record<string, unknown>>).some(s => s.rotation)) throw new Error('SEQUENTIAL_SOURCE_REQUIRES_BROWSER');
        audio = probe.streams.some(s => s.codec_type === 'audio');
        hasAudio ||= audio;
        filter = sequentialVideoFilter(item, plan);
        start = (item.trimStartInFrames ?? 0) / plan.fps; gain = item.volume ?? 1;
      } else {
        source = join(directory, `graphic-${index}.mp4`);
        const piece: RenderManifest = { ...manifest, output: { ...manifest.output, durationInFrames: item.durationInFrames },
          items: [{ ...item, startFrame: 0, orderIndex: 0 }], shots: [], audioTracks: [], captionTracks: [], transitions: [] };
        await options.renderGraphic(piece, source, remaining());
        filter = `fps=${plan.fps},trim=end_frame=${item.durationInFrames},setpts=PTS-STARTPTS,setsar=1,format=yuv420p`;
      }
      const samples = Math.round(item.durationInFrames * sampleRate / plan.fps);
      await options.ffmpeg.execute(['-hide_banner','-loglevel','error','-y','-threads','1','-filter_threads','1','-protocol_whitelist','file,pipe','-i',source,
        ...(!audio ? ['-f','lavfi','-i',`anullsrc=r=${sampleRate}:cl=${channels === 1 ? 'mono' : 'stereo'}`] : []),
        '-map','0:v:0','-map',audio ? '0:a:0' : '1:a:0','-vf',filter,
        '-af',`atrim=start=${audio ? start : 0},asetpts=PTS-STARTPTS,aresample=${sampleRate},volume=${gain},apad,atrim=end_sample=${samples}`,
        '-c:v','libx264','-threads','1','-preset','medium','-crf','18','-c:a','pcm_s16le','-ar',String(sampleRate),'-ac',String(channels),
        '-t',String(item.durationInFrames / plan.fps),'-fs','268435456',join(directory,`part-${index}.mkv`)], { timeoutMs: remaining(), maxOutputBytes: 8192 });
      const probe = await options.ffprobe.probe(join(directory,`part-${index}.mkv`), { countFrames: true, timeoutMs: Math.min(remaining(),30_000) });
      if (Number(probe.streams.find(s => s.codec_type === 'video')?.nb_read_frames) !== item.durationInFrames) throw new Error('Sequential source cannot supply the approved frame count.');
      retainedBytes += (await stat(join(directory,`part-${index}.mkv`))).size;
      if (retainedBytes > 256 * 1024 * 1024) throw new Error('Sequential intermediate files exceed the worker budget.');
      if (item.kind === 'video' && source.startsWith(directory + '/')) await rm(source, { force: true });
    }
    const playlist = join(directory,'parts.txt');
    await writeFile(playlist,plan.items.map((item,index)=>`file 'part-${index}.mkv'\nduration ${item.durationInFrames / plan.fps}\n`).join(''));
    await options.ffmpeg.execute(['-hide_banner','-loglevel','error','-y','-threads','1','-protocol_whitelist','file,pipe','-f','concat','-safe','1','-i',playlist,
      '-map','0:v:0','-c:v','copy',...(hasAudio ? ['-map','0:a:0','-c:a','pcm_s16le'] : ['-an']),
      '-t',String(plan.durationInFrames / plan.fps),'-f','matroska',outputPath], { timeoutMs: remaining(), maxOutputBytes: 8192 });
  } finally { await rm(directory, { recursive: true, force: true }); }
}
