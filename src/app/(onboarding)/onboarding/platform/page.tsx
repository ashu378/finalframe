import { ensureOnboardingStep } from '@/lib/onboarding/access';
import { OnboardingStep } from '@/lib/onboarding/types';
import { PlatformForm } from './platform-form';

export default async function PlatformPage() {
    await ensureOnboardingStep(OnboardingStep.PLATFORM);

    return (
        <div className="space-y-6">
            <div className="space-y-2 text-center">
                <h1 className="text-2xl font-bold tracking-tight text-white mb-2">Where will this content live?</h1>
                <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                    We tune aspect ratios, safe zones, and pacing for the destination's best practices.
                </p>
            </div>

            <PlatformForm />
        </div>
    );
}
