import { ensureOnboardingStep } from '@/lib/onboarding/access';
import { OnboardingStep } from '@/lib/onboarding/types';
import { IdentityForm } from './identity-form';

export default async function IdentityPage() {
    await ensureOnboardingStep(OnboardingStep.IDENTITY);

    return (
        <div className="space-y-6">
            <div className="space-y-2 text-center">
                <h1 className="ff-display text-3xl font-semibold tracking-tight text-foreground mb-2">Who or what should be on screen?</h1>
                <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                    Choose a person, character, voice, or no people at all.
                </p>
            </div>

            <IdentityForm />
        </div>
    );
}
