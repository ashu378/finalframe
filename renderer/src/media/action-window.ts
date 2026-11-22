import { realpath, stat, unlink } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { ChildProcessCommandRunner, type CommandRunner } from './command-runner.js';

/** Local-only preparation/compositing. It does not call a provider or approve a
 * creative repair. The caller must retain the source/repair hashes and lineage. */
export interface ActionWindowInput { sourcePath: string; outputPath: string; startSeconds: number; endSeconds: number }
export interface ActionWindowResult {
  version: 'ACTION_WINDOW_V1'; outputPath: string; width: number; height: number;
  fps: number; fpsNumerator: number; fpsDenominator: number; sourceFrames: number;
  startFrame: number; endFrame: number; windowFrames: number;
  startSeconds: number; endSeconds: number; durationSeconds: number;
  sourceDurationSeconds: number; outputFrames: number; originalAudioCopied: boolean;
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
function createTools(options: ActionWindowOptions) {
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
    const result = await run(options.ffprobeCommand ?? 'ffprobe', ['-v','error','-threads','1','-protocol_whitelist','file,pipe','-select_streams','v:0','-show_frames','-show_streams','-show_format','-show_entries','frame=best_effort_timestamp_time,pkt_duration_time:stream:format','-of','json',canonical]);
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
    return { canonical, width: video.width as number, height: video.height as number, ...r, frames: frames.length, duration, audio };
  };
  return { probe, ffmpeg: (args: string[]) => run(options.ffmpegCommand ?? 'ffmpeg', args, 262144) };
}
type Probe = Awaited<ReturnType<ReturnType<typeof createTools>['probe']>>;
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
  const tools = createTools(options), source = await tools.probe(input.sourcePath), window = windowFor(input,source), out = await outputPath(input,source);
  try {
    await tools.ffmpeg([...preamble,...inputArgs(source.canonical),'-vf',`trim=start_frame=${window.startFrame}:end_frame=${window.endFrame},setpts=PTS-STARTPTS`,'-map','0:v:0','-an',...encodeArgs,out]);
    const measured = await tools.probe(out);
    if (measured.frames !== window.windowFrames || measured.width !== source.width || measured.height !== source.height || measured.fps !== source.fps) fail('OUTPUT_TIMING');
    return result(source,window,out,measured.frames,false);
  } catch (error) { await unlink(out).catch(() => undefined); throw error; }
}
export async function composeActionWindow(input: ActionWindowInput & { repairPath: string }, options: ActionWindowOptions = {}): Promise<ActionWindowResult> {
  const tools = createTools(options), source = await tools.probe(input.sourcePath), window = windowFor(input,source), repair = await tools.probe(input.repairPath), out = await outputPath(input,source,repair);
  // No hidden stretching, cropping, frame insertion, truncation or silence.
  if (repair.width !== source.width || repair.height !== source.height) fail('DIMENSIONS_CHANGED');
  if (repair.fps !== source.fps || repair.frames !== window.windowFrames) fail('REPAIR_TIMING_CHANGED');
  const parts: string[] = [], labels: string[] = [];
  if (window.startFrame) { parts.push(`[0:v]trim=end_frame=${window.startFrame},setpts=PTS-STARTPTS[prefix]`); labels.push('[prefix]'); }
  parts.push('[1:v]setpts=PTS-STARTPTS[repair]'); labels.push('[repair]');
  if (window.endFrame < source.frames) { parts.push(`[0:v]trim=start_frame=${window.endFrame},setpts=PTS-STARTPTS[suffix]`); labels.push('[suffix]'); }
  parts.push(`${labels.join('')}concat=n=${labels.length}:v=1:a=0[v]`);
  try {
    await tools.ffmpeg([...preamble,...inputArgs(source.canonical),...inputArgs(repair.canonical),'-filter_complex',parts.join(';'),'-map','[v]','-map','0:a?','-c:a','copy',...encodeArgs,out]);
    const measured = await tools.probe(out);
    if (measured.frames !== source.frames || measured.fps !== source.fps || measured.audio.length !== source.audio.length) fail('OUTPUT_TIMING');
    return result(source,window,out,measured.frames,source.audio.length > 0);
  } catch (error) { await unlink(out).catch(() => undefined); throw error; }
}
