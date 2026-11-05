'use server';
import { makeFunctionReference } from 'convex/server';
import { revalidatePath } from 'next/cache';
import type { Id } from '../../../convex/_generated/dataModel';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';

type CharacterInput = { projectId: string; productionId: string; projectExternalId: string; name: string; description: string; imageAssetId: string; voiceId?: string; voiceVersionId?: string; idempotencyKey: string };
type BibleInput = { projectId: string; productionId: string; projectExternalId: string; characterVersionId: string; sourceBibleId?: string; rules: string[]; story: string; visualStyle: string; idempotencyKey: string };
function safe(error: unknown) {
  const text = error instanceof Error ? error.message : '';
  if (/CHARACTER_SETUP_REQUEST_CHANGED/.test(text)) return 'This request was already saved with different settings. Refresh and review the saved character.';
  if (/CHARACTER_SETUP_REFERENCE_UNAVAILABLE|needs approval|must be approved/.test(text)) return 'Choose an approved stored reference image from this project with current rights.';
  if (/VOICE_|CHARACTER_SETUP_VOICE_UNAVAILABLE/.test(text)) return 'Review the selected project voice, its exact version, approved recordings and current consent before saving.';
  return 'This setup could not be saved. Check your project role, approved references and current versions, then try again.';
}
export async function createGuidedCharacter(input: CharacterInput) {
  try {
    const client = await getAuthenticatedConvexClient();
    const ref = makeFunctionReference<'mutation', { projectId: Id<'projects'>; productionId: Id<'productions'>; name: string; description: string; imageAssetId: Id<'assets'>; voiceId?: Id<'voices'>; voiceVersionId?: Id<'voiceVersions'>; idempotencyKey: string }, { resourceId: Id<'projectResources'>; resourceVersionId: Id<'projectResourceVersions'>; voiceVersionId: Id<'voiceVersions'> | null; replayed: boolean }>('characterSetup:create');
    const saved = await client.mutation(ref, { projectId: input.projectId as Id<'projects'>, productionId: input.productionId as Id<'productions'>, name: input.name, description: input.description, imageAssetId: input.imageAssetId as Id<'assets'>, ...(input.voiceId ? { voiceId: input.voiceId as Id<'voices'>, ...(input.voiceVersionId ? { voiceVersionId: input.voiceVersionId as Id<'voiceVersions'> } : {}) } : {}), idempotencyKey: input.idempotencyKey });
    revalidatePath(`/dashboard/projects/${input.projectExternalId}`);
    return { success: true as const, ...saved };
  } catch (error) { return { success: false as const, error: safe(error) }; }
}
export async function createGuidedBible(input: BibleInput) {
  try {
    const client = await getAuthenticatedConvexClient();
    const ref = makeFunctionReference<'mutation', { projectId: Id<'projects'>; productionId: Id<'productions'>; characterVersionId: Id<'projectResourceVersions'>; sourceBibleId?: Id<'continuityBibles'>; rules: string[]; story: string; visualStyle: string; idempotencyKey: string }, { bibleId: Id<'continuityBibles'>; versionNumber: number }>('characterSetup:createBible');
    const saved = await client.mutation(ref, { projectId: input.projectId as Id<'projects'>, productionId: input.productionId as Id<'productions'>, characterVersionId: input.characterVersionId as Id<'projectResourceVersions'>, ...(input.sourceBibleId ? { sourceBibleId: input.sourceBibleId as Id<'continuityBibles'> } : {}), rules: input.rules, story: input.story, visualStyle: input.visualStyle, idempotencyKey: input.idempotencyKey });
    revalidatePath(`/dashboard/projects/${input.projectExternalId}`);
    return { success: true as const, ...saved };
  } catch (error) { return { success: false as const, error: safe(error) }; }
}
