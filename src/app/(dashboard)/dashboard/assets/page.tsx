import { requireAuth } from '@/lib/guards';
import { getAssets, getStudioPresets } from '@/lib/assets/actions';
import { AssetLibraryClient } from '@/components/assets/asset-library-client';
import { UploadButton } from '@/components/assets/upload-button';
import { FolderOpen, Sparkles } from 'lucide-react';
import { getStudioContext } from '@/lib/project/actions';

export default async function AssetsPage() {
    // 1. Authenticate (memoized)
    await requireAuth();

    // 2. Parallel Fetch: Studio Context & Studio Presets
    const [studioRes, presets] = await Promise.all([
        getStudioContext(),
        getStudioPresets()
    ]);

    if (!studioRes.success || !studioRes.studioId) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <p className="text-zinc-500">No Studio found. Please onboard first.</p>
            </div>
        );
    }

    const { studioId } = studioRes;

    // 3. Fetch private assets for the studio
    const assets = await getAssets(studioId, '/');

    return (
        <div className="flex-1 flex flex-col h-full bg-zinc-950 text-zinc-50 p-10 space-y-12 animate-in fade-in duration-700">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-8 pb-10 border-b border-zinc-800">
                <div className="space-y-6">
                    <div className="flex items-center gap-6">
                        <div className="p-4 rounded-sm bg-primary/10 border border-primary/20 text-primary shadow-2xl shadow-primary/5 italic">
                            <FolderOpen className="w-8 h-8" />
                        </div>
                        <div className="space-y-1">
                            <h1 className="text-4xl font-black tracking-tighter text-zinc-50 uppercase italic flex items-center gap-5">
                                Material_Registry
                                <div className="p-2 rounded-sm bg-zinc-900 border border-zinc-800 group cursor-help transition-colors hover:border-primary/30 shadow-inner">
                                    <Sparkles className="w-4 h-4 text-zinc-600 group-hover:text-primary transition-colors" />
                                </div>
                            </h1>
                            <p className="text-metadata font-black text-zinc-500 uppercase tracking-[0.4em]">Index_Staging_Deployment</p>
                        </div>
                    </div>
                    <p className="text-sm font-bold text-zinc-400 uppercase tracking-[0.2em] max-w-xl leading-relaxed italic">
                        Manage studio creative materials. Synthesize high-fidelity assets for
                        deterministic production throughput.
                    </p>
                </div>

                <div className="shrink-0 pt-4">
                    <div className="[&_button]:h-14 [&_button]:px-10 [&_button]:font-black [&_button]:uppercase [&_button]:tracking-widest">
                        <UploadButton studioId={studioId} />
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1">
                <AssetLibraryClient
                    initialAssets={assets}
                    presets={presets}
                    studioId={studioId}
                />
            </div>
        </div>
    );
}
