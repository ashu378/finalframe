import { ensureOnboardingStep } from '@/lib/onboarding/access';
import { OnboardingStep } from '@/lib/onboarding/types';
import { AssetsForm } from './assets-form';

export default async function AssetsPage() {
    await ensureOnboardingStep(OnboardingStep.ASSETS);

    return (
        <div className="space-y-6">
            <div className="space-y-2 text-center">
                <h1 className="ff-display text-3xl font-semibold tracking-tight text-foreground mb-2">Do you have media to bring?</h1>
                <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                    Logos, photos, clips, and references are welcome, but you can skip this and add them later.
                </p>
            </div>

            <AssetsForm />
        </div>
    );
}
