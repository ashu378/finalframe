import { createHash } from 'node:crypto';
import { assertFrameToRegion, frameSelection, timedFrameSelection, FRAME_TO_REGION_VERSION, type ActionTiming, type FrameToRegion } from './frame-to-region-contract.js';
import { realpath, stat, unlink, readFile, open, mkdtemp, rm } from 'node:fs/promises';
import { isAbsolute, resolve, join, dirname } from 'node:path';
import { ChildProcessCommandRunner, type CommandRunner } from './command-runner.js';
import { assertActionRegion, type ActionRegion } from './action-region-contract.js';

/** Local-only preparation/compositing. It does not call a provider or approve a
 * creative repair. The caller must retain the source/repair hashes and lineage. */
export interface ActionWindowInput { sourcePath: string; outputPath: string; startSeconds: number; endSeconds: number }
export interface ActionWindowResult {
  version: 'ACTION_WINDOW_V1'; outputPath: string; width: number; height: number;
  fps: number; fpsNumerator: number; fpsDenominator: number; sourceFrames: number;
  startFrame: number; endFrame: number; windowFrames: number;
  startSeconds: number; endSeconds: number; durationSeconds: number;
  sourceDurationSeconds: number; outputFrames: number; originalAudioCopied: boolean;
  repairInputFrames?: number; trimmedTrailingFrames?: number;
}
export interface ActionWindowOptions { runner?: CommandRunner; ffmpegCommand?: string; ffprobeCommand?: string; timeoutMs?: number }
const MAX_BYTES = 512 * 1024 * 1024;
const fail = (code: string): never => { throw new Error(`ACTION_WINDOW_${code}`); };
function localPath(value: string) {
  if (typeof value !== 'string' || !isAbsolute(value) || /[\u0000\r\n]/.test(value) || value.length > 4096) fail('LOCAL_PATH_REQUIRED');
  return resolve(value);
}
function rate(value: unknown) {
  const m = /^(\d+)\/(\d+)$/.exec(String(value));
  if (!m) return fail('CFR_REQUIRED');
  const numerator = Number(m[1]), denominator = Number(m[2]);
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator < 1 || numerator / denominator < 1 || numerator / denominator > 60) fail('CFR_REQUIRED');
  return { numerator, denominator, fps: numerator / denominator };
}
export function createActionMediaTools(options: ActionWindowOptions) {
  const runner = options.runner ?? new ChildProcessCommandRunner();
  const timeout = options.timeoutMs ?? 120_000;
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > 180_000) fail('TIMEOUT_INVALID');
  const deadline = Date.now() + timeout;
  const run = async (command: string, args: string[], maxOutputBytes = 1_048_576) => {
    const remaining = deadline - Date.now(); if (remaining <= 0) return fail('TIMEOUT');
    return runner.run(command, args, { timeoutMs: remaining, maxOutputBytes });
  };
  const probe = async (path: string) => {
    const canonical = await realpath(localPath(path));
    const file = await stat(canonical);
    if (!file.isFile() || file.size < 1 || file.size > MAX_BYTES) fail('SOURCE_LIMIT');
    const result = await run(options.ffprobeCommand ?? 'ffprobe', ['-v','error','-threads','1','-protocol_whitelist','file,pipe','-select_streams','v:0','-show_frames','-show_streams','-show_format','-show_entries','frame=best_effort_timestamp_time,pkt_duration_time,key_frame:stream:format','-of','json',canonical]);
    let data: any; try { data = JSON.parse(result.stdout); } catch { return fail('PROBE_INVALID'); }
    const video = data.streams?.find((s: any) => s.codec_type === 'video');
    const frames = data.frames;
    const r = rate(video?.avg_frame_rate);
    if (!video || !Array.isArray(frames) || frames.length < 1 || frames.length > 3600 || rate(video.r_frame_rate).fps !== r.fps || !['mov,mp4,m4a,3gp,3g2,mj2','matroska,webm'].includes(data.format?.format_name)) fail('CFR_REQUIRED');
    if (!['h264','hevc','vp8','vp9','av1','ffv1'].includes(video.codec_name) || video.pix_fmt !== 'yuv420p' || video.sample_aspect_ratio && !['1:1','N/A'].includes(video.sample_aspect_ratio) || video.tags?.rotate && Number(video.tags.rotate) !== 0 || video.side_data_list?.some((s: any) => Number(s.rotation ?? 0) !== 0)) fail('SOURCE_FORMAT');
    if (!Number.isSafeInteger(video.width) || !Number.isSafeInteger(video.height) || video.width < 16 || video.height < 16 || video.width % 2 || video.height % 2 || video.width > 3840 || video.height > 3840 || video.width * video.height > 4_194_304) fail('SOURCE_LIMIT');
    const duration = frames.length / r.fps;
    if (duration > 60.000001 || !Number.isFinite(Number(data.format?.duration)) || Number(data.format.duration) > 60.000001) fail('SOURCE_LIMIT');
    for (let i = 0; i < frames.length; i++) {
      if (!Number.isFinite(Number(frames[i].best_effort_timestamp_time)) || Math.abs(Number(frames[i].best_effort_timestamp_time) - i / r.fps) > 0.000002) fail('CFR_REQUIRED');
    }
    // Separate audio inspection: select_streams v:0 intentionally bounds the
    // decoded-frame JSON above; audio packet content is never decoded here.
    const audioResult = await run(options.ffprobeCommand ?? 'ffprobe', ['-v','error','-protocol_whitelist','file,pipe','-select_streams','a','-show_streams','-of','json',canonical], 131072);
    let audio: any[]; try { audio = JSON.parse(audioResult.stdout).streams ?? []; } catch { return fail('PROBE_INVALID'); }
    if (audio.length > 4 || audio.some(s => !['aac','mp3','alac'].includes(s.codec_name) || !Number.isFinite(Number(s.start_time)) || Math.abs(Number(s.start_time)) > .000002 || Number(s.duration) > 60.000001)) fail('AUDIO_FORMAT');
    return { canonical, codec: String(video.codec_name), keyframes: frames.flatMap((f: {key_frame?: number}, i: number) => f.key_frame === 1 ? [i] : []), width: video.width as number, height: video.height as number, ...r, frames: frames.length, duration, audio };
  };
  return { probe, run, ffmpeg: (args: string[]) => run(options.ffmpegCommand ?? 'ffmpeg', args, 262144) };
}
type Probe = Awaited<ReturnType<ReturnType<typeof createActionMediaTools>['probe']>>;
function windowFor(input: ActionWindowInput, source: Probe) {
  if (!Number.isFinite(input.startSeconds) || !Number.isFinite(input.endSeconds) || input.startSeconds < 0 || input.endSeconds <= input.startSeconds || input.endSeconds > source.duration + 1e-9) fail('RANGE_INVALID');
  // Expand to whole source frames; caller must show these actual boundaries
  // before purchase and rebase every action deadline onto this same start.
  const startFrame = Math.floor(input.startSeconds * source.fps + 1e-7);
  const endFrame = Math.min(source.frames, Math.ceil(input.endSeconds * source.fps - 1e-7));
  if (endFrame <= startFrame) fail('RANGE_INVALID');
  return { startFrame, endFrame, windowFrames: endFrame - startFrame, startSeconds: startFrame / source.fps, endSeconds: endFrame / source.fps, durationSeconds: (endFrame - startFrame) / source.fps };
}
async function outputPath(input: ActionWindowInput, source: Probe, other?: Probe) {
  const out = localPath(input.outputPath);
  const canonical = await realpath(out).catch(() => out);
  if (canonical === source.canonical || canonical === other?.canonical) fail('OVERWRITE_SOURCE');
  // A fresh output prevents accidental destruction of retained evidence.
  if (await stat(out).then(() => true).catch(() => false)) fail('OUTPUT_EXISTS');
  return out;
}
const preamble = ['-hide_banner','-loglevel','error','-nostdin','-n','-filter_complex_threads','1'];
const inputArgs = (path: string) => ['-threads','1','-protocol_whitelist','file,pipe','-i',path];
const encodeArgs = ['-c:v','libx264','-threads','1','-preset','ultrafast','-crf','0','-pix_fmt','yuv420p','-fps_mode','passthrough','-fs',String(MAX_BYTES),'-movflags','+faststart','-f','mp4'];
function result(source: Probe, window: ReturnType<typeof windowFor>, outputPath: string, frames: number, originalAudioCopied: boolean): ActionWindowResult {
  return { version:'ACTION_WINDOW_V1', outputPath, width:source.width, height:source.height, fps:source.fps, fpsNumerator:source.numerator, fpsDenominator:source.denominator, sourceFrames:source.frames, ...window, sourceDurationSeconds:source.duration, outputFrames:frames, originalAudioCopied };
}
export async function prepareActionWindow(input: ActionWindowInput, options: ActionWindowOptions = {}): Promise<ActionWindowResult> {
  const tools = createActionMediaTools(options), source = await tools.probe(input.sourcePath), window = windowFor(input,source), out = await outputPath(input,source);
  try {
    await tools.ffmpeg([...preamble,...inputArgs(source.canonical),'-vf',`trim=start_frame=${window.startFrame}:end_frame=${window.endFrame},setpts=PTS-STARTPTS`,'-map','0:v:0','-an',...encodeArgs,out]);
    const measured = await tools.probe(out);
    if (measured.frames !== window.windowFrames || measured.width !== source.width || measured.height !== source.height || measured.fps !== source.fps) fail('OUTPUT_TIMING');
    return result(source,window,out,measured.frames,false);
  } catch (error) { await unlink(out).catch(() => undefined); throw error; }
}
export async function composeActionWindow(input: ActionWindowInput & { repairPath: string; trailingFramePolicy?: 'DROP_ONE_PROVIDER_TRAILING_FRAME' }, options: ActionWindowOptions = {}): Promise<ActionWindowResult> {
  const tools = createActionMediaTools(options), source = await tools.probe(input.sourcePath), window = windowFor(input,source), repair = await tools.probe(input.repairPath), out = await outputPath(input,source,repair);
  // A certified provider may return one inclusive end frame. Explicitly record
  // its removal; never stretch, pad, resize, or discard any in-window frame.
  if (repair.width !== source.width || repair.height !== source.height) fail('DIMENSIONS_CHANGED');
  const trimmedTrailingFrames = repair.frames - window.windowFrames;
  if (repair.fps !== source.fps || trimmedTrailingFrames !== 0 && !(input.trailingFramePolicy === 'DROP_ONE_PROVIDER_TRAILING_FRAME' && trimmedTrailingFrames === 1)) fail('REPAIR_TIMING_CHANGED');
  const parts: string[] = [], labels: string[] = [];
  if (window.startFrame) { parts.push(`[0:v]trim=end_frame=${window.startFrame},setpts=PTS-STARTPTS[prefix]`); labels.push('[prefix]'); }
  parts.push(`[1:v]trim=end_frame=${window.windowFrames},setpts=PTS-STARTPTS[repair]`); labels.push('[repair]');
  if (window.endFrame < source.frames) { parts.push(`[0:v]trim=start_frame=${window.endFrame},setpts=PTS-STARTPTS[suffix]`); labels.push('[suffix]'); }
  parts.push(`${labels.join('')}concat=n=${labels.length}:v=1:a=0[v]`);
  try {
    await tools.ffmpeg([...preamble,...inputArgs(source.canonical),...inputArgs(repair.canonical),'-filter_complex',parts.join(';'),'-map','[v]','-map','0:a?','-c:a','copy',...encodeArgs,out]);
    const measured = await tools.probe(out);
    if (measured.frames !== source.frames || measured.fps !== source.fps || measured.audio.length !== source.audio.length) fail('OUTPUT_TIMING');
    return {...result(source,window,out,measured.frames,source.audio.length > 0),repairInputFrames:repair.frames,trimmedTrailingFrames};
  } catch (error) { await unlink(out).catch(() => undefined); throw error; }
}

