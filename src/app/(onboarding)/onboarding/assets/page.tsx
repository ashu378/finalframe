import { ensureOnboardingStep } from '@/lib/onboarding/access';
import { OnboardingStep } from '@/lib/onboarding/types';
import { AssetsForm } from './assets-form';

export default async function AssetsPage() {
    await ensureOnboardingStep(OnboardingStep.ASSETS);

    return (
        <div className="space-y-6">
            <div className="space-y-2 text-center">
                <h1 className="text-2xl font-bold tracking-tight text-white mb-2">Upload your Brand Assets</h1>
                <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                    We strictly use your assets for truth. We do not hallucinate products.
                </p>
            </div>

            <AssetsForm />
        </div>
    );
}
