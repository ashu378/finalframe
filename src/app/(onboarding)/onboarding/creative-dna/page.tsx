import { ensureOnboardingStep } from '@/lib/onboarding/access';
import { OnboardingStep } from '@/lib/onboarding/types';
import { CreativeDNAForm } from './creative-dna-form';

export default async function CreativeDNAPage() {
    await ensureOnboardingStep(OnboardingStep.CREATIVE_DNA);

    return (
        <div className="space-y-6">
            <div className="space-y-2 text-center">
                <h1 className="ff-display text-3xl font-semibold tracking-tight text-foreground mb-2">What should it feel like?</h1>
                <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                    Pick a starting style. You can change it whenever a project calls for something different.
                </p>
            </div>

            <CreativeDNAForm />
        </div>
    );
}