export interface ActionRegionInput { sourcePath: string; outputPath: string; region: ActionRegion }
export interface ActionRegionResult {
  version: 'ACTION_REGION_V1'; outputPath: string; region: ActionRegion;
  width: number; height: number; outputFrames: number; fps: 24;
  originalAudioCopied: boolean;
  repairInputFrames?: number; trimmedTrailingFrames?: number;
}
function measuredRegion(value: unknown, source: Probe) {
  const region = assertActionRegion(value), w = region.window;
  if (source.width !== w.width || source.height !== w.height || source.fps !== w.fps || source.frames !== w.sourceFrames) fail('SOURCE_CHANGED');
  return region;
}
/** Focus the edit on the reviewed subject area. No resizing or invented frames.
 * The returned crop is silent: source speech is restored only at composition. */
export async function prepareActionRegion(input: ActionRegionInput, options: ActionWindowOptions = {}): Promise<ActionRegionResult> {
  const tools = createActionMediaTools(options), source = await tools.probe(input.sourcePath);
  const region = measuredRegion(input.region, source), w = region.window;
  const out = await outputPath({ ...input, startSeconds: w.startSeconds, endSeconds: w.endSeconds }, source);
  try {
    await tools.ffmpeg([...preamble, ...inputArgs(source.canonical), '-vf',
      `trim=start_frame=${w.startFrame}:end_frame=${w.endFrame},setpts=PTS-STARTPTS,crop=${region.width}:${region.height}:${region.x}:${region.y}:exact=1`,
      '-map', '0:v:0', '-an', ...encodeArgs, out]);
    const measured = await tools.probe(out);
    if (measured.frames !== w.endFrame - w.startFrame || measured.width !== region.width || measured.height !== region.height || measured.fps !== 24 || measured.audio.length) fail('OUTPUT_TIMING');
    return { version: 'ACTION_REGION_V1', outputPath: out, region, width: region.width, height: region.height, outputFrames: measured.frames, fps: 24, originalAudioCopied: false };
  } catch (error) { await unlink(out).catch(() => undefined); throw error; }
}
/** Insert a matching reviewed-region result without changing any outside
 * pixels or frames. Hard boundaries require visual review; tracking, feathering,
 * scaling, interpolation and synthetic speech are intentionally not inferred. */
