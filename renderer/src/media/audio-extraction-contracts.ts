/** Shared browser/Convex/worker contract. No provider or paid-operation route. */
export const AUDIO_EXTRACTION_PROFILE = 'VIDEO_AUDIO_WAV_48K_STEREO_V1' as const;
export const AUDIO_EXTRACTION_LIMITS = {
  sampleRate: 48000, channels: 2, bytesPerSampleFrame: 4, maxSeconds: 60,
  maxSourceBytes: 50_000_000, maxDataBytes: 11_520_000, maxHeaderBytes: 4096,
  maxOutputBytes: 11_524_096, maxVideoPackets: 15000, maxProbeBytes: 4 * 1024 * 1024,
  processingTimeoutMs: 90_000, leaseMs: 120_000, maxAttempts: 3,
  maxQueueMs: 2 * 60 * 60 * 1000, privateRetentionMs: 2 * 60 * 60 * 1000,
} as const;
export const EXTRACTION_VIDEO_MIMES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;
export function extractionError(code: string) { return Object.assign(new Error(code), { code }); }
export function extractionWindow(startSeconds: number, durationSeconds: number) {
  const rate = AUDIO_EXTRACTION_LIMITS.sampleRate;
  if (!Number.isFinite(startSeconds) || !Number.isFinite(durationSeconds) || startSeconds < 0 || durationSeconds <= 0 || durationSeconds > 60) throw extractionError('EXTRACTION_WINDOW_INVALID');
  const startSample = Math.round(startSeconds * rate), sampleCount = Math.round(durationSeconds * rate);
  if (!Number.isSafeInteger(startSample) || !Number.isSafeInteger(sampleCount) || startSample < 0 || sampleCount < 1 || startSample + sampleCount > 60 * rate) throw extractionError('EXTRACTION_WINDOW_INVALID');
  return { startSample, sampleCount };
}
export function assertExtractionSamples(startSample: number, sampleCount: number) {
  if (!Number.isSafeInteger(startSample) || !Number.isSafeInteger(sampleCount) || startSample < 0 || sampleCount < 1 || startSample + sampleCount > 60 * 48000) throw extractionError('EXTRACTION_WINDOW_INVALID');
}
export function safeExtractionError(code: unknown): string {
  return typeof code === 'string' && ['EXTRACTION_WINDOW_INVALID','EXTRACTION_SOURCE_UNAVAILABLE','EXTRACTION_SOURCE_CHANGED','EXTRACTION_AUDIO_UNAVAILABLE','EXTRACTION_SOURCE_LIMIT','EXTRACTION_OUTPUT_INVALID','EXTRACTION_AUDIO_WINDOW_SHORT','EXTRACTION_AUTHORITY_CHANGED','EXTRACTION_WORKER_UNAVAILABLE','EXTRACTION_CANCELED','EXTRACTION_RETRY_EXHAUSTED','EXTRACTION_LEASE_EXPIRED'].includes(code) ? code : 'EXTRACTION_FAILED';
}
export function retryableExtractionError(code: string) { return ['EXTRACTION_WORKER_UNAVAILABLE','EXTRACTION_LEASE_EXPIRED'].includes(code); }

/** Parse the actual bounded RIFF bytes, including chunk padding and PCM shape.
 * Header length is not assumed: FFmpeg commonly emits a LIST chunk. */
export function assertExtractedWav(bytes: Uint8Array, expectedSampleCount?: number) {
  const limits = AUDIO_EXTRACTION_LIMITS;
  if (bytes.byteLength < 44 || bytes.byteLength > limits.maxOutputBytes) throw extractionError('EXTRACTION_OUTPUT_INVALID');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const four = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (four(0) !== 'RIFF' || four(8) !== 'WAVE' || view.getUint32(4,true) !== bytes.byteLength - 8) throw extractionError('EXTRACTION_OUTPUT_INVALID');
  let at = 12, count = 0, format = false, dataBytes: number | undefined;
  while (at < bytes.byteLength) {
    if (++count > 32 || at + 8 > bytes.byteLength) throw extractionError('EXTRACTION_OUTPUT_INVALID');
    const id = four(at), size = view.getUint32(at + 4,true), body = at + 8, end = body + size;
    if (!Number.isSafeInteger(end) || end > bytes.byteLength || end + (size % 2) > bytes.byteLength) throw extractionError('EXTRACTION_OUTPUT_INVALID');
    if (id === 'fmt ') {
      if (format || ![16,18].includes(size) || view.getUint16(body,true) !== 1 || view.getUint16(body+2,true) !== 2 || view.getUint32(body+4,true) !== 48000 || view.getUint32(body+8,true) !== 192000 || view.getUint16(body+12,true) !== 4 || view.getUint16(body+14,true) !== 16 || size === 18 && view.getUint16(body+16,true) !== 0) throw extractionError('EXTRACTION_OUTPUT_INVALID');
      format = true;
    } else if (id === 'data') {
      if (!format || dataBytes !== undefined || size < 4 || size > limits.maxDataBytes || size % 4) throw extractionError('EXTRACTION_OUTPUT_INVALID');
      dataBytes = size;
    } else if (!['LIST','JUNK','bext','iXML'].includes(id) || size > limits.maxHeaderBytes) throw extractionError('EXTRACTION_OUTPUT_INVALID');
    at = end + size % 2;
  }
  if (!format || dataBytes === undefined || bytes.byteLength - dataBytes > limits.maxHeaderBytes) throw extractionError('EXTRACTION_OUTPUT_INVALID');
  const sampleCount = dataBytes / 4;
  if (expectedSampleCount !== undefined && sampleCount !== expectedSampleCount) throw extractionError('EXTRACTION_AUDIO_WINDOW_SHORT');
  return { profile: AUDIO_EXTRACTION_PROFILE, sampleRate: 48000 as const, channels: 2 as const, audioCodec: 'pcm_s16le' as const, sampleCount, durationSeconds: sampleCount / 48000, byteSize: bytes.byteLength };
}
