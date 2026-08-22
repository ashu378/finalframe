import { requireAuth } from '@/lib/guards';
import { getTemplates } from '@/lib/templates/actions';
import { LayoutTemplate, Sparkles } from 'lucide-react';
import { TemplateList } from '@/components/templates/template-list';
import { getStudioContext } from '@/lib/project/actions';

export default async function TemplatesPage() {
    // 1. Authenticate (memoized)
    await requireAuth();

    // 2. Fetch Studio Context
    const studioRes = await getStudioContext();

    if (!studioRes.success || !studioRes.studioId) {
        return (
            <div className="ff-card flex min-h-[400px] flex-col items-center justify-center p-8 text-center">
                <p className="text-muted-foreground">We could not find your studio yet. Please finish onboarding first.</p>
            </div>
        );
    }

    const { studioId } = studioRes;

    // 3. Fetch Templates
    const templates = await getTemplates(studioId);

    return (
        <div className="flex-1 flex flex-col space-y-10 animate-in fade-in duration-700">
            {/* Header */}
            <div className="flex flex-col gap-8 rounded-[1.5rem] bg-[#f4ead6] p-7 sm:p-10 md:flex-row md:items-end md:justify-between">
                <div className="space-y-4">
                    <div className="flex items-center gap-4">
                        <div className="grid size-12 place-items-center rounded-2xl bg-[#f6dfb1] text-foreground">
                            <LayoutTemplate className="w-7 h-7" />
                        </div>
                        <div className="space-y-1">
                            <h1 className="ff-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                                Start from a template
                                <div className="grid size-8 place-items-center rounded-xl bg-background/60">
                                    <Sparkles className="size-4 text-accent" />
                                </div>
                            </h1>
                            <p className="mt-2 text-sm text-muted-foreground">A useful first shape for the video you want to make.</p>
                        </div>
                    </div>
                    <p className="max-w-xl text-base leading-7 text-muted-foreground">
                        Choose a starting point for a social ad, product story, UGC review, cartoon, or launch video. You can change every part later.
                    </p>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1">
                <TemplateList templates={templates} studioId={studioId} />
            </div>
        </div>
    );
}