export async function composeActionRegion(input: ActionRegionInput & { repairPath: string; trailingFramePolicy?: 'DROP_ONE_PROVIDER_TRAILING_FRAME' }, options: ActionWindowOptions = {}): Promise<ActionRegionResult> {
  const tools = createActionMediaTools(options), source = await tools.probe(input.sourcePath), repair = await tools.probe(input.repairPath);
  const region = measuredRegion(input.region, source), w = region.window;
  const out = await outputPath({ ...input, startSeconds: w.startSeconds, endSeconds: w.endSeconds }, source, repair);
  if (repair.width !== region.width || repair.height !== region.height) fail('DIMENSIONS_CHANGED');
  const trimmedTrailingFrames = repair.frames - (w.endFrame - w.startFrame);
  if (repair.fps !== 24 || trimmedTrailingFrames !== 0 && !(input.trailingFramePolicy === 'DROP_ONE_PROVIDER_TRAILING_FRAME' && trimmedTrailingFrames === 1)) fail('REPAIR_TIMING_CHANGED');
  const parts: string[] = [], labels: string[] = [];
  if (w.startFrame) { parts.push(`[0:v]trim=end_frame=${w.startFrame},setpts=PTS-STARTPTS[prefix]`); labels.push('[prefix]'); }
  parts.push(`[0:v]trim=start_frame=${w.startFrame}:end_frame=${w.endFrame},setpts=PTS-STARTPTS[base]`);
  parts.push(`[1:v]trim=end_frame=${w.endFrame - w.startFrame},setpts=PTS-STARTPTS[patch]`);
  parts.push(`[base][patch]overlay=x=${region.x}:y=${region.y}:eof_action=pass:shortest=1:format=yuv420:repeatlast=0[fixed]`);
  labels.push('[fixed]');
  if (w.endFrame < source.frames) { parts.push(`[0:v]trim=start_frame=${w.endFrame},setpts=PTS-STARTPTS[suffix]`); labels.push('[suffix]'); }
  parts.push(`${labels.join('')}concat=n=${labels.length}:v=1:a=0[v]`);
  try {
    await tools.ffmpeg([...preamble, ...inputArgs(source.canonical), ...inputArgs(repair.canonical), '-filter_complex', parts.join(';'), '-map', '[v]', '-map', '0:a?', '-c:a', 'copy', ...encodeArgs, out]);
    const measured = await tools.probe(out);
    if (measured.frames !== source.frames || measured.width !== source.width || measured.height !== source.height || measured.fps !== 24 || measured.audio.length !== source.audio.length) fail('OUTPUT_TIMING');
    return { version: 'ACTION_REGION_V1', outputPath: out, region, width: source.width, height: source.height, outputFrames: measured.frames, fps: 24, originalAudioCopied: source.audio.length > 0, repairInputFrames: repair.frames, trimmedTrailingFrames };
  } catch (error) { await unlink(out).catch(() => undefined); throw error; }
}


