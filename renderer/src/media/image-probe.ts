import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertProbeUrl } from './remote-probe.js';
import type { FFprobeAdapter } from './ffmpeg.js';
import { normalizeSha256, sha256Equal } from './sha256.js';

/** Header geometry bounds decoding before FFprobe counts frames. This is a
 * deliberately narrow PNG/JPEG still-image contract, not a general decoder. */
export function boundedStillImage(bytes: Buffer, mimeType: string) {
  let width = 0; let height = 0; let codec = '';
  if (mimeType === 'image/png' && bytes.length >= 33 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    let at = 8; let ended = false; let header = false;
    while (at + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(at); const type = bytes.toString('ascii',at+4,at+8);
      if (length > bytes.length - at - 12 || type === 'acTL' || type === 'fcTL' || type === 'fdAT') throw new Error('Animated or malformed portraits are unsupported.');
      if (!header) { if (type !== 'IHDR' || length !== 13) throw new Error('Invalid PNG portrait.'); width = bytes.readUInt32BE(at+8); height = bytes.readUInt32BE(at+12); header = true; }
      else if (type === 'IHDR') throw new Error('Multiple PNG images are unsupported.');
      at += length + 12;
      if (type === 'IEND') { if (length !== 0 || at !== bytes.length) throw new Error('Portrait contains trailing media.'); ended = true; break; }
    }
    if (!ended) throw new Error('Incomplete PNG portrait.'); codec = 'png';
  } else if (mimeType === 'image/jpeg' && bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes.at(-2) === 255 && bytes.at(-1) === 217) {
    let at = 2; let scan = false; let ended = false;
    while (at < bytes.length) {
      if (bytes[at++] !== 255) { if (scan) continue; throw new Error('Invalid JPEG portrait.'); }
      while (at < bytes.length && bytes[at] === 255) at++;
      const marker = bytes[at++];
      if (scan && (marker === 0 || marker >= 208 && marker <= 215)) continue;
      if (marker === 217) { if (at !== bytes.length) throw new Error('Portrait contains trailing media.'); ended = true; break; }
      if (marker === 216 || at + 2 > bytes.length) throw new Error('Multiple or incomplete JPEG images are unsupported.');
      const length = bytes.readUInt16BE(at);
      if (length < 2 || at + length > bytes.length) throw new Error('Invalid JPEG segment.');
      if ([192,193,194].includes(marker)) { if (length < 8 || width) throw new Error('Invalid JPEG geometry.'); height = bytes.readUInt16BE(at+3); width = bytes.readUInt16BE(at+5); }
      scan = marker === 218; at += length;
    }
    if (!ended) throw new Error('Incomplete JPEG portrait.');
    codec = 'mjpeg';
  } else throw new Error('Choose canonical PNG or JPEG portrait bytes.');
  if (!width || !height || width >= 2000 || height >= 2000) throw new Error('Portrait dimensions must be positive and below 2K.');
  return { width, height, imageCodec: codec };
}

export async function probeCanonicalImage(value: unknown, options: { allowedHosts: readonly string[]; ffprobe: FFprobeAdapter; fetch?: typeof fetch }) {
  const input = value as { url?: unknown; checksum?: unknown; byteSize?: unknown; mimeType?: unknown };
  const url = assertProbeUrl(input?.url, options.allowedHosts);
  if (!normalizeSha256(input.checksum) || !Number.isSafeInteger(input.byteSize) || Number(input.byteSize) <= 0 || Number(input.byteSize) > 16_000_000 || !['image/png','image/jpeg'].includes(String(input.mimeType))) throw new Error('Choose a bounded canonical portrait.');
  const response = await (options.fetch ?? fetch)(url, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
  if (!response.ok || !response.body || response.headers.get('content-type')?.split(';')[0] !== input.mimeType) throw new Error('Portrait content type changed.');
  const chunks: Uint8Array[] = []; let size = 0; const reader = response.body.getReader();
  try { for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > Number(input.byteSize)) throw new Error('Portrait exceeds its exact byte limit.'); chunks.push(next.value); } } finally { await reader.cancel().catch(() => undefined); }
  const bytes = Buffer.concat(chunks);
  const checksum = createHash('sha256').update(bytes).digest('hex');
  if (size !== input.byteSize || !sha256Equal(checksum,input.checksum)) throw new Error('Portrait bytes changed.');
  const geometry = boundedStillImage(bytes, String(input.mimeType));
  const directory = await mkdtemp(join(tmpdir(),'finalframe-image-probe-'));
  try {
    const path = join(directory, geometry.imageCodec === 'png' ? 'portrait.png' : 'portrait.jpg'); await writeFile(path,bytes,{mode:0o600,flag:'wx'});
    const probe = await options.ffprobe.probe(path,{timeoutMs:15_000,countFrames:true});
    const image = probe.streams[0];
    if (probe.streams.length !== 1 || image?.codec_type !== 'video' || image.codec_name !== geometry.imageCodec || Number(image.nb_read_frames) !== 1 || Number(image.width) !== geometry.width || Number(image.height) !== geometry.height || !['png_pipe','jpeg_pipe','image2'].includes(String(probe.format?.format_name))) throw new Error('Choose exactly one PNG or JPEG image without audio or motion.');
    return { ...geometry, checksum:String(input.checksum), byteSize: size, mimeType: input.mimeType, frameCount: 1 };
  } finally { await rm(directory,{recursive:true,force:true}); }
}
