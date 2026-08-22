'use client';

import { usePathname } from 'next/navigation';

const STEPS = [
    { path: 'welcome', label: 'Welcome' },
    { path: 'studio', label: 'Your studio' },
    { path: 'goal', label: 'Your goal' },
    { path: 'platform', label: 'Where it goes' },
    { path: 'creative-dna', label: 'Your style' },
    { path: 'identity', label: 'People and voice' },
    { path: 'assets', label: 'Your media' },
    { path: 'message', label: 'Your message' },
    { path: 'confirm', label: 'Ready to make' }
];

export function OnboardingProgressBar() {
    const pathname = usePathname();
    const currentPath = pathname.split('/').pop();

    const activeIndex = STEPS.findIndex(step => step.path === currentPath);
    // Calculated progress: (current step index + 1) / total steps
    const progressPercent = ((activeIndex + 1) / STEPS.length) * 100;

    return (
        <div className="w-full space-y-3">
            <div className="flex justify-between items-end text-xs font-semibold text-muted-foreground px-1">
                <span>Step {activeIndex + 1} of {STEPS.length}</span>
                <span className="text-foreground">{STEPS[activeIndex]?.label || 'Getting started'}</span>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary relative">
                <div
                    className="h-full rounded-full bg-primary transition-all duration-700 ease-out relative"
                    style={{ width: `${Math.max(5, progressPercent)}%` }}
                >
                    <div className="absolute inset-x-0 bottom-0 h-[1px] bg-white/20" />
                </div>
            </div>
        </div>
    );
}