/** Explicit generated-action alternative. This path alone permits the reviewed
 * 640px/96-frame provider clip to be downscaled and uniformly shortened. */
export async function prepareFrameToRegion(input:{sourcePath:string;firstFramePath:string;lastFramePath:string;frameToRegion:FrameToRegion},options:ActionWindowOptions={}) {
 const c=assertFrameToRegion(input.frameToRegion),tools=createActionMediaTools(options),source=await tools.probe(input.sourcePath);
 measuredRegion(c.region,source);
 if(resolve(input.firstFramePath)===resolve(input.lastFramePath))fail('OVERWRITE_SOURCE');
 const files:string[]=[];
 try {
  const outputs=[];
  for(const [path,sourceFrame]of [[input.firstFramePath,c.region.window.startFrame],[input.lastFramePath,c.region.window.endFrame-1]] as const){
   const out=await outputPath({sourcePath:input.sourcePath,outputPath:path,startSeconds:0,endSeconds:1},source);files.push(out);
   await tools.ffmpeg([...preamble,...inputArgs(source.canonical),'-vf',`select=eq(n\\,${sourceFrame}),crop=${c.region.width}:${c.region.height}:${c.region.x}:${c.region.y}:exact=1,scale=640:640:flags=lanczos`,'-frames:v','1','-an','-c:v','png','-threads','1','-f','image2',out]);
   const bytes=await readFile(out);
   if(bytes.length<24||bytes.length>4_000_000||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.toString('ascii',12,16)!=='IHDR'||bytes.readUInt32BE(16)!==640||bytes.readUInt32BE(20)!==640)fail('OUTPUT_FORMAT');
   outputs.push({outputPath:out,checksum:createHash('sha256').update(bytes).digest('hex'),byteSize:bytes.length,width:640,height:640,sourceFrame});
  }
  return {proof:{version:FRAME_TO_REGION_VERSION,phase:'PREPARED' as const,frameToRegion:c,firstFrame:c.region.window.startFrame,lastFrame:c.region.window.endFrame-1,width:c.region.width,height:c.region.height,anchorWidth:640,anchorHeight:640},firstFrame:outputs[0],lastFrame:outputs[1]};
 }catch(error){await Promise.all(files.map(p=>unlink(p).catch(()=>undefined)));throw error;}
}
export async function composeFrameToRegion(input:{sourcePath:string;repairPath:string;normalizedPath:string;outputPath:string;frameToRegion:FrameToRegion;actionTiming?:ActionTiming},options:ActionWindowOptions={}) {
 const deadline=Date.now()+(options.timeoutMs??120_000);
 const c=assertFrameToRegion(input.frameToRegion),tools=createActionMediaTools(options),source=await tools.probe(input.sourcePath),repair=await tools.probe(input.repairPath);
 measuredRegion(c.region,source);
 // Some four-second outputs include the endpoint at t=4.000. Keep the
 // approved half-open interval [0, 4s) and its original frame selection.
 const trimmedTrailingFrames = repair.frames - c.providerOutput.frames;
 if(repair.width!==640||repair.height!==640||repair.fps!==24||![0,1].includes(trimmedTrailingFrames)||repair.audio.length)throw new Error('FRAME_TO_REGION_PROVIDER_OUTPUT_INVALID');
 if(resolve(input.normalizedPath)===resolve(input.outputPath))fail('OVERWRITE_SOURCE');
 const normalized=await outputPath({sourcePath:input.sourcePath,outputPath:input.normalizedPath,startSeconds:0,endSeconds:4},source,repair),selected=input.actionTiming ? timedFrameSelection(c,input.actionTiming) : frameSelection(c);
 try{
  if (input.actionTiming) {
    // The follow-through may reuse frames. Remap bounded yuv420p planes rather
    // than blending poses or stretching the original voice track.
    const directory = await mkdtemp(join(dirname(normalized),'timed-frames-'));
    try {
      const decoded = join(directory,'source.yuv'), mapped = join(directory,'timed.yuv');
      const frameBytes = c.region.width*c.region.height*3/2;
      await tools.ffmpeg([...preamble,...inputArgs(repair.canonical),'-map','0:v:0','-an','-vf',`scale=${c.region.width}:${c.region.height}:flags=lanczos`,'-pix_fmt','yuv420p','-f','rawvideo',decoded]);
      if ((await stat(decoded)).size !== repair.frames * frameBytes) fail('OUTPUT_TIMING');
      const sourceFile = await open(decoded,'r');
      try {
        const destination = await open(mapped,'wx',0o600), frame = Buffer.allocUnsafe(frameBytes);
        try {
          for (const index of selected) {
            let offset=0;
            while (offset < frameBytes) {
              const {bytesRead}=await sourceFile.read(frame,offset,frameBytes-offset,index*frameBytes+offset);
              if (!bytesRead) fail('OUTPUT_TIMING');
              offset+=bytesRead;
            }
            await destination.writeFile(frame);
          }
        } finally {await destination.close();}
      } finally {await sourceFile.close();}
      await tools.ffmpeg([...preamble,'-f','rawvideo','-pixel_format','yuv420p','-video_size',`${c.region.width}x${c.region.height}`,'-framerate','24',...inputArgs(mapped),'-an',...encodeArgs,normalized]);
    } finally {await rm(directory,{recursive:true,force:true});}
  } else {
  await tools.ffmpeg([...preamble,...inputArgs(repair.canonical),'-vf',`select=${selected.map(n=>`eq(n\\,${n})`).join('+')},setpts=N/(24*TB),scale=${c.region.width}:${c.region.height}:flags=lanczos`,'-map','0:v:0','-an',...encodeArgs,normalized]);
  }
  const measured=await tools.probe(normalized);
  if(measured.frames!==selected.length||measured.fps!==24||measured.width!==c.region.width||measured.height!==c.region.height)fail('OUTPUT_TIMING');
  const remaining=deadline-Date.now();if(remaining<=0)fail('TIMEOUT');
  const composed=await composeActionRegion({sourcePath:input.sourcePath,repairPath:normalized,outputPath:input.outputPath,region:c.region},{...options,timeoutMs:remaining});
  return {version:FRAME_TO_REGION_VERSION,phase:'COMPOSED' as const,frameToRegion:c,...(input.actionTiming?{actionTiming:input.actionTiming}:{}),outputPath:composed.outputPath,providerInputFrames:repair.frames,trimmedTrailingFrames,providerInputWidth:640,providerInputHeight:640,providerInputFps:24,normalizedFrames:measured.frames,normalizedWidth:measured.width,normalizedHeight:measured.height,selectedProviderFrames:selected,outputFrames:composed.outputFrames,width:composed.width,height:composed.height,fps:24,originalAudioCopied:composed.originalAudioCopied};
 }finally{await unlink(normalized).catch(()=>undefined);}
}
