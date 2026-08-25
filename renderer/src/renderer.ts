import { access, mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { assertLockedManifest, assertValidManifest } from './manifest.js';
import { createAssemblyPlan, type AssemblyPlan } from './assembly/plan.js';
import type { RenderArtifactVerification, RenderManifest, RenderMode } from './types.js';
import { assertManifestMediaSources } from './media/source-policy.js';

export interface RenderRequest {
  jobId: string;
  manifest: RenderManifest;
  outputPath: string;
  idempotencyKey?: string;
  correlationId?: string;
  attempt?: number;
  mode?: RenderMode;
}

export interface RenderRuntime {
  render(plan: AssemblyPlan, request: RenderRequest): Promise<{ outputPath: string; durationInFrames: number; verification?: RenderArtifactVerification }>;
}

export interface RenderResult {
  jobId: string;
  outputPath: string;
  durationInFrames: number;
  manifestId: string;
  verification?: RenderArtifactVerification;
}

export interface RenderReceiptStore {
  get(idempotencyKey: string): Promise<RenderResult | null>;
  put(idempotencyKey: string, result: RenderResult): Promise<void>;
}

export class MemoryRenderReceiptStore implements RenderReceiptStore {
  private readonly receipts = new Map<string, RenderResult>();
  async get(idempotencyKey: string) { return this.receipts.get(idempotencyKey) ?? null; }
  async put(idempotencyKey: string, result: RenderResult) { this.receipts.set(idempotencyKey, result); }
}

function stableKey(request: RenderRequest): string {
  if (request.idempotencyKey?.trim()) return request.idempotencyKey.trim();
  return `render:${request.jobId}:${request.manifest.manifestId}`;
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

export class BoundedDeterministicRenderer {
  constructor(
    private readonly runtime: RenderRuntime,
    private readonly limits: { maxDurationInFrames?: number; maxItems?: number; maxOutputBytes?: number; allowedRemoteHosts?: readonly string[]; allowedLocalRoots?: readonly string[] } = {},
    private readonly receipts: RenderReceiptStore = new MemoryRenderReceiptStore(),
    private readonly inFlight = new Map<string, Promise<RenderResult>>(),
  ) {}

  async render(request: RenderRequest): Promise<RenderResult> {
    if (!request.jobId.trim()) throw new Error('Render jobId is required.');
    if (!isAbsolute(request.outputPath) || request.outputPath.includes('\u0000')) throw new Error('Render outputPath must be an absolute safe path.');
    const mode = request.mode ?? 'production';
    const manifest = mode === 'production' ? assertLockedManifest(request.manifest) : assertValidManifest(request.manifest);
    assertManifestMediaSources(manifest, { mode, allowedRemoteHosts: this.limits.allowedRemoteHosts, allowedLocalRoots: this.limits.allowedLocalRoots });
    const plan = createAssemblyPlan(manifest);
    if (this.limits.maxDurationInFrames !== undefined && plan.durationInFrames > this.limits.maxDurationInFrames) {
      throw new Error(`Render duration ${plan.durationInFrames} exceeds worker limit ${this.limits.maxDurationInFrames} frames`);
    }
    if (this.limits.maxItems !== undefined && plan.items.length > this.limits.maxItems) {
      throw new Error(`Render item count ${plan.items.length} exceeds worker limit ${this.limits.maxItems}`);
    }
    if (mode === 'production' && /(?:^|[\\/])fixtures(?:[\\/])/i.test(request.outputPath)) {
      throw new Error('Production output cannot be written inside a fixture directory.');
    }
    const idempotencyKey = stableKey(request);
    const previous = await this.receipts.get(idempotencyKey);
    if (previous && await exists(previous.outputPath)) return previous;
    const pending = this.inFlight.get(idempotencyKey);
    if (pending) return pending;
    const operation = this.renderOnce(plan, { ...request, manifest, mode }, idempotencyKey);
    this.inFlight.set(idempotencyKey, operation);
    try { return await operation; } finally { this.inFlight.delete(idempotencyKey); }
  }

  private async renderOnce(plan: AssemblyPlan, request: RenderRequest, idempotencyKey: string): Promise<RenderResult> {
    const outputDir = dirname(request.outputPath);
    await mkdir(outputDir, { recursive: true });
    const safeName = idempotencyKey.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 96);
    const partialPath = join(outputDir, `.${safeName}.partial`);
    await rm(partialPath, { force: true });
    try {
      const result = await this.runtime.render(plan, { ...request, outputPath: partialPath });
      if (result.durationInFrames !== plan.durationInFrames) throw new Error(`Renderer returned ${result.durationInFrames} frames; expected ${plan.durationInFrames}.`);
      if (!await exists(result.outputPath)) throw new Error('Renderer did not produce an output file.');
      const outputStats = await stat(result.outputPath);
      if (!outputStats.isFile() || outputStats.size < 1) throw new Error('Renderer produced an empty or invalid output file.');
      if (this.limits.maxOutputBytes !== undefined && outputStats.size > this.limits.maxOutputBytes) {
        throw new Error(`Renderer output exceeds the worker limit of ${this.limits.maxOutputBytes} bytes.`);
      }
      if (request.mode !== 'fixture') this.assertVerifiedProductionOutput(result.verification, plan, outputStats.size);
      await rm(request.outputPath, { force: true });
      if (result.outputPath !== partialPath) await rename(result.outputPath, partialPath);
      await rename(partialPath, request.outputPath);
      const completed = { jobId: request.jobId, manifestId: plan.manifestId, outputPath: request.outputPath, durationInFrames: result.durationInFrames, verification: result.verification };
      await this.receipts.put(idempotencyKey, completed);
      return completed;
    } finally {
      await rm(partialPath, { force: true });
    }
  }

  private assertVerifiedProductionOutput(verification: RenderArtifactVerification | undefined, plan: AssemblyPlan, fileSizeBytes: number): void {
    if (!verification || verification.checkedBy !== 'ffprobe') {
      throw new Error('Production render refused: output must be verified by ffprobe before success is reported.');
    }
    if (verification.fileSizeBytes !== fileSizeBytes) throw new Error('Production render verification does not match the stored output size.');
    if (verification.width !== plan.width || verification.height !== plan.height) throw new Error('Production render verification dimensions do not match the locked manifest.');
    if (Math.abs(verification.fps - plan.fps) > 0.01) throw new Error('Production render verification frame rate does not match the locked manifest.');
    if (verification.durationSeconds <= 0 || Math.abs(verification.durationSeconds - plan.durationInFrames / plan.fps) > Math.max(0.1, 1 / plan.fps)) {
      throw new Error('Production render verification duration does not match the locked manifest.');
    }
    const expectedOrder = plan.items.map((item) => item.id);
    if (JSON.stringify(verification.orderedItemIds) !== JSON.stringify(expectedOrder)) throw new Error('Production render verification order does not match the locked assembly plan.');
    if (verification.captionTrackCount !== plan.captionTracks.length) throw new Error('Production render verification caption count does not match the locked manifest.');
    if (plan.audioTracks.length > 0 && !verification.hasAudio) throw new Error('Production render verification did not find the required audio stream.');
  }
}
