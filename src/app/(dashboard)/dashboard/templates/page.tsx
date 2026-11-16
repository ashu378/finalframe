import { requireAuth } from '@/lib/guards';
import { getTemplates } from '@/lib/templates/actions';
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
                <p className="text-muted-foreground">Your workspace could not be opened. Refresh the page or return to your dashboard.</p>
            </div>
        );
    }

    const { studioId } = studioRes;

    // 3. Fetch Templates
    const templates = await getTemplates(studioId);

    return (
        <div className="flex-1 flex flex-col space-y-10 ">
            <header className="border-b border-border pb-8">
                <h1 className="ff-display text-4xl font-semibold sm:text-5xl">Find your starting point.</h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">Choose a video type, then make it your own. Each template starts a separate project. You can change the story, style and media later.</p>
            </header>

            {/* Main Content */}
            <div className="flex-1">
                <TemplateList templates={templates} studioId={studioId} />
            </div>
        </div>
    );
}
