import { ensureOnboardingStep } from '@/lib/onboarding/access';
import { OnboardingStep } from '@/lib/onboarding/types';
import { MessageBlocksForm } from './message-blocks-form';

export default async function MessagePage() {
    await ensureOnboardingStep(OnboardingStep.MESSAGE);

    return (
        <div className="space-y-6">
            <div className="space-y-2 text-center">
                <h1 className="text-2xl font-bold tracking-tight text-white mb-2">Refine your Core Message</h1>
                <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                    The AI Director will use these pillars to write your scripts.
                </p>
            </div>

            <MessageBlocksForm />
        </div>
    );
}
