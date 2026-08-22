import { ensureOnboardingStep } from '@/lib/onboarding/access';
import { OnboardingStep } from '@/lib/onboarding/types';
import { GoalForm } from './goal-form';

export default async function GoalPage() {
    await ensureOnboardingStep(OnboardingStep.GOAL);

    return (
        <div className="space-y-8">
            <div className="space-y-2 text-center">
                <h1 className="ff-display text-3xl font-semibold tracking-tight text-foreground mb-2">What should your video help you do?</h1>
                <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                    Choose the outcome that matters most for the work you make.
                </p>
            </div>

            <GoalForm />
        </div>
    );
}
