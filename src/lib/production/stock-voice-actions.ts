'use server';
import { api } from '../../../convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import type { Id } from '../../../convex/_generated/dataModel';

async function projectClient(projectExternalId: string) {
  const client = await getAuthenticatedConvexClient();
  const project = await client.query(api.projects.getByExternalId, { externalId: projectExternalId });
  if (!project) throw new Error('Project is unavailable.');
  return { client, project };
}
export async function loadStockVoiceChoices(projectExternalId: string) {
  try {
    const { client, project } = await projectClient(projectExternalId);
    const result = await client.action(api.stockVoices.catalog, { projectId: project._id });
    return { success: true as const, ...result };
  } catch { return { success: false as const, error: 'The verified stock voice catalog could not be loaded. Try again when the provider catalog is available.' }; }
}
export async function selectProjectStockVoice(input: { projectExternalId: string; voiceId?: string; name: string; selectionKey: string; requestId: string }) {
  try {
    const { client, project } = await projectClient(input.projectExternalId);
    const result = await client.action(api.stockVoices.select, { projectId: project._id, voiceId: input.voiceId as Id<'voices'> | undefined, name: input.name, selectionKey: input.selectionKey, idempotencyKey: `stock-voice:${input.requestId}` });
    return { success: true as const, voiceId: result.voiceId };
  } catch { return { success: false as const, error: 'The stock voice could not be saved. Choose a current catalog voice and use an editable project profile. Approved, locked, or revoked voices cannot be rebound.' }; }
}
