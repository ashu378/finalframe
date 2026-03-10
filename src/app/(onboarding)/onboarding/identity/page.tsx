import { ensureOnboardingStep } from '@/lib/onboarding/access';
import { OnboardingStep } from '@/lib/onboarding/types';
import { IdentityForm } from './identity-form';

export default async function IdentityPage() {
    await ensureOnboardingStep(OnboardingStep.IDENTITY);

    return (
        <div className="space-y-6">
            <div className="space-y-2 text-center">
                <h1 className="text-2xl font-bold tracking-tight text-white mb-2">Who is the face of the content?</h1>
                <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                    Choose an AI avatar, use your own footage, or go voiceless.
                </p>
            </div>

            <IdentityForm />
        </div>
    );
}
