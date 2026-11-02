import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, open, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Worker } from 'node:worker_threads';
import { assertProbeUrl } from './remote-probe.js';
import type { FFmpegAdapter, FFprobeAdapter } from './ffmpeg.js';
import { assertBeatAnalysisResult, BEAT_ANALYSIS_LIMITS, BEAT_ANALYSIS_VERSION, type BeatAnalysisResult } from './beat-detector.js';

export interface BeatAnalysisRequest {
  jobId: string; leaseId: string; projectId: string; assetId: string; storageId: string;
  sourceChecksum: string; assetChecksum: string; byteSize: number; algorithmVersion: string; url: string;
}

/** Only derived cache receipts are evictable. Source audio and authoritative
 * job/version records never live here. Preserve unfamiliar files for review. */
async function boundCache(directory: string, keepPath?: string) {
  const names = await readdir(directory);
  if (names.length > 512) throw new Error('Beat cache needs an administrator check.');
  const entries: Array<{ path: string; size: number; modified: number }> = [];
  for (const name of names) {
    const path = join(directory, name); const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Beat cache needs an administrator check.');
    if (/^[a-f0-9]{64}\.json\.[a-f0-9-]{36}\.tmp$/.test(name)) {
      if (Date.now() - info.mtimeMs > 3_600_000) await rm(path);
      continue;
    }
    if (!/^[a-f0-9]{64}\.json$/.test(name) || info.size > 256 * 1024) throw new Error('Beat cache needs an administrator check.');
    entries.push({ path, size: info.size, modified: info.mtimeMs });
  }
  let bytes = entries.reduce((total, entry) => total + entry.size, 0); let count = entries.length;
  for (const entry of entries.sort((a,b) => a.modified-b.modified)) {
    if (count <= 128 && bytes <= 16 * 1024 * 1024) break;
    if (entry.path === keepPath) continue;
    await rm(entry.path); count--; bytes -= entry.size;
  }
}

export function assertBeatAnalysisRequest(value: unknown, allowedHosts: readonly string[]): BeatAnalysisRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('A bounded beat analysis request is required.');
  const request = value as BeatAnalysisRequest;
  for (const key of ['jobId', 'leaseId', 'projectId', 'assetId', 'storageId'] as const) if (typeof request[key] !== 'string' || !/^[a-zA-Z0-9:._-]{1,200}$/.test(request[key])) throw new Error('Beat analysis identifiers are invalid.');
  if (!/^[a-f0-9]{64}$/i.test(request.sourceChecksum) || typeof request.assetChecksum !== 'string' || !request.assetChecksum || request.assetChecksum.length > 200 || request.algorithmVersion !== BEAT_ANALYSIS_VERSION || !Number.isSafeInteger(request.byteSize) || request.byteSize <= 0 || request.byteSize > BEAT_ANALYSIS_LIMITS.maxSourceBytes) throw new Error('Beat analysis source exceeds its certified bounds.');
  assertProbeUrl(request.url, allowedHosts);
  return request;
}

export async function analyzeDecodedPcm(inputPath: string, timeoutMs: number): Promise<BeatAnalysisResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./beat-analysis-thread.js', import.meta.url), { workerData: { inputPath }, resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 } });
    let settled = false;
    const timeout = setTimeout(() => finish(new Error('Beat analysis exceeded its bounded compute time.')), Math.max(1, timeoutMs));
    const finish = (error?: Error, result?: unknown) => {
      if (settled) return; settled = true; clearTimeout(timeout); void worker.terminate();
      if (error) reject(error); else { try { resolve(assertBeatAnalysisResult(result)); } catch { reject(new Error('Beat analysis returned invalid bounded output.')); } }
    };
    worker.once('message', value => finish(value?.error ? new Error('Decoded audio could not be analyzed.') : undefined, value?.result));
    worker.once('error', () => finish(new Error('The bounded beat analysis worker failed.')));
    worker.once('exit', code => { if (!settled) finish(new Error(`The beat analysis worker exited before completion (${code}).`)); });
  });
}

