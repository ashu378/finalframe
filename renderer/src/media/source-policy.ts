import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import { isAbsolute, relative, resolve } from 'node:path';
import type { RenderManifest, ValidationIssue, ValidationResult } from '../types.js';

export interface WorkerMediaPolicy {
  mode: 'production' | 'fixture';
  allowedRemoteHosts?: readonly string[];
  allowedLocalRoots?: readonly string[];
  maxSourceLength?: number;
}

const PRIVATE_IPV4 = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[0-1])\.)/;

function isPrivateHost(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/[\[\]]/g, '');
  if (lower === 'localhost' || lower.endsWith('.localhost') || lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd')) return true;
  return isIP(lower) === 4 ? PRIVATE_IPV4.test(lower) : false;
}

function localPathAllowed(source: string, roots: readonly string[], mode: WorkerMediaPolicy['mode']): boolean {
  let path: string;
  try {
    if (source.startsWith('file:')) {
      const url = new URL(source);
      if (url.hostname && url.hostname !== 'localhost') return false;
      if (roots.length === 0) return mode === 'fixture';
      path = fileURLToPath(url);
    } else {
      path = source;
    }
  } catch {
    return false;
  }
  if (!isAbsolute(path)) return false;
  if (roots.length === 0) return mode === 'fixture';
  const resolved = resolve(path);
  return roots.some((root) => {
    const relativePath = relative(resolve(root), resolved);
    return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
  });
}

export function validateWorkerMediaSource(source: unknown, policy: WorkerMediaPolicy): ValidationResult {
  const maxLength = policy.maxSourceLength ?? 2_048;
  const issues: ValidationIssue[] = [];
  if (typeof source !== 'string' || source.length === 0 || source.length > maxLength || /[\u0000\r\n]/.test(source)) {
    return { ok: false, issues: [{ path: 'source', message: `media source must be a bounded string without control characters (max ${maxLength})` }] };
  }
  if (/^(?:data|javascript|blob):/i.test(source)) return { ok: false, issues: [{ path: 'source', message: 'data, javascript, and blob media sources are not allowed on the renderer' }] };
  if (/^https?:\/\//i.test(source)) {
    let url: URL;
    try { url = new URL(source); } catch { return { ok: false, issues: [{ path: 'source', message: 'media URL is invalid' }] }; }
    if (policy.mode === 'production' && url.protocol !== 'https:') issues.push({ path: 'source', message: 'production media URLs must use HTTPS' });
    if (url.username || url.password) issues.push({ path: 'source', message: 'media URLs must not contain credentials' });
    if (isPrivateHost(url.hostname)) issues.push({ path: 'source', message: 'private or loopback media hosts are not allowed' });
    if (policy.allowedRemoteHosts?.length && !policy.allowedRemoteHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
      issues.push({ path: 'source', message: 'media host is not on the renderer allowlist' });
    }
    return { ok: issues.length === 0, issues };
  }
  if (/^file:/i.test(source) || isAbsolute(source)) {
    return localPathAllowed(source, policy.allowedLocalRoots ?? [], policy.mode)
      ? { ok: true, issues: [] }
      : { ok: false, issues: [{ path: 'source', message: 'local media path is outside the renderer allowlist' }] };
  }
  return { ok: false, issues: [{ path: 'source', message: 'media source must be an HTTPS URL or an allowed local worker path' }] };
}

export function validateManifestMediaSources(manifest: RenderManifest, policy: WorkerMediaPolicy): ValidationResult {
  const issues: ValidationIssue[] = [];
  const sources: Array<[string, unknown]> = [];
  manifest.items.forEach((item, index) => {
    if ('src' in item) sources.push([`items[${index}].src`, item.src]);
  });
  manifest.audioTracks?.forEach((track, index) => sources.push([`audioTracks[${index}].src`, track.src]));
  if (manifest.poster) sources.push(['poster.src', manifest.poster.src]);
  manifest.shots?.forEach((shot, index) => sources.push([`shots[${index}].src`, shot.src]));
  for (const [path, source] of sources) {
    const result = validateWorkerMediaSource(source, policy);
    issues.push(...result.issues.map((issue) => ({ ...issue, path })));
  }
  return { ok: issues.length === 0, issues };
}

export function assertManifestMediaSources(manifest: RenderManifest, policy: WorkerMediaPolicy): void {
  const result = validateManifestMediaSources(manifest, policy);
  if (!result.ok) throw new Error(`Unsafe renderer media source(s):\n${result.issues.map((issue) => `- ${issue.path}: ${issue.message}`).join('\n')}`);
}
