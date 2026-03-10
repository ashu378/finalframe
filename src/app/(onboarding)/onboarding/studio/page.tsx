import { ensureOnboardingStep } from '@/lib/onboarding/access';
import { OnboardingStep } from '@/lib/onboarding/types';
import { StudioForm } from './studio-form';

export default async function StudioPage() {
    await ensureOnboardingStep(OnboardingStep.STUDIO);

    return (
        <div className="space-y-6">
            <div className="space-y-2 text-center">
                <h1 className="text-2xl font-bold tracking-tight">Setup your Creative Studio</h1>
                <p className="text-muted-foreground">
                    This will be the home for all your projects and assets.
                </p>
            </div>

            <StudioForm />
        </div>
    );
}
