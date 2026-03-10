import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ensureOnboardingStep } from '@/lib/onboarding/access';
import { OnboardingStep } from '@/lib/onboarding/types';
import { ArrowRight, Sparkles } from 'lucide-react';

export default async function WelcomePage() {
    await ensureOnboardingStep(OnboardingStep.WELCOME);

    return (
        <div className="space-y-12 text-center py-4">
            <div className="space-y-4">
                <h1 className="text-4xl md:text-5xl font-black tracking-[0.1em] text-zinc-50 uppercase italic">
                    FinalFrame // CORE
                </h1>
                <p className="text-metadata text-zinc-500 max-w-lg mx-auto leading-loose italic">
                    Setting up your studio...
                </p>
            </div>

            <div className="text-left bg-zinc-900 border border-zinc-800 p-10 rounded-sm shadow-3xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-primary/20" />
                <h2 className="text-sm font-black text-zinc-50 mb-8 flex items-center gap-4 uppercase tracking-[0.3em] italic">
                    <Sparkles className="w-5 h-5 text-primary" />
                    Studio Guidelines
                </h2>
                <ul className="space-y-5 text-metadata text-zinc-400 normal-case italic">
                    <li className="flex items-start gap-4 leading-loose group">
                        <span className="w-1.5 h-1.5 rounded-none bg-primary mt-2 shrink-0 group-hover:shadow-[0_0_10px_#fbbf24] transition-all" />
                        <span>FinalFrame is a <strong className="text-zinc-300">High-Precision Production System</strong>. No randomized hallucination.</span>
                    </li>
                    <li className="flex items-start gap-4 leading-loose group">
                        <span className="w-1.5 h-1.5 rounded-none bg-primary mt-2 shrink-0 group-hover:shadow-[0_0_10px_#fbbf24] transition-all" />
                        <span>We prioritize <strong className="text-zinc-300">Deterministic Control</strong> over stochastic generation.</span>
                    </li>
                    <li className="flex items-start gap-4 leading-loose group">
                        <span className="w-1.5 h-1.5 rounded-none bg-primary mt-2 shrink-0 group-hover:shadow-[0_0_10px_#fbbf24] transition-all" />
                        <span>Your <strong className="text-zinc-300">Creative DNA</strong> defines the master signal.</span>
                    </li>
                    <li className="flex items-start gap-4 leading-loose group">
                        <span className="w-1.5 h-1.5 rounded-none bg-primary mt-2 shrink-0 group-hover:shadow-[0_0_10px_#fbbf24] transition-all" />
                        <span>Registry Integrity: Uploaded material is verified and protected.</span>
                    </li>
                </ul>
            </div>

            <div className="pt-6">
                <Link href="/onboarding/studio" className="block">
                    <Button
                        size="lg"
                        className="primary-cta w-full"
                    >
                        Open my Studio
                        <ArrowRight className="w-4 h-4 ml-3" />
                    </Button>
                </Link>
            </div>
        </div>
    );
}
