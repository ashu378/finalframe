import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FFprobeAdapter } from './ffmpeg.js';

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
}) {
  const url = assertProbeUrl(source, options.allowedHosts);
  const limit = options.maxBytes ?? 64 * 1024 * 1024;
  const directory = await mkdtemp(join(tmpdir(), 'finalframe-probe-'));
  const path = join(directory, 'input.mp4');
  try {
    const response = await (options.fetch ?? fetch)(url, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
    if (!response.ok || !response.body) throw new Error('Canonical media download failed.');
    if (Number(response.headers.get('content-length')) > limit) throw new Error('Media exceeds the probe limit.');
    const file = await open(path, 'wx', 0o600);
    let byteSize = 0;
    try {
      const reader = response.body.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          byteSize += value.byteLength;
          if (byteSize > limit) throw new Error('Media exceeds the probe limit.');
          await file.write(value);
        }
      } finally { await reader.cancel().catch(() => undefined); }
    } finally { await file.close(); }
    if (!byteSize) throw new Error('Media is empty.');
    const metadata = await options.ffprobe.probe(path, { timeoutMs: 15_000 });
    const video = metadata.streams.find((stream) => stream.codec_type === 'video');
    const audio = metadata.streams.find((stream) => stream.codec_type === 'audio');
    const durationSeconds = Number(metadata.format?.duration ?? video?.duration);
    const width = Number(video?.width);
    const height = Number(video?.height);
    if (options.kind === 'audio') {
      const audioDuration = Number(metadata.format?.duration ?? audio?.duration);
      if (!audio || typeof audio.codec_name !== 'string' || !Number.isFinite(audioDuration) || audioDuration <= 0) throw new Error('Media has no valid audio stream.');
      return { durationSeconds: audioDuration, hasAudio: true, hasVideo: Boolean(video), audioCodec: audio.codec_name, sampleRate: Number(audio.sample_rate), channels: Number(audio.channels), byteSize };
    }
    if (!video || !Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width > 7680 || height > 7680 || typeof video.codec_name !== 'string') {
      throw new Error('Media has no valid video stream.');
    }
    return { durationSeconds, width, height, videoCodec: video.codec_name, audioCodec: typeof audio?.codec_name === 'string' ? audio.codec_name : undefined, hasAudio: Boolean(audio), byteSize };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