export async function analyzeCanonicalAudio(rawRequest: unknown, options: {
  allowedHosts: readonly string[]; ffmpeg: FFmpegAdapter; ffprobe: FFprobeAdapter;
  cacheRoot: string; fetch?: typeof globalThis.fetch; timeoutMs?: number;
}) {
  const request = assertBeatAnalysisRequest(rawRequest, options.allowedHosts);
  const deadline = Date.now() + Math.min(options.timeoutMs ?? 120_000, 120_000);
  const remaining = (maximum: number) => { const left = deadline - Date.now(); if (left <= 0) throw new Error('Beat analysis exceeded its bounded processing time.'); return Math.min(maximum, left); };
  const key = createHash('sha256').update(JSON.stringify([request.projectId, request.assetId, request.storageId, request.sourceChecksum, request.assetChecksum, BEAT_ANALYSIS_VERSION])).digest('hex');
  await mkdir(options.cacheRoot, { recursive: true, mode: 0o700 });
  const cacheDirectory = await lstat(options.cacheRoot);
  if (!cacheDirectory.isDirectory() || cacheDirectory.isSymbolicLink() || (cacheDirectory.mode & 0o077)) throw new Error('Beat cache requires a private worker directory.');
  const cachePath = join(options.cacheRoot, `${key}.json`);
  await boundCache(options.cacheRoot, cachePath);
  try {
    const info = await lstat(cachePath);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 256 * 1024) throw new Error('Invalid beat cache.');
    const cached = JSON.parse(await readFile(cachePath, 'utf8'));
    if (cached.key !== key || cached.byteSize !== request.byteSize || cached.sourceChecksum !== request.sourceChecksum) throw new Error('Beat cache ownership mismatch.');
    return { ...request, url: undefined, result: assertBeatAnalysisResult(cached.result), cached: true };
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Beat cache needs an administrator check.'); }
  const directory = await mkdtemp(join(tmpdir(), 'finalframe-beats-')); const inputPath = join(directory, 'source.media'); const pcmPath = join(directory, 'decoded.f32');
  try {
    const response = await (options.fetch ?? globalThis.fetch)(request.url, { redirect: 'error', signal: AbortSignal.timeout(remaining(30_000)) });
    if (!response.ok || !response.body || Number(response.headers.get('content-length')) > BEAT_ANALYSIS_LIMITS.maxSourceBytes) throw new Error('The canonical audio download failed or exceeds its limit.');
    const file = await open(inputPath, 'wx', 0o600); const hash = createHash('sha256'); let byteSize = 0;
    const reader = response.body.getReader();
    try {
      while (true) { const next = await reader.read(); if (next.done) break; byteSize += next.value.byteLength; if (byteSize > BEAT_ANALYSIS_LIMITS.maxSourceBytes || byteSize > request.byteSize) throw new Error('Audio bytes exceed the exact approved source.'); hash.update(next.value); await file.writeFile(next.value); }
    } finally { await reader.cancel().catch(() => undefined); await file.close(); }
    if (byteSize !== request.byteSize || hash.digest('hex') !== request.sourceChecksum.toLowerCase()) throw new Error('Downloaded audio does not match its exact storage checksum.');
    const probe = await options.ffprobe.probe(inputPath, { timeoutMs: remaining(15_000) });
    const audio = probe.streams.find(stream => stream.codec_type === 'audio'); const duration = Number(probe.format?.duration ?? audio?.duration);
    if (!audio || !Number.isFinite(duration) || duration <= 0 || duration > BEAT_ANALYSIS_LIMITS.maxDurationSeconds || !Number.isInteger(Number(audio.channels)) || Number(audio.channels) < 1 || Number(audio.channels) > 8) throw new Error('Choose valid audio of at most ten minutes and eight channels.');
    await options.ffmpeg.execute(['-hide_banner', '-loglevel', 'error', '-y', '-threads', '1', '-protocol_whitelist', 'file,pipe', '-i', inputPath, '-map', '0:a:0', '-vn', '-ac', '1', '-ar', String(BEAT_ANALYSIS_LIMITS.sampleRate), '-t', String(BEAT_ANALYSIS_LIMITS.maxDurationSeconds + 1), '-f', 'f32le', '-fs', String((BEAT_ANALYSIS_LIMITS.maxDurationSeconds + 1) * BEAT_ANALYSIS_LIMITS.sampleRate * 4), pcmPath], { timeoutMs: remaining(45_000), maxOutputBytes: 8_192 });
    const decoded = await stat(pcmPath);
    if (!decoded.isFile() || decoded.size < 4 || decoded.size % 4 || decoded.size > BEAT_ANALYSIS_LIMITS.maxDurationSeconds * BEAT_ANALYSIS_LIMITS.sampleRate * 4) throw new Error('Decoded audio exceeds the bounded PCM limit.');
    const result = await analyzeDecodedPcm(pcmPath, remaining(60_000));
    const temporary = `${cachePath}.${randomUUID()}.tmp`; const receipt = await open(temporary, 'wx', 0o600);
    try {
      try { await receipt.writeFile(JSON.stringify({ key, byteSize, sourceChecksum: request.sourceChecksum, result })); await receipt.sync(); } finally { await receipt.close(); }
      await rename(temporary, cachePath);
    } finally { await rm(temporary, { force: true }); }
    await boundCache(options.cacheRoot, cachePath);
    return { ...request, url: undefined, result, cached: false };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
