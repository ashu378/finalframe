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
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <p className="text-zinc-500">No Studio found. Please onboard first.</p>
            </div>
        );
    }

    const { studioId } = studioRes;

    // 3. Fetch Templates
    const templates = await getTemplates(studioId);

    return (
        <div className="flex-1 flex flex-col h-full bg-background text-white p-10 space-y-12 animate-in fade-in duration-700">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-8 pb-4 border-b border-white/5">
                <div className="space-y-4">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-sm bg-primary/10 border border-primary/20 text-primary shadow-2xl shadow-primary/5 italic">
                            <LayoutTemplate className="w-7 h-7" />
                        </div>
                        <div className="space-y-1">
                            <h1 className="text-4xl font-black tracking-tighter text-white uppercase italic flex items-center gap-4">
                                Blueprint_Gallery
                                <div className="p-1.5 rounded-sm bg-white/5 border border-white/10 group cursor-help transition-colors hover:border-primary/30">
                                    <Sparkles className="w-3.5 h-3.5 text-zinc-400 group-hover:text-primary transition-colors" />
                                </div>
                            </h1>
                            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.4em]">Official_Studio_Presets</p>
                        </div>
                    </div>
                    <p className="text-[12px] font-bold text-zinc-500 uppercase tracking-[0.2em] max-w-xl leading-loose">
                        Select high-performance blueprints to initialize production.
                        Pre-configured vectors for mission-critical creative DNA.
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
