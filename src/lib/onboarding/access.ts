import { redirect } from 'next/navigation';
import { getCurrentOnboardingStep } from './progress';
import { OnboardingStep, ONBOARDING_STEPS } from './types';

export async function ensureOnboardingStep(requiredStep: OnboardingStep) {
    const currentStep = await getCurrentOnboardingStep();

    const currentIndex = ONBOARDING_STEPS.indexOf(currentStep);
    const requiredIndex = ONBOARDING_STEPS.indexOf(requiredStep);

    // Special case: Allow navigating from Welcome (0) to Studio (1)
    // because Welcome relies on no DB state, same as Studio start.
    if (currentStep === OnboardingStep.WELCOME && requiredStep === OnboardingStep.STUDIO) {
        return;
    }

    // If trying to access a future step (and not the special case above)
    if (requiredIndex > currentIndex) {
        // Redirect to the current valid step
        redirect(`/onboarding/${pathForStep(currentStep)}`);
    }
}

function pathForStep(step: OnboardingStep): string {
    // Simple mapping, usually step name matches path
    // 'creative-dna' is dash-case in enum value
    return step;
}
