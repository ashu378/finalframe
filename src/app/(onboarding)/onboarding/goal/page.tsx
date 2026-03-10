import { ensureOnboardingStep } from '@/lib/onboarding/access';
import { OnboardingStep } from '@/lib/onboarding/types';
import { GoalForm } from './goal-form';

export default async function GoalPage() {
    await ensureOnboardingStep(OnboardingStep.GOAL);

    return (
        <div className="space-y-8">
            <div className="space-y-2 text-center">
                <h1 className="text-2xl font-bold tracking-tight text-white mb-2">What is your primary goal?</h1>
                <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                    We will optimize the AI engine to prioritize this outcome for your projects.
                </p>
            </div>

            <GoalForm />
        </div>
    );
}
