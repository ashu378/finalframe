import { ensureOnboardingStep } from '@/lib/onboarding/access';
import { OnboardingStep } from '@/lib/onboarding/types';
import { PlatformForm } from './platform-form';

export default async function PlatformPage() {
    await ensureOnboardingStep(OnboardingStep.PLATFORM);

    return (
        <div className="space-y-6">
            <div className="space-y-2 text-center">
                <h1 className="ff-display text-3xl font-semibold tracking-tight text-foreground mb-2">Where will people watch it?</h1>
                <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                    We will start with the right shape and rhythm for the place you want to share it.
                </p>
            </div>

            <PlatformForm />
        </div>
    );
}
