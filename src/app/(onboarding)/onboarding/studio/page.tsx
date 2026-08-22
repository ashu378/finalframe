import { ensureOnboardingStep } from '@/lib/onboarding/access';
import { OnboardingStep } from '@/lib/onboarding/types';
import { StudioForm } from './studio-form';

export default async function StudioPage() {
    await ensureOnboardingStep(OnboardingStep.STUDIO);

    return (
        <div className="space-y-6">
            <div className="space-y-2 text-center">
                <h1 className="ff-display text-3xl font-semibold tracking-tight">Give your studio a name</h1>
                <p className="text-muted-foreground">
                    This is the friendly home for your video projects and media.
                </p>
            </div>

            <StudioForm />
        </div>
    );
}
