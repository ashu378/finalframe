import { redirect } from 'next/navigation';
import { getCurrentOnboardingStep } from '@/lib/onboarding/progress';
import { OnboardingStep } from '@/lib/onboarding/types';

export default async function OnboardingRootPage() {
    const currentStep = await getCurrentOnboardingStep();

    switch (currentStep) {
        case OnboardingStep.WELCOME:
            redirect('/onboarding/welcome');
        case OnboardingStep.STUDIO: // If studio created partial? No, assumption is Welcome -> Studio
            // Wait, if step is STUDIO it means "Ready to create studio". 
            // If logic returns STUDIO, it redirects to /onboarding/studio ??
            // My logic: If no Studio -> WELCOME.
            // Ah, logic needs refinement. WELCOME is actually Step 1.
            // If they are at WELCOME, show WELCOME.
            // When they click "Get Started", they POST to create empty Studio? Or just navigate?
            // Just navigate to /onboarding/studio.
            // If they are at /onboarding/studio and haven't created one, progress says WELCOME?
            // Yes. So if progress says WELCOME, can they visit /onboarding/studio?
            // Yes, WELCOME is effectively "Not Started".
            // I'll adjust the redirect map.
            redirect('/onboarding/welcome');
        case OnboardingStep.GOAL:
            redirect('/onboarding/goal');
        case OnboardingStep.PLATFORM:
            redirect('/onboarding/platform');
        case OnboardingStep.CREATIVE_DNA:
            redirect('/onboarding/creative-dna');
        case OnboardingStep.IDENTITY:
            redirect('/onboarding/identity');
        case OnboardingStep.ASSETS:
            redirect('/onboarding/assets');
        case OnboardingStep.MESSAGE:
            redirect('/onboarding/message');
        case OnboardingStep.CONFIRM:
            redirect('/onboarding/confirm');
        default:
            redirect('/onboarding/welcome');
    }
}
