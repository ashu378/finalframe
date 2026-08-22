import { notFound } from 'next/navigation';
import { getPublicReviewData } from '@/lib/review/actions';
import { ReviewClient } from '@/components/review/review-client';
import { Sparkles, Film, ShieldCheck } from 'lucide-react';

interface ReviewPageProps {
    params: Promise<{ token: string }>;
}

export default async function ReviewPage({ params }: ReviewPageProps) {
    const { token } = await params;
    const data = await getPublicReviewData(token);

    if (!data || !data.link) {
        notFound();
    }

    const { project, snapshot, layers, scenes, comments, link } = data;

    return (
        <div className="review-theme min-h-dvh bg-background text-foreground font-sans">
            {/* Header */}
            <header className="fixed left-0 right-0 top-0 z-50 flex min-h-20 items-center justify-between border-b border-border/70 bg-background/90 px-5 backdrop-blur-xl md:px-12">
                <div className="flex items-center gap-4">
                    <div className="grid size-10 place-items-center rounded-xl bg-foreground text-background">
                        <Sparkles className="size-5" />
                    </div>
                    <div>
                        <h1 className="text-lg font-semibold tracking-tight text-foreground">{project.name}</h1>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{project.platform.replace('_', ' ')}</span>
                            <span className="size-1 rounded-full bg-border" />
                            <span className="text-xs text-muted-foreground">{link.label || 'Video review'}</span>
                        </div>
                    </div>
                </div>

                <div className="hidden md:flex items-center gap-6">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-xs font-semibold text-[hsl(var(--success))]">Private review link</span>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="pt-32 pb-20 px-6 md:px-12 max-w-[1600px] mx-auto">
                <ReviewClient
                    project={project}
                    snapshot={snapshot}
                    layers={layers}
                    scenes={scenes}
                    initialComments={comments}
                    reviewLinkId={link.id}
                />
            </main>

            {/* Footer */}
            <footer className="border-t border-border/70 bg-secondary/35 py-12 text-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 transition-colors cursor-default">
                        <Sparkles className="w-4 h-4" />
                        <span className="text-sm font-semibold">FinalFrame review</span>
                    </div>
                    <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} FinalFrame</p>
                </div>
            </footer>
        </div>
    );
}
