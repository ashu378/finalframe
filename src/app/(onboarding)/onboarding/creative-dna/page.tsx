import { ensureOnboardingStep } from '@/lib/onboarding/access';
import { OnboardingStep } from '@/lib/onboarding/types';
import { CreativeDNAForm } from './creative-dna-form';

export default async function CreativeDNAPage() {
    await ensureOnboardingStep(OnboardingStep.CREATIVE_DNA);

    return (
        <div className="space-y-6">
            <div className="space-y-2 text-center">
                <h1 className="text-2xl font-bold tracking-tight text-white mb-2">Define your Creative DNA</h1>
                <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                    These settings will govern every video we generate, ensuring brand consistency.
                </p>
            </div>

            <CreativeDNAForm />
        </div>
    );
}
