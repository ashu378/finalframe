import { ensureOnboardingStep } from '@/lib/onboarding/access';
import { OnboardingStep } from '@/lib/onboarding/types';
import { MessageBlocksForm } from './message-blocks-form';

export default async function MessagePage() {
    await ensureOnboardingStep(OnboardingStep.MESSAGE);

    return (
        <div className="space-y-6">
            <div className="space-y-2 text-center">
                <h1 className="ff-display text-3xl font-semibold tracking-tight text-foreground mb-2">What do you want people to remember?</h1>
                <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                    A few plain-language notes help us keep the video focused.
                </p>
            </div>

            <MessageBlocksForm />
        </div>
    );
}
