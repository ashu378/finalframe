import { FriendlyOnboardingForm } from '@/components/onboarding/friendly-onboarding-form';

export default async function OnboardingRootPage() {
    return <div className="space-y-8"><div><p className="ff-eyebrow">A short setup</p><h1 className="ff-display mt-4 text-4xl font-semibold sm:text-5xl">Let’s make your first video easier to start.</h1><p className="mt-4 max-w-xl leading-7 text-muted-foreground">Tell us a little about what you want to make. You can change everything later, and you can skip bringing media until you need it.</p></div><FriendlyOnboardingForm /></div>;
}
