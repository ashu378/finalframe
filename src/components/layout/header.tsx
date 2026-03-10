import Link from 'next/link';
import { getCurrentUser } from '@/lib/guards';
import { Sparkles } from 'lucide-react';

export async function Header() {
    const user = await getCurrentUser();

    return (
        <header className="fixed top-16 left-0 right-0 z-50 flex justify-center items-center gap-4 px-4 pointer-events-none">
            {/* Main Navigation Pill */}
            <div className="pointer-events-auto h-12 pl-1.5 pr-1.5 rounded-sm border border-white/10 bg-black/60 backdrop-blur-md shadow-lg shadow-black/40 flex items-center">

                {/* Logo Icon Only */}
                <Link href="/" className="flex items-center justify-center w-8 h-8 bg-primary rounded-sm shadow-lg shadow-primary/20 hover:scale-105 transition-transform mr-1">
                    <div className="w-2.5 h-2.5 bg-black rounded-sm" />
                </Link>

                {/* Navigation Links */}
                <nav className="hidden md:flex items-center gap-1">
                    <Link href="/pricing" className="text-[11px] uppercase tracking-widest font-bold text-white px-4 py-2 rounded-sm bg-zinc-800 transition-all hover:bg-zinc-700">
                        Pricing
                    </Link>
                    <Link href="/methodology" className="text-[11px] uppercase tracking-widest font-bold text-zinc-500 hover:text-white transition-colors px-4 py-2 rounded-sm hover:bg-white/5">
                        Process
                    </Link>
                    <Link href="/about" className="text-[11px] uppercase tracking-widest font-bold text-zinc-500 hover:text-white transition-colors px-4 py-2 rounded-sm hover:bg-white/5">
                        About Us
                    </Link>
                </nav>
            </div>

            <div className="pointer-events-auto hidden md:block">
                {user ? (
                    <Link
                        href="/dashboard"
                        className="h-10 px-8 flex items-center justify-center rounded-sm bg-primary text-black text-[11px] uppercase tracking-widest font-black shadow-xl transition-all hover:bg-white hover:-translate-y-0.5"
                    >
                        Enter Studio
                    </Link>
                ) : (
                    <Link
                        href="/login"
                        className="h-10 px-6 flex items-center justify-center rounded-sm bg-zinc-900 border border-white/10 text-white text-[11px] uppercase tracking-widest font-bold transition-all hover:bg-zinc-800"
                    >
                        Login
                    </Link>
                )}
            </div>
        </header>
    );
}
