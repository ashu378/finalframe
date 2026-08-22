import { OnboardingProgressBar } from '@/components/onboarding/progress-bar';
import Link from 'next/link';
import { Film } from 'lucide-react';

export default function OnboardingLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="onboarding-theme ff-noise flex min-h-dvh items-center justify-center overflow-hidden bg-[#f4ead6] py-10">
            <main className="relative z-10 w-full max-w-2xl px-5 sm:px-6">
                <div className="mb-10 flex items-center justify-between"><Link href="/" className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-foreground text-background"><Film className="size-5" /></span><span className="ff-display text-xl font-semibold">FinalFrame</span></Link><span className="text-sm text-muted-foreground">A few quick questions</span></div>

                {/* Progress Bar */}
                <div className="w-full mb-8 animate-in fade-in duration-700 delay-100">
                    <OnboardingProgressBar />
                </div>

                {/* Card */}
                <div className="ff-card w-full p-6 sm:p-10 animate-in zoom-in-95 fade-in duration-700 delay-200">
                    {children}
                </div>
            </main>
        </div>
    );
}
