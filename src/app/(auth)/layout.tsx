import Link from 'next/link';
import { Film } from 'lucide-react';

export default function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="ff-noise flex min-h-dvh w-full items-center justify-center overflow-hidden bg-[#f4ead6] px-5 py-12 text-foreground">
            <div className="relative z-10 w-full max-w-md animate-in fade-in zoom-in-95 duration-500">

                {/* Logo Area */}
                <div className="mb-8 flex flex-col items-center">
                    <Link href="/" className="group mb-2 flex items-center gap-3 transition-transform hover:scale-105">
                        <span className="grid size-10 place-items-center rounded-xl bg-foreground text-background"><Film className="size-5" /></span>
                        <span className="ff-display text-2xl font-semibold">FinalFrame</span>
                    </Link>
                    <p className="text-sm text-muted-foreground">A calmer way to make video</p>
                </div>

                {children}

                {/* Footer Links (Optional, usually TOS/Privacy) */}
                <div className="mt-8 text-center text-xs text-muted-foreground">
                    &copy; {new Date().getFullYear()} FinalFrame · <Link href="/legal/privacy" className="underline underline-offset-4">Privacy</Link>
                </div>
            </div>
        </div>
    );
}
