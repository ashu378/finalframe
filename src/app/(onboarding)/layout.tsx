import { OnboardingProgressBar } from '@/components/onboarding/progress-bar';
import { Sparkles } from 'lucide-react';

export default function OnboardingLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen relative flex items-center justify-center bg-slate-950 font-sans overflow-hidden py-10">
            {/* Ambient Background Effects */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-primary/10 rounded-none blur-[140px] animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-zinc-900/40 rounded-none blur-[140px] animate-pulse delay-1000" />
            </div>
            {/* Grainy Overlay */}
            <div className="absolute inset-0 z-[1] opacity-20 bg-[url('/noise.png')] mix-blend-overlay pointer-events-none" />

            {/* Main Container */}
            <main className="relative z-10 w-full max-w-2xl px-6 flex flex-col items-center">
                {/* Logo */}
                <div className="flex items-center gap-4 mb-14 animate-in fade-in slide-in-from-top-4 duration-1000">
                    <div className="relative">
                        <div className="absolute inset-0 bg-primary blur-md opacity-20" />
                        <Sparkles className="w-6 h-6 text-primary relative z-10" />
                    </div>
                    <span className="text-2xl font-black uppercase tracking-[0.4em] text-white italic">
                        FinalFrame
                    </span>
                </div>

                {/* Progress Bar */}
                <div className="w-full mb-8 animate-in fade-in duration-700 delay-100">
                    <OnboardingProgressBar />
                </div>

                {/* Card */}
                <div className="w-full bg-black/40 border border-white/5 p-12 md:p-14 rounded-sm shadow-3xl backdrop-blur-3xl animate-in zoom-in-95 fade-in duration-700 delay-200">
                    {children}
                </div>
            </main>
        </div>
    );
}
