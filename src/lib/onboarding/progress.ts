import { OnboardingStep } from './types';
import { api } from '../../../convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';

export async function getCurrentOnboardingStep(): Promise<OnboardingStep> {
  try {
    const convex = await getAuthenticatedConvexClient();
    const data = await convex.query(api.app.onboarding, {});
    if (!data || typeof data !== 'object') return OnboardingStep.WELCOME;
    const state = data as Record<string, unknown>;
    if (!state.studioName) return OnboardingStep.WELCOME;
    if (!state.outcomeGoal) return OnboardingStep.GOAL;
    if (!state.platform || !state.context) return OnboardingStep.PLATFORM;
    if (!state.creativeDNA) return OnboardingStep.CREATIVE_DNA;
    if (!state.identityPresence) return OnboardingStep.IDENTITY;
    if (!state.logoPath || !state.visuals) return OnboardingStep.ASSETS;
    if (!state.messageBlocks) return OnboardingStep.MESSAGE;
    return OnboardingStep.CONFIRM;
  } catch {
    return OnboardingStep.WELCOME;
  }
}
