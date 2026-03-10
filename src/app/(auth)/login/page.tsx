/**
 * FinalFrame — Login Page
 */

import Link from 'next/link';
import { signIn } from '@/lib/auth/actions';

export const metadata = {
    title: 'Log In',
    description: 'Log in to your FinalFrame account',
};

export default function LoginPage() {
    return (
        <div className="bg-zinc-900 border border-zinc-800 p-10 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-10 opacity-[0.02] group-hover:opacity-5 transition-opacity duration-1000">
                <div className="w-32 h-32 border-2 border-primary rotate-12" />
            </div>
            <div className="text-center mb-10 relative z-10">
                <h1 className="text-lg font-black uppercase tracking-[0.3em] mb-4 text-zinc-50 italic">Registry Authorization</h1>
                <p className="text-metadata text-zinc-400 mt-6">
                    Define credentials to access production studio.
                </p>
            </div>

            <form action={signIn} className="flex flex-col gap-6">
                <div className="space-y-3">
                    <label htmlFor="email" className="text-metadata text-zinc-400 px-1">
                        Access ID (Email)
                    </label>
                    <input
                        type="email"
                        id="email"
                        name="email"
                        required
                        placeholder="PRODUCER_ID..."
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-5 py-4 text-sm font-bold text-white placeholder:text-zinc-600 focus:outline-none focus:border-primary/50 transition-all uppercase tracking-widest"
                    />
                </div>

                <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                        <label htmlFor="password" className="text-metadata text-zinc-400">
                            Authorization Key
                        </label>
                        <Link
                            href="/forgot-password"
                            className="text-metadata text-primary hover:text-white transition-colors underline underline-offset-4"
                        >
                            Recover Key
                        </Link>
                    </div>
                    <input
                        type="password"
                        id="password"
                        name="password"
                        required
                        placeholder="••••••••"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-5 py-4 text-sm font-bold text-white placeholder:text-zinc-600 focus:outline-none focus:border-primary/50 transition-all"
                    />
                </div>

                <button
                    type="submit"
                    className="primary-cta w-full mt-6"
                >
                    Authorize Studio Access
                </button>
            </form>

            <div className="mt-10 pt-8 border-t border-zinc-800 text-center px-4">
                <p className="text-metadata text-zinc-500 normal-case">
                    No active registry detected? {' '}
                    <Link href="/signup" className="text-white hover:text-primary font-black transition-colors underline underline-offset-4 decoration-primary/30 uppercase tracking-widest">
                        Initiate Enrollment
                    </Link>
                </p>
            </div>
        </div>
    );
}
