import { requireAuth } from '@/lib/guards';
import { getAssets, getStudioPresets } from '@/lib/assets/actions';
import { AssetLibraryClient } from '@/components/assets/asset-library-client';
import { UploadButton } from '@/components/assets/upload-button';
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
                <p className="text-muted-foreground">Your workspace could not be opened. Refresh the page or return to your dashboard.</p>
            </div>
        );
    }

    const { studioId } = studioRes;

    // 3. Fetch private assets for the studio
    const assets = await getAssets(studioId, '/');

    return (
        <div className="flex flex-1 flex-col space-y-10 ">
            <header className="flex flex-col gap-6 border-b border-border pb-8 sm:flex-row sm:items-end sm:justify-between">
                <div><h1 className="ff-display text-4xl font-semibold sm:text-5xl">Your media</h1><p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">Keep photos, clips, recordings and brand files together. Add a file to a project when you want to use it there.</p></div>
                <div className="shrink-0"><UploadButton studioId={studioId} /></div>
            </header>

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
