import { access, mkdir, rename, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { assertValidManifest } from './manifest.js';
import { createAssemblyPlan, type AssemblyPlan } from './assembly/plan.js';
import type { RenderManifest } from './types.js';

export interface RenderRequest {
  jobId: string;
  manifest: RenderManifest;
  outputPath: string;
  idempotencyKey?: string;
  correlationId?: string;
  attempt?: number;
}

export interface RenderRuntime {
  render(plan: AssemblyPlan, request: RenderRequest): Promise<{ outputPath: string; durationInFrames: number }>;
}

export interface RenderResult {
  jobId: string;
  outputPath: string;
  durationInFrames: number;
  manifestId: string;
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
    private readonly limits: { maxDurationInFrames?: number; maxItems?: number } = {},
    private readonly receipts: RenderReceiptStore = new MemoryRenderReceiptStore(),
    private readonly inFlight = new Map<string, Promise<RenderResult>>(),
  ) {}

  async render(request: RenderRequest): Promise<RenderResult> {
    if (!request.jobId.trim()) throw new Error('Render jobId is required.');
    if (!isAbsolute(request.outputPath) || request.outputPath.includes('\u0000')) throw new Error('Render outputPath must be an absolute safe path.');
    const manifest = assertValidManifest(request.manifest);
    const plan = createAssemblyPlan(manifest);
    if (this.limits.maxDurationInFrames !== undefined && plan.durationInFrames > this.limits.maxDurationInFrames) {
      throw new Error(`Render duration ${plan.durationInFrames} exceeds worker limit ${this.limits.maxDurationInFrames} frames`);
    }
    if (this.limits.maxItems !== undefined && plan.items.length > this.limits.maxItems) {
      throw new Error(`Render item count ${plan.items.length} exceeds worker limit ${this.limits.maxItems}`);
    }
    const idempotencyKey = stableKey(request);
    const previous = await this.receipts.get(idempotencyKey);
    if (previous && await exists(previous.outputPath)) return previous;
    const pending = this.inFlight.get(idempotencyKey);
    if (pending) return pending;
    const operation = this.renderOnce(plan, { ...request, manifest }, idempotencyKey);
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
      await rm(request.outputPath, { force: true });
      if (result.outputPath !== partialPath) await rename(result.outputPath, partialPath);
      await rename(partialPath, request.outputPath);
      const completed = { jobId: request.jobId, manifestId: plan.manifestId, outputPath: request.outputPath, durationInFrames: result.durationInFrames };
      await this.receipts.put(idempotencyKey, completed);
      return completed;
    } finally {
      await rm(partialPath, { force: true });
    }
  }
}
