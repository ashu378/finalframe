'use server';

import { redirect } from 'next/navigation';
import { api } from '../../../convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import { CREATIVE_DNA_OPTIONS } from './types';

async function client() {
  const convex = await getAuthenticatedConvexClient();
  await convex.mutation(api.account.ensureAccount, {});
  return convex;
}

async function save(data: Record<string, unknown>, next: string) {
  const convex = await client();
  await convex.mutation(api.app.saveOnboarding, { data });
  redirect(next);
}

export async function createStudio(formData: FormData) {
  const name = String(formData.get('name') || '').trim();
  const role = String(formData.get('role') || '').trim();
  if (name.length < 2) return { error: 'Studio name is required (min 2 characters)' };
  if (!role) return { error: 'Role is required' };
  await save({ studioName: name, role }, '/onboarding/goal');
}

export async function saveGoal(formData: FormData) {
  const goal = String(formData.get('goal') || '');
  if (!goal) return { error: 'Please select a goal' };
  await save({ outcomeGoal: goal }, '/onboarding/platform');
}

export async function savePlatform(formData: FormData) {
  const platform = String(formData.get('platform') || '');
  const context = String(formData.get('context') || '');
  if (!platform || !context) return { error: 'Please select both a platform and context' };
  await save({ platform, context }, '/onboarding/creative-dna');
}

export async function saveCreativeDNA(formData: FormData) {
  const data = {
    brandEnergy: String(formData.get('brand_energy') || ''), editingPace: String(formData.get('editing_pace') || ''),
    visualStyle: String(formData.get('visual_style') || ''), textPersonality: String(formData.get('text_personality') || ''), musicEnergy: String(formData.get('music_energy') || ''),
  };
  for (const [key, value] of Object.entries(data)) {
    const optionKey = key.replace(/[A-Z]/g, m => `_${m.toLowerCase()}`) as keyof typeof CREATIVE_DNA_OPTIONS;
    if (!value || !CREATIVE_DNA_OPTIONS[optionKey].includes(value as never)) return { error: `Invalid ${key} selection` };
  }
  await save({ creativeDNA: data }, '/onboarding/identity');
}

export async function saveIdentity(formData: FormData) {
  const identityPresence = String(formData.get('identity_presence') || '');
  if (!identityPresence) return { error: 'Please select an identity presence option' };
  const actorId = String(formData.get('actor_id') || '');
  const assetPath = String(formData.get('identity_asset_path') || '');
  if (identityPresence === 'ai_actor' && !actorId) return { error: 'Please select an AI actor' };
  if (identityPresence === 'self' && !assetPath) return { error: 'Please upload your identity asset (video/photo)' };
  await save({ identityPresence, actorId: actorId || null, identityAssetPath: assetPath || null, identityAssetName: formData.get('identity_asset_name') || null }, '/onboarding/assets');
}

export async function saveAssets(formData: FormData) {
  const visuals = String(formData.get('visuals') || '[]');
  let parsed: unknown;
  try { parsed = JSON.parse(visuals); } catch { return { error: 'Invalid visuals data' }; }
  await save({ logoPath: formData.get('logo_path') || null, logoName: formData.get('logo_name') || null, visuals: parsed }, '/onboarding/message');
}

export async function saveMessageBlocks(formData: FormData) {
  const valueProposition = String(formData.get('value_proposition') || '');
  const emotionalPromise = String(formData.get('emotional_promise') || '');
  if (!valueProposition || !emotionalPromise) return { error: 'Value Proposition and Emotional Promise are required' };
  await save({ messageBlocks: { valueProposition, emotionalPromise, proofPoint: formData.get('proof_point') || null } }, '/onboarding/confirm');
}

export async function completeOnboarding() {
  const convex = await client();
  await convex.mutation(api.app.completeOnboarding, {});
  redirect('/dashboard');
}

export async function saveFriendlyOnboarding(formData: FormData) {
  const convex = await client();
  const studioName = String(formData.get('studioName') || '').trim();
  const data = {
    outcomeGoal: String(formData.get('goal') || 'social_content'),
    platform: String(formData.get('platform') || 'social'),
    creativeDNA: { visualStyle: String(formData.get('style') || 'expressive'), brandEnergy: 'warm' },
    mediaPreference: String(formData.get('media') || 'no_media_yet'),
    role: String(formData.get('role') || 'creator'),
  };
  if (studioName.length < 2) return { error: 'Give your studio a short name so you can find it later.' };
  await convex.mutation(api.app.saveFriendlyOnboarding, { studioName, data });
  redirect('/dashboard/create');
}
