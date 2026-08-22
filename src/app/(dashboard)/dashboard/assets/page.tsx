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
            <div className="ff-card flex min-h-[400px] flex-col items-center justify-center p-8 text-center">
                <p className="text-muted-foreground">We could not find your studio yet. Please finish onboarding first.</p>
            </div>
        );
    }

    const { studioId } = studioRes;

    // 3. Fetch private assets for the studio
    const assets = await getAssets(studioId, '/');

    return (
        <div className="flex flex-1 flex-col space-y-10 animate-in fade-in duration-700">
            {/* Header */}
            <div className="flex flex-col justify-between gap-8 rounded-[1.5rem] bg-[#f4ead6] p-7 sm:p-10 md:flex-row md:items-end">
                <div className="space-y-6">
                    <div className="flex items-center gap-4">
                        <div className="grid size-12 place-items-center rounded-2xl bg-[#f6dfb1] text-foreground">
                            <FolderOpen className="w-8 h-8" />
                        </div>
                        <div className="space-y-1">
                            <h1 className="ff-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                                Media library
                                <div className="grid size-8 place-items-center rounded-xl bg-background/60">
                                    <Sparkles className="size-4 text-accent" />
                                </div>
                            </h1>
                            <p className="mt-2 text-sm text-muted-foreground">Keep the pieces that make your videos feel like yours.</p>
                        </div>
                    </div>
                    <p className="max-w-xl text-base leading-7 text-muted-foreground">
                        Upload logos, products, characters, voice notes, footage, backgrounds, and references. Add them to a project whenever they are useful.
                    </p>
                </div>

                <div className="shrink-0 pt-4">
                    <div className="[&_button]:min-h-11 [&_button]:rounded-full [&_button]:px-5 [&_button]:font-semibold">
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
