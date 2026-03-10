import Link from 'next/link';

export default function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-background text-foreground font-sans selection:bg-primary/20 selection:text-primary">

            {/* --- Premium Background Effects --- */}
            <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-primary/10 blur-[150px] rounded-full mix-blend-screen animate-pulse duration-[4000ms]" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-zinc-900/50 blur-[150px] rounded-full mix-blend-screen" />
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-150 contrast-150" />
            </div>

            {/* --- Auth Container --- */}
            <div className="w-full max-w-md p-6 relative z-10 animate-in fade-in zoom-in-95 duration-500">

                {/* Logo Area */}
                <div className="flex flex-col items-center mb-8">
                    <Link href="/" className="group flex items-center gap-2 mb-2 transition-transform hover:scale-105">
                        <div className="w-8 h-8 rounded-sm bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
                            <div className="w-2.5 h-2.5 bg-black rounded-sm" />
                        </div>
                        <span className="text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70 uppercase tracking-[0.2em] italic">
                            FinalFrame
                        </span>
                    </Link>
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Studio_Grade_Production_OS</p>
                </div>

                {children}

                {/* Footer Links (Optional, usually TOS/Privacy) */}
                <div className="mt-8 text-center text-xs text-muted-foreground/50">
                    &copy; {new Date().getFullYear()} FinalFrame Inc.
                </div>
            </div>
        </div>
    );
}
