'use server';
import { api } from '../../../convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import type { PreparationKind } from '@/lib/ai/preparation';

export async function queuePreparation(input: { productionId: string; kind: PreparationKind; text: string; voiceId?: string; sourceAssetId?: string; idempotencyKey: string }) {
  try {
    const client = await getAuthenticatedConvexClient();
    const job = await client.action(api.preparation.create, { ...input, productionId: input.productionId as any, voiceId: input.voiceId as any, sourceAssetId: input.sourceAssetId as any });
    return { success: true as const, jobId: String(job._id) };
  } catch {
    return { success: false as const, error: 'Preparation could not start. It requires an enabled worker, an approved project voice where relevant, a validated route, and an active capped testing budget.' };
  }
}
