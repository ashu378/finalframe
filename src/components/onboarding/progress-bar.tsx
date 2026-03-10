'use client';

import { usePathname } from 'next/navigation';

const STEPS = [
    { path: 'welcome', label: 'Welcome' },
    { path: 'studio', label: 'Studio' },
    { path: 'goal', label: 'Goal' },
    { path: 'platform', label: 'Platform' },
    { path: 'creative-dna', label: 'Creative DNA' },
    { path: 'identity', label: 'Identity' },
    { path: 'assets', label: 'Assets' },
    { path: 'message', label: 'Message' },
    { path: 'confirm', label: 'Confirm' }
];

export function OnboardingProgressBar() {
    const pathname = usePathname();
    const currentPath = pathname.split('/').pop();

    const activeIndex = STEPS.findIndex(step => step.path === currentPath);
    // Calculated progress: (current step index + 1) / total steps
    const progressPercent = ((activeIndex + 1) / STEPS.length) * 100;

    return (
        <div className="w-full space-y-3">
            <div className="flex justify-between items-end text-[9px] font-black uppercase tracking-[0.25em] text-zinc-600 px-1">
                <span className="text-white font-black italic">PHASE_{activeIndex + 1} // TOTAL_{STEPS.length}</span>
                <span className="text-primary italic">{STEPS[activeIndex]?.label?.toUpperCase() || 'CORE_CONFIGURATION'}</span>
            </div>

            <div className="h-1 w-full bg-black/40 rounded-none overflow-hidden border border-white/5 relative">
                <div
                    className="h-full bg-primary shadow-[0_0_15px_rgba(251,191,36,0.3)] transition-all duration-700 ease-out rounded-none relative"
                    style={{ width: `${Math.max(5, progressPercent)}%` }}
                >
                    <div className="absolute inset-x-0 bottom-0 h-[1px] bg-white/20" />
                </div>
            </div>
        </div>
    );
}
