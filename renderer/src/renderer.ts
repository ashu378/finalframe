import { assertValidManifest } from './manifest.js';
import { createAssemblyPlan, type AssemblyPlan } from './assembly/plan.js';
import type { RenderManifest } from './types.js';

export interface RenderRequest {
  jobId: string;
  manifest: RenderManifest;
  outputPath: string;
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

export class BoundedDeterministicRenderer {
  constructor(
    private readonly runtime: RenderRuntime,
    private readonly limits: { maxDurationInFrames?: number; maxItems?: number } = {},
  ) {}

  async render(request: RenderRequest): Promise<RenderResult> {
    const manifest = assertValidManifest(request.manifest);
    const plan = createAssemblyPlan(manifest);
    if (this.limits.maxDurationInFrames !== undefined && plan.durationInFrames > this.limits.maxDurationInFrames) {
      throw new Error(`Render duration ${plan.durationInFrames} exceeds worker limit ${this.limits.maxDurationInFrames} frames`);
    }
    if (this.limits.maxItems !== undefined && plan.items.length > this.limits.maxItems) {
      throw new Error(`Render item count ${plan.items.length} exceeds worker limit ${this.limits.maxItems}`);
    }
    const result = await this.runtime.render(plan, request);
    return { jobId: request.jobId, manifestId: plan.manifestId, ...result };
  }
}
