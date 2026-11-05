import { mkdtemp, open, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { FFprobeAdapter, FFmpegAdapter } from './ffmpeg.js';
import { normalizeSha256, sha256Equal } from './sha256.js';
import { ChildProcessCommandRunner, type CommandRunner } from './command-runner.js';
import { decodedVideoTiming, type DecodedVideoTiming } from './source-audio-contract.js';

export function assertProbeUrl(source: unknown, allowedHosts: readonly string[]): URL {
  if (typeof source !== 'string' || source.length > 2048) throw new Error('A bounded Convex Storage URL is required.');
  const url = new URL(source);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !allowedHosts.includes(url.hostname) || !/\.convex\.cloud$/.test(url.hostname) || !url.pathname.startsWith('/api/storage/')) {
    throw new Error('Media probe requires an allowed Convex Storage URL.');
  }
  return url;
}

/** Download only canonical storage, never a client-supplied local path or a
 * provider URL. The hostname list is explicit for each deployed environment. */
export async function probeRemoteMedia(source: unknown, options: {
  allowedHosts: readonly string[]; ffprobe: FFprobeAdapter; fetch?: typeof fetch; maxBytes?: number;
  kind?: 'video' | 'audio';
  expectedChecksum?: string; expectedByteSize?: number;
  verifyAudioDuration?: boolean; maxAudioDurationSeconds?: number; ffmpeg?: FFmpegAdapter;
  verifyVideoTiming?: boolean; runner?: CommandRunner;
}) {
  const url = assertProbeUrl(source, options.allowedHosts);
  const audioCap=options.maxAudioDurationSeconds??600;
  if(!Number.isSafeInteger(audioCap)||audioCap<1||audioCap>600||options.maxAudioDurationSeconds!==undefined&&(options.kind!=='audio'||options.verifyAudioDuration!==true))throw new Error('Invalid verified audio duration cap.');
  if(options.expectedChecksum!==undefined&&!normalizeSha256(options.expectedChecksum))throw new Error('Invalid canonical SHA-256 checksum.');
  const deadline = Date.now() + 60_000;
  const remaining = (maximum: number) => { const left = deadline - Date.now(); if (left <= 0) throw new Error('Certified media measurement timed out.'); return Math.min(maximum,left); };
  const limit = options.maxBytes ?? 64 * 1024 * 1024;
  const directory = await mkdtemp(join(tmpdir(), 'finalframe-probe-'));
  const path = join(directory, 'input.mp4');
  try {
    const response = await (options.fetch ?? fetch)(url, { redirect: 'error', signal: AbortSignal.timeout(remaining(30_000)) });
    if (!response.ok || !response.body) throw new Error('Canonical media download failed.');
    if (Number(response.headers.get('content-length')) > limit) throw new Error('Media exceeds the probe limit.');
    const file = await open(path, 'wx', 0o600);
    let byteSize = 0; const hash = createHash('sha256');
    try {
      const reader = response.body.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          byteSize += value.byteLength;
          if (byteSize > limit) throw new Error('Media exceeds the probe limit.');
          hash.update(value); await file.writeFile(value);
        }
      } finally { await reader.cancel().catch(() => undefined); }
    } finally { await file.close(); }
    if (!byteSize) throw new Error('Media is empty.');
    const checksum = hash.digest('hex');
    if (options.expectedChecksum !== undefined && !sha256Equal(checksum,options.expectedChecksum) || options.expectedByteSize !== undefined && byteSize !== options.expectedByteSize) throw new Error('Canonical media bytes changed.');
    const metadata = await options.ffprobe.probe(path, { timeoutMs: remaining(15_000) });
    const video = metadata.streams.find((stream) => stream.codec_type === 'video');
    const audio = metadata.streams.find((stream) => stream.codec_type === 'audio');
    const durationSeconds = Number(metadata.format?.duration ?? video?.duration);
    const width = Number(video?.width);
    const height = Number(video?.height);
    if (options.kind === 'audio') {
      let audioDuration = Number(metadata.format?.duration ?? audio?.duration);
      let verified: { durationMeasurement: 'DECODED_PCM_SAMPLES_V1'; decodedSampleCount: number; decodedSampleRate: number } | undefined;
      if (options.verifyAudioDuration) {
        if (!options.ffmpeg || !options.expectedChecksum || !Number.isSafeInteger(options.expectedByteSize) || !audio || video) throw new Error('Certified audio requires exact canonical bytes and an audio-only stream.');
        const pcm = join(directory,'verified-duration.f32'); const rate = 16000;
        // One decoded sample beyond the cap is a sentinel, never a successful
        // truncated result. The default600s compatibility bound is unchanged.
        const maximumSamples=audioCap*rate;const sentinelSamples=maximumSamples+1;
        await options.ffmpeg.execute(['-hide_banner','-loglevel','error','-y','-threads','1','-protocol_whitelist','file,pipe','-i',path,'-map','0:a:0','-vn','-ac','1','-ar',String(rate),'-t',String(sentinelSamples/rate),'-f','f32le','-fs',String(sentinelSamples*4),pcm],{timeoutMs:remaining(45_000),maxOutputBytes:8192});
        const decoded = await stat(pcm);
        if (!decoded.isFile() || decoded.size < 4 || decoded.size % 4 || decoded.size > maximumSamples*4) throw new Error(`Decoded audio is empty, over${audioCap} seconds or truncated at its safety cap.`);
        const decodedSampleCount = decoded.size / 4;
        audioDuration = decodedSampleCount / rate;
        verified = {durationMeasurement:'DECODED_PCM_SAMPLES_V1',decodedSampleCount,decodedSampleRate:rate};
      }
      if (!audio || typeof audio.codec_name !== 'string' || !Number.isFinite(audioDuration) || audioDuration <= 0) throw new Error('Media has no valid audio stream.');
      return { durationSeconds: audioDuration, hasAudio: true, hasVideo: Boolean(video), audioCodec: audio.codec_name, audioFormat: String(metadata.format?.format_name ?? ''), sampleRate: Number(audio.sample_rate), channels: Number(audio.channels), byteSize, checksum:options.expectedChecksum??checksum, ...verified };
    }
    if (!video || !Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width > 7680 || height > 7680 || typeof video.codec_name !== 'string') {
      throw new Error('Media has no valid video stream.');
    }
    let videoTiming: DecodedVideoTiming | undefined;
    if(options.verifyVideoTiming){
      if(!options.expectedChecksum||!Number.isSafeInteger(options.expectedByteSize)||byteSize>50_000_000||durationSeconds>60.000001)throw new Error('SOURCE_AUDIO_VIDEO_TIMING_REQUIRED');
      const [numerator,denominator]=String(video.avg_frame_rate??'').split('/').map(Number);
      const result=await (options.runner??new ChildProcessCommandRunner()).run(options.ffprobe.command,['-v','error','-protocol_whitelist','file,pipe','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time,pkt_duration_time,duration_time','-of','json',path],{timeoutMs:remaining(45000),maxOutputBytes:2_000_000});
      if(Buffer.byteLength(result.stdout)>=2_000_000)throw new Error('SOURCE_AUDIO_VIDEO_TIMING_REQUIRED');
      const frames=JSON.parse(result.stdout).frames as Array<{best_effort_timestamp_time?:string;pkt_duration_time?:string;duration_time?:string}>;
      if(!Array.isArray(frames)||frames.length<1||frames.length>3600)throw new Error('SOURCE_AUDIO_VIDEO_TIMING_REQUIRED');
      const first=Number(frames[0].best_effort_timestamp_time),step=denominator/numerator;
      for(const [i,frame]of frames.entries()){
        const stamp=Number(frame.best_effort_timestamp_time),span=Number(frame.duration_time??frame.pkt_duration_time??step);
        // Ten microseconds only accommodates decimal timestamp printing, not
        // an editorial mismatch or an inferred identity/audio guarantee.
        if(!Number.isFinite(stamp)||!Number.isFinite(span)||Math.abs(stamp-first-i*step)>0.00001||Math.abs(span-step)>0.00001)throw new Error('SOURCE_AUDIO_VIDEO_TIMING_REQUIRED');
      }
      videoTiming=decodedVideoTiming({version:'DECODED_VIDEO_FRAMES_V1',frameCount:frames.length,fpsNumerator:numerator,fpsDenominator:denominator,firstFrameSeconds:first,durationSeconds:frames.length*step});
    }
    return { durationSeconds, width, height, hasVideo: true, checksum:options.expectedChecksum??checksum, videoCodec: video.codec_name, audioCodec: typeof audio?.codec_name === 'string' ? audio.codec_name : undefined, hasAudio: Boolean(audio), byteSize,...(videoTiming?{videoTiming}:{}) };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
