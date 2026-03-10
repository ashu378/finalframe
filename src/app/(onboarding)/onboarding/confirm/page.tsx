import { ensureOnboardingStep } from '@/lib/onboarding/access';
import { OnboardingStep } from '@/lib/onboarding/types';
import { ConfirmForm } from './confirm-form';

export default async function ConfirmPage() {
    await ensureOnboardingStep(OnboardingStep.CONFIRM);

    return (
        <div className="space-y-6 text-center">
            <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight">You are ready.</h1>
                <p className="text-muted-foreground">
                    Your studio is set up and calibrated.
                </p>
            </div>

            <ConfirmForm />
        </div>
    );
}
