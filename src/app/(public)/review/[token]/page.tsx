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
        <div className="min-h-screen bg-zinc-950 text-white font-sans selection:bg-violet-500/30">
            {/* Header */}
            <header className="fixed top-0 left-0 right-0 z-50 h-20 border-b border-white/5 bg-zinc-950/80 backdrop-blur-xl flex items-center justify-between px-6 md:px-12">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                        <Sparkles className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold tracking-tight text-white uppercase">{project.name}</h1>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-zinc-400 uppercase font-black tracking-widest">{project.platform.replace('_', ' ')}</span>
                            <span className="w-1 h-1 rounded-full bg-zinc-600" />
                            <span className="text-[10px] text-zinc-400 uppercase font-black tracking-widest">{link.label || 'Studio Review'}</span>
                        </div>
                    </div>
                </div>

                <div className="hidden md:flex items-center gap-6">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-[10px] font-black text-emerald-400/80 uppercase tracking-widest">Secure Review Link</span>
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
            <footer className="py-12 border-t border-white/5 bg-zinc-950 text-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 transition-colors cursor-default">
                        <Sparkles className="w-4 h-4" />
                        <span className="text-sm font-bold tracking-tighter uppercase italic">FinalFrame Studio</span>
                    </div>
                    <p className="text-xs text-zinc-500">© 2026 FinalFrame — Professional Creative Production System</p>
                </div>
            </footer>
        </div>
    );
}
