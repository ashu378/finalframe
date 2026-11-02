import type { OutputCodec, RenderManifest } from './types.js';

export type RenderOutputMimeType = 'video/mp4' | 'video/webm' | 'video/quicktime';
export interface RenderOutputFormat {
  readonly codec: OutputCodec;
  readonly format: 'MP4' | 'WEBM' | 'MOV';
  readonly extension: 'mp4' | 'webm' | 'mov';
  readonly mimeType: RenderOutputMimeType;
}

const formats: readonly RenderOutputFormat[] = [
  { codec: 'h264', format: 'MP4', extension: 'mp4', mimeType: 'video/mp4' },
  { codec: 'vp9', format: 'WEBM', extension: 'webm', mimeType: 'video/webm' },
  { codec: 'prores', format: 'MOV', extension: 'mov', mimeType: 'video/quicktime' },
];

/** Call after validating the manifest; never derive formats from a request's
 * filename, MIME field or a client-selected download extension. */
export function outputFormatForManifest(manifest: Pick<RenderManifest, 'output' | 'export'>): RenderOutputFormat {
  const output = formats.find(value => value.codec === manifest.output.codec);
  if (!output) throw new Error('Unsupported render output codec.');
  if (manifest.export?.format !== undefined && manifest.export.format !== output.format) throw new Error('Render export format does not match the output codec.');
  return output;
}

/** Missing MIME belongs only to persisted pre-format MP4 requests. Reject
 * arbitrary strings before passing them to HTTP headers or artifact paths. */
export function outputFormatForMimeType(mimeType?: unknown): RenderOutputFormat {
  const output = formats.find(value => value.mimeType === (mimeType === undefined ? 'video/mp4' : mimeType));
  if (!output) throw new Error('Unsupported render output media type.');
  return output;
}

/** Canonical stored manifests select the same format as new worker requests.
 * Pre-canonical records retain their historical MP4 meaning only. */
export function outputFormatForStoredManifest(value: unknown, contractVersion?: number): RenderOutputFormat {
  const manifest = typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const version = manifest.version ?? contractVersion;
  if ((contractVersion === 4 || contractVersion === 5) && manifest.version !== contractVersion) throw new Error('Stored render manifest version does not match its contract.');
  if (contractVersion !== undefined && manifest.version !== undefined && contractVersion !== manifest.version) throw new Error('Stored render manifest version does not match its contract.');
  // Historical assembly v3 used H.264/MP4. It stays readable here without
  // becoming an accepted new renderer/assembly contract.
  if (version === undefined || version === 1 || version === 2 || version === 3) return outputFormatForMimeType();
  if (version !== 4 && version !== 5) throw new Error('Unsupported stored render manifest version.');
  const output = manifest.output;
  if (typeof output !== 'object' || output === null || Array.isArray(output)) throw new Error('Stored render output is missing.');
  if (manifest.export !== undefined && (typeof manifest.export !== 'object' || manifest.export === null || Array.isArray(manifest.export))) throw new Error('Stored render export format is invalid.');
  return outputFormatForManifest(manifest as unknown as Pick<RenderManifest, 'output' | 'export'>);
}

export function assertStoredRenderMediaType(manifest: unknown, contractVersion: number | undefined, storedMimeType: unknown, claimedMimeType?: unknown): void {
  const expected = outputFormatForStoredManifest(manifest, contractVersion);
  if (storedMimeType !== expected.mimeType || outputFormatForMimeType(claimedMimeType).mimeType !== expected.mimeType) throw new Error('Stored render media type does not match the approved output format.');
}
