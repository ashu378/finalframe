import { LoadingSpinner } from '@/components/ui/loading-spinner';

export default function DashboardLoading() {
    return (
        <div className="absolute inset-0 flex flex-col items-center justify-center animate-in fade-in duration-700 bg-background/50 backdrop-blur-sm z-50">
            <div className="flex flex-col items-center gap-6 relative px-6 text-center">
                {/* Visual Glow */}
                <div className="absolute inset-0 bg-primary/5 blur-[120px] rounded-full" />

                <div className="relative group">
                    <div className="absolute inset-0 bg-primary/10 blur-2xl rounded-sm animate-pulse" />
                    <LoadingSpinner size="xl" className="text-primary relative z-10" />
                </div>

                <div className="flex flex-col items-center gap-6 relative z-10">
                    <p className="text-[14px] font-black uppercase tracking-[0.3em] text-white italic">
                        Initializing Studio Environment
                    </p>

                    {/* Premium Progress Bar */}
                    <div className="w-72 h-1 bg-white/5 rounded-none overflow-hidden backdrop-blur-md border border-white/5 relative">
                        <div className="absolute top-0 left-0 h-full w-[40%] bg-primary shadow-[0_0_15px_rgba(251,191,36,0.5)] animate-progress" />
                    </div>

                    <p className="text-[9px] uppercase tracking-[0.4em] text-zinc-500 font-black mt-4 italic">
                        Authorizing Primary Terminal Link
                    </p>
                </div>
            </div>
        </div>
    );
}
