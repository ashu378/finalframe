import { ensureOnboardingStep } from '@/lib/onboarding/access';
import { OnboardingStep } from '@/lib/onboarding/types';
import { ConfirmForm } from './confirm-form';

export default async function ConfirmPage() {
    await ensureOnboardingStep(OnboardingStep.CONFIRM);

    return (
        <div className="space-y-6 text-center">
            <div className="space-y-2">
                <h1 className="ff-display text-3xl font-semibold tracking-tight">Your studio is ready.</h1>
                <p className="text-muted-foreground">
                    You can start with an idea now, and add the finer details when you need them.
                </p>
            </div>

            <ConfirmForm />
        </div>
    );
}
